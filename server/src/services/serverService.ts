import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { encrypt } from "../crypto.js";
import { execCommand, invalidateSudoCache, resolveSudoMode } from "../ssh/client.js";
import { testNpmConnection } from "./npmIntegration.js";
import type { AuthType, ServerKind, ServerRow } from "../types.js";

export class DuplicateServerError extends Error {}

const KIND_DEFAULTS: Record<
  ServerKind,
  { reload: string; test: string; configPaths: string[]; versionCommand: string }
> = {
  nginx: {
    reload: "sudo systemctl reload nginx",
    test: "sudo nginx -t",
    configPaths: ["/etc/nginx/sites-enabled/*", "/etc/nginx/conf.d/*.conf"],
    versionCommand: "nginx -v",
  },
  apache: {
    reload: "sudo systemctl reload apache2",
    test: "sudo apachectl configtest",
    configPaths: ["/etc/apache2/sites-enabled/*.conf", "/etc/httpd/conf.d/*.conf"],
    versionCommand: "apachectl -v",
  },
  haproxy: {
    reload: "sudo systemctl reload haproxy",
    test: "sudo haproxy -c -f /etc/haproxy/haproxy.cfg",
    configPaths: ["/etc/haproxy/haproxy.cfg"],
    versionCommand: "haproxy -v",
  },
  npm: {
    reload: "",
    test: "",
    configPaths: [],
    versionCommand: "",
  },
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function assertNoDuplicate(host: string, name: string, excludeId?: string) {
  const dup = db
    .prepare(
      `SELECT id, name, host FROM servers WHERE (lower(trim(host)) = ? OR lower(trim(name)) = ?)${
        excludeId ? " AND id != ?" : ""
      }`,
    )
    .get(
      ...(excludeId ? [normalize(host), normalize(name), excludeId] : [normalize(host), normalize(name)]),
    ) as { id: string; name: string; host: string } | undefined;
  if (dup) {
    throw new DuplicateServerError(
      normalize(dup.host) === normalize(host)
        ? `Сервер с хостом "${host}" уже добавлен (${dup.name})`
        : `Сервер с именем "${name}" уже существует`,
    );
  }
}

export interface ServerInput {
  name: string;
  kind?: ServerKind;
  groupId?: string | null;
  host: string;
  port?: number;
  sshUser: string;
  authType: AuthType;
  secret: string;
  sudoPassword?: string;
  reloadCommand?: string;
  testCommand?: string;
  configPaths?: string[];
}

export function createServer(input: ServerInput): ServerRow {
  assertNoDuplicate(input.host, input.name);
  const id = uuid();
  const kind = input.kind ?? "nginx";
  const defaults = KIND_DEFAULTS[kind];
  db.prepare(
    `INSERT INTO servers (id, name, kind, group_id, host, port, ssh_user, auth_type, secret_encrypted, sudo_password_encrypted, reload_command, test_command, config_paths)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    kind,
    input.groupId ?? null,
    input.host,
    input.port ?? 22,
    input.sshUser,
    input.authType,
    encrypt(input.secret),
    input.sudoPassword ? encrypt(input.sudoPassword) : null,
    input.reloadCommand ?? defaults.reload,
    input.testCommand ?? defaults.test,
    JSON.stringify(input.configPaths ?? defaults.configPaths),
  );
  return getServer(id)!;
}

export function updateServer(id: string, input: Partial<ServerInput>): ServerRow | undefined {
  const existing = getServer(id);
  if (!existing) return undefined;
  assertNoDuplicate(input.host ?? existing.host, input.name ?? existing.name, id);
  const groupId = "groupId" in input ? (input.groupId ?? null) : existing.group_id;
  const sudoPassword = !("sudoPassword" in input)
    ? existing.sudo_password_encrypted
    : input.sudoPassword
      ? encrypt(input.sudoPassword)
      : null;
  db.prepare(
    `UPDATE servers SET name=?, kind=?, group_id=?, host=?, port=?, ssh_user=?, auth_type=?, secret_encrypted=?, sudo_password_encrypted=?, reload_command=?, test_command=?, config_paths=? WHERE id=?`,
  ).run(
    input.name ?? existing.name,
    input.kind ?? existing.kind,
    groupId,
    input.host ?? existing.host,
    input.port ?? existing.port,
    input.sshUser ?? existing.ssh_user,
    input.authType ?? existing.auth_type,
    input.secret ? encrypt(input.secret) : existing.secret_encrypted,
    sudoPassword,
    input.reloadCommand ?? existing.reload_command,
    input.testCommand ?? existing.test_command,
    input.configPaths ? JSON.stringify(input.configPaths) : existing.config_paths,
    id,
  );
  invalidateSudoCache(id);
  return getServer(id);
}

export function getServer(id: string): ServerRow | undefined {
  return db.prepare(`SELECT * FROM servers WHERE id=?`).get(id) as ServerRow | undefined;
}

export function listServers(): ServerRow[] {
  return db.prepare(`SELECT * FROM servers ORDER BY name`).all() as ServerRow[];
}

export function deleteServer(id: string) {
  db.prepare(`DELETE FROM servers WHERE id=?`).run(id);
  invalidateSudoCache(id);
}

export async function testConnection(server: ServerRow): Promise<{ ok: boolean; message: string }> {
  if (server.kind === "npm") {
    const result = await testNpmConnection(server);
    db.prepare(`UPDATE servers SET status=?, last_error=?, last_checked_at=datetime('now') WHERE id=?`).run(
      result.ok ? "online" : "offline",
      result.ok ? null : result.message,
      server.id,
    );
    return result;
  }
  const versionCommand = KIND_DEFAULTS[server.kind].versionCommand;
  try {
    const { stdout, stderr, code } = await execCommand(server, versionCommand);
    if (code === 0) {
      db.prepare(
        `UPDATE servers SET status='online', last_error=NULL, last_checked_at=datetime('now') WHERE id=?`,
      ).run(server.id);
      let message = (stdout + stderr).trim() || "Подключение успешно";
      if (server.ssh_user !== "root") {
        const mode = await resolveSudoMode(server).catch(() => "unavailable" as const);
        if (mode === "unavailable") {
          message +=
            "\nВнимание: пользователь не root и у него нет sudo без пароля (NOPASSWD), а пароль sudo не задан — " +
            "сканирование и установка сертификатов не будут работать. Укажите пароль sudo или настройте sudoers.";
        }
      }
      return { ok: true, message };
    }
    db.prepare(`UPDATE servers SET status='error', last_error=?, last_checked_at=datetime('now') WHERE id=?`).run(
      stderr,
      server.id,
    );
    return { ok: false, message: stderr || `${versionCommand} завершился с ошибкой` };
  } catch (err) {
    db.prepare(`UPDATE servers SET status='offline', last_error=?, last_checked_at=datetime('now') WHERE id=?`).run(
      (err as Error)?.message ?? String(err),
      server.id,
    );
    return { ok: false, message: (err as Error)?.message ?? String(err) };
  }
}

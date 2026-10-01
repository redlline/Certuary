import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { decrypt } from "../crypto.js";
import { logEvent } from "./eventService.js";
import type { ServerRow } from "../types.js";

interface NpmProxyHost {
  id: number;
  domain_names?: string[];
  certificate?: {
    id: number;
    expires_on?: string;
    created_on?: string;
    provider?: string;
  } | null;
}

export function npmBaseUrl(server: ServerRow): string {
  return `http://${server.host}:${server.port}`;
}

export async function npmLogin(server: ServerRow): Promise<string> {
  const secret = decrypt(server.secret_encrypted);
  const res = await fetch(`${npmBaseUrl(server)}/api/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: server.ssh_user, secret }),
  });
  if (!res.ok) {
    throw new Error(`Не удалось авторизоваться в NPM API (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function testNpmConnection(server: ServerRow): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await npmLogin(server);
    const res = await fetch(`${npmBaseUrl(server)}/api/nginx/proxy-hosts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, message: `NPM API вернул ${res.status}` };
    const hosts = (await res.json()) as unknown[];
    return { ok: true, message: `Подключение успешно, проксируемых хостов: ${hosts.length}` };
  } catch (err) {
    return { ok: false, message: (err as Error)?.message ?? String(err) };
  }
}

export async function renewNpmCertificate(
  server: ServerRow,
  npmCertId: number,
): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await npmLogin(server);
    const res = await fetch(`${npmBaseUrl(server)}/api/nginx/certificates/${npmCertId}/renew`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      logEvent(
        server.id,
        null,
        "renew",
        `NPM: обновление сертификата #${npmCertId} не удалось (${res.status}): ${text}`,
        false,
      );
      return { ok: false, message: `NPM вернул ${res.status}: ${text}` };
    }
    logEvent(server.id, null, "renew", `NPM: сертификат #${npmCertId} успешно обновлён через Let's Encrypt`, true);
    return { ok: true, message: "Сертификат успешно обновлён через Let's Encrypt" };
  } catch (err) {
    logEvent(
      server.id,
      null,
      "renew",
      `NPM: обновление сертификата #${npmCertId} не удалось: ${(err as Error)?.message ?? err}`,
      false,
    );
    return { ok: false, message: (err as Error)?.message ?? String(err) };
  }
}

export async function uploadNpmCustomCertificate(
  server: ServerRow,
  proxyHostId: number,
  niceName: string,
  certPem: string,
  keyPem: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await npmLogin(server);
    const authHeader = { Authorization: `Bearer ${token}` };
    const createRes = await fetch(`${npmBaseUrl(server)}/api/nginx/certificates`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "other", nice_name: niceName }),
    });
    if (!createRes.ok) {
      throw new Error(
        `Не удалось создать запись сертификата в NPM (${createRes.status}): ${(await createRes.text()).slice(0, 200)}`,
      );
    }
    const created = (await createRes.json()) as { id: number };
    const form = new FormData();
    form.append("certificate", new Blob([certPem], { type: "application/x-pem-file" }), "certificate.pem");
    form.append("certificate_key", new Blob([keyPem], { type: "application/x-pem-file" }), "certificate_key.pem");
    const uploadRes = await fetch(`${npmBaseUrl(server)}/api/nginx/certificates/${created.id}/upload`, {
      method: "POST",
      headers: authHeader,
      body: form,
    });
    if (!uploadRes.ok) {
      throw new Error(
        `Не удалось загрузить файлы сертификата в NPM (${uploadRes.status}): ${(await uploadRes.text()).slice(0, 200)}`,
      );
    }
    const getHostRes = await fetch(`${npmBaseUrl(server)}/api/nginx/proxy-hosts/${proxyHostId}`, {
      headers: authHeader,
    });
    if (!getHostRes.ok) {
      throw new Error(
        `Сертификат загружен (#${created.id}), но не удалось прочитать proxy host ${proxyHostId} (${getHostRes.status}) — привяжите сертификат к хосту вручную в NPM`,
      );
    }
    const hostData = await getHostRes.json();
    const putRes = await fetch(`${npmBaseUrl(server)}/api/nginx/proxy-hosts/${proxyHostId}`, {
      method: "PUT",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ ...(hostData as object), certificate_id: created.id }),
    });
    if (!putRes.ok) {
      throw new Error(
        `Сертификат загружен в NPM (#${created.id}), но не удалось привязать его к хосту (${putRes.status}) — привяжите вручную в NPM: ${(await putRes.text()).slice(0, 200)}`,
      );
    }
    logEvent(
      server.id,
      null,
      "upload",
      `NPM: загружен и привязан собственный сертификат (cert #${created.id}) для host ${proxyHostId}`,
      true,
    );
    return { ok: true, message: "Сертификат успешно загружен и привязан в NPM" };
  } catch (err) {
    logEvent(
      server.id,
      null,
      "upload",
      `NPM: загрузка собственного сертификата не удалась: ${(err as Error)?.message ?? err}`,
      false,
    );
    return { ok: false, message: (err as Error)?.message ?? String(err) };
  }
}

export async function scanNpmServer(server: ServerRow) {
  try {
    const token = await npmLogin(server);
    const res = await fetch(`${npmBaseUrl(server)}/api/nginx/proxy-hosts?expand=certificate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`NPM API вернул ${res.status} при запросе proxy-hosts`);
    const hosts = (await res.json()) as NpmProxyHost[];
    for (const h of hosts) {
      const domains = h.domain_names ?? [];
      if (domains.length === 0) continue;
      const domain = domains[0];
      const configFilePath = `npm:proxy-host:${h.id}`;
      let row = db
        .prepare(`SELECT id FROM sites WHERE server_id = ? AND config_file_path = ?`)
        .get(server.id, configFilePath) as { id: string } | undefined;
      if (!row) {
        const id = uuid();
        db.prepare(`INSERT INTO sites (id, server_id, domain, config_file_path, https_port) VALUES (?, ?, ?, ?, 443)`).run(
          id,
          server.id,
          domain,
          configFilePath,
        );
        row = { id };
      } else {
        db.prepare(`UPDATE sites SET domain = ? WHERE id = ?`).run(domain, row.id);
      }
      const cert = h.certificate;
      if (!cert || !cert.expires_on) continue;
      const notAfter = new Date(cert.expires_on).toISOString();
      const notBefore = cert.created_on ? new Date(cert.created_on).toISOString() : null;
      const fingerprint = `npm-cert-${cert.id}-${cert.expires_on}`;
      const existing = db
        .prepare(`SELECT id, fingerprint FROM certificates WHERE site_id = ?`)
        .get(row.id) as { id: string; fingerprint: string | null } | undefined;
      if (existing) {
        const changed = existing.fingerprint !== fingerprint;
        db.prepare(
          `UPDATE certificates SET subject_cn=?, sans=?, issuer=?, not_before=?, not_after=?, fingerprint=?, last_synced_at=datetime('now')${
            changed ? ", notified_thresholds='[]'" : ""
          } WHERE id=?`,
        ).run(domain, JSON.stringify(domains), cert.provider ?? null, notBefore, notAfter, fingerprint, existing.id);
      } else {
        db.prepare(
          `INSERT INTO certificates (id, site_id, subject_cn, sans, issuer, not_before, not_after, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(uuid(), row.id, domain, JSON.stringify(domains), cert.provider ?? null, notBefore, notAfter, fingerprint);
      }
    }
    db.prepare(`UPDATE servers SET status='online', last_error=NULL, last_checked_at=datetime('now') WHERE id=?`).run(
      server.id,
    );
    logEvent(server.id, null, "scan", `NPM: найдено ${hosts.length} проксируемых хостов`, true);
  } catch (err) {
    db.prepare(`UPDATE servers SET status='offline', last_error=?, last_checked_at=datetime('now') WHERE id=?`).run(
      (err as Error)?.message ?? String(err),
      server.id,
    );
    logEvent(server.id, null, "scan", `NPM сканирование не удалось: ${(err as Error)?.message ?? err}`, false);
  }
}

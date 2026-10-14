import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { execCommand } from "../ssh/client.js";
import { getSettings } from "./settingsService.js";
import { sendTelegramMessage } from "./notificationService.js";
import { logEvent } from "./eventService.js";
import type { ServerRow } from "../types.js";

export interface DiskSample {
  mount: string;
  totalBytes: number;
  usedBytes: number;
  usePct: number;
}

export interface MinioSample {
  alias: string;
  usedBytes: number | null;
  totalBytes: number | null;
  usePct: number | null;
  objects: number | null;
}

const MINIO_ALIASES = ["mercury", "venus", "saturn", "jupiter"];

function parseDf(stdout: string): DiskSample[] {
  const out: DiskSample[] = [];
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const total = Number(parts[1]);
    const used = Number(parts[2]);
    const pct = parseFloat(parts[3]);
    const mount = parts.slice(4).join(" ") || parts[0];
    if (!Number.isFinite(total) || total <= 0) continue;
    out.push({ mount, totalBytes: total, usedBytes: used, usePct: Number.isFinite(pct) ? pct : (used / total) * 100 });
  }
  return out;
}

export async function collectServerDisks(server: ServerRow): Promise<DiskSample[]> {
  const res = await execCommand(
    server,
    "df -B1 -P -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null | awk 'NR>1 {print $NF\"|\"$2\"|\"$3\"|\"$5}' | tr -d '%'",
  );
  const lines = res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [mount, total, used, pct] = l.split("|");
      return `${mount} ${total} ${used} ${pct}`;
    })
    .join("\n");
  return parseDf(lines);
}

function previousBand(serverId: string, mount: string, warn: number, crit: number): number {
  const prev = db
    .prepare(
      `SELECT use_pct FROM disk_samples WHERE server_id=? AND mount=? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(serverId, mount) as { use_pct: number } | undefined;
  if (!prev) return 0;
  return prev.use_pct >= crit ? 2 : prev.use_pct >= warn ? 1 : 0;
}

export async function collectAllDisks(): Promise<void> {
  const servers = db.prepare(`SELECT * FROM servers`).all() as ServerRow[];
  const settings = getSettings();
  const warn = settings.disk_warn_pct ?? 80;
  const crit = settings.disk_crit_pct ?? 90;
  for (const server of servers) {
    let samples: DiskSample[];
    try {
      samples = await collectServerDisks(server);
    } catch (err) {
      logEvent(server.id, null, "disk-check", `Не удалось собрать df: ${(err as Error).message}`, false);
      continue;
    }
    for (const s of samples) {
      const band = s.usePct >= crit ? 2 : s.usePct >= warn ? 1 : 0;
      const prevBand = previousBand(server.id, s.mount, warn, crit);
      db.prepare(`INSERT INTO disk_samples (id, server_id, mount, total_bytes, used_bytes, use_pct) VALUES (?,?,?,?,?,?)`).run(
        randomUUID(),
        server.id,
        s.mount,
        s.totalBytes,
        s.usedBytes,
        s.usePct,
      );
      if (band > prevBand) {
        const level = band === 2 ? "🔴" : "⚠️";
        const gb = (n: number) => (n / 1073741824).toFixed(1);
        const text = `${level} Диск <b>${escapeHtml(s.mount)}</b> на ${escapeHtml(server.name)} заполнен на <b>${s.usePct.toFixed(0)}%</b> (${gb(s.usedBytes)}/${gb(s.totalBytes)} GB)`;
        const sent = await sendTelegramMessage(text);
        logEvent(server.id, null, "disk-alert", text.replace(/<[^>]+>/g, ""), sent.ok);
        // auto-trigger migration when the mercury host disk crosses the threshold
        if (settings.rotation_auto && settings.mcli_server_id === server.id && s.usePct >= settings.rotation_trigger_pct) {
          const { maybeAutoStartRotation } = await import("./rotationService.js");
          maybeAutoStartRotation(s.usePct).catch(() => {});
        }
      }
    }
  }
}

interface McAdminInfo {
  info?: {
    usage?: { size?: number };
    objects?: { count?: number };
    buckets?: { count?: number };
    drives?: { totalspace?: number; usedspace?: number; totalSpace?: number; usedSpace?: number }[];
    servers?: {
      drives?: { totalspace?: number; usedspace?: number; totalSpace?: number; usedSpace?: number }[];
    }[];
  };
  status?: string;
}

export async function collectMinioStats(mcliServer: ServerRow): Promise<MinioSample[]> {
  const samples: MinioSample[] = [];
  for (const alias of MINIO_ALIASES) {
    // read-only: cluster usage summary, never touches data
    const res = await execCommand(
      mcliServer,
      `export PATH="$PATH:$HOME/bin:$HOME/.local/bin:/usr/local/bin"; mcli admin info ${alias} --json 2>/dev/null`,
    );
    let info: McAdminInfo;
    try {
      info = JSON.parse(res.stdout) as McAdminInfo;
    } catch {
      samples.push({ alias, usedBytes: null, totalBytes: null, usePct: null, objects: null });
      continue;
    }
    const drives =
      info.info?.drives ?? info.info?.servers?.flatMap((s) => s.drives ?? []) ?? [];
    const totalBytes =
      drives.reduce((a, d) => a + (d.totalSpace ?? d.totalspace ?? 0), 0) || null;
    const usedBytes =
      drives.reduce((a, d) => a + (d.usedSpace ?? d.usedspace ?? 0), 0) ||
      info.info?.usage?.size ||
      null;
    const objects = info.info?.objects?.count ?? null;
    const usePct = totalBytes && usedBytes !== null ? (usedBytes / totalBytes) * 100 : null;
    samples.push({ alias, usedBytes, totalBytes, usePct, objects });
  }
  return samples;
}

export async function collectMinio(): Promise<void> {
  const settings = getSettings();
  if (!settings.mcli_server_id) return;
  const server = db.prepare(`SELECT * FROM servers WHERE id=?`).get(settings.mcli_server_id) as ServerRow | undefined;
  if (!server) return;
  try {
    const samples = await collectMinioStats(server);
    for (const s of samples) {
      db.prepare(`INSERT INTO minio_samples (id, alias, used_bytes, total_bytes, use_pct, objects) VALUES (?,?,?,?,?,?)`).run(
        randomUUID(),
        s.alias,
        s.usedBytes,
        s.totalBytes,
        s.usePct,
        s.objects,
      );
    }
  } catch (err) {
    logEvent(server.id, null, "minio-check", `mcli admin info не удался: ${(err as Error).message}`, false);
  }
}

export function latestDisks() {
  return db
    .prepare(
      `SELECT d.server_id, d.mount, d.total_bytes, d.used_bytes, d.use_pct, d.created_at, sv.name as server_name
       FROM disk_samples d
       JOIN servers sv ON sv.id = d.server_id
       WHERE d.id IN (
         SELECT id FROM disk_samples d2
         WHERE d2.server_id = d.server_id AND d2.mount = d.mount
         ORDER BY d2.created_at DESC, d2.rowid DESC LIMIT 1
       )
       ORDER BY d.use_pct DESC`,
    )
    .all();
}

export function latestMinio() {
  return db
    .prepare(
      `SELECT m.alias, m.used_bytes, m.total_bytes, m.use_pct, m.objects, m.created_at
       FROM minio_samples m
       WHERE m.id IN (
         SELECT id FROM minio_samples m2 WHERE m2.alias = m.alias
         ORDER BY m2.created_at DESC, m2.rowid DESC LIMIT 1
       )`,
    )
    .all();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

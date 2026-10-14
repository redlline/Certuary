import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { execCommand } from "../ssh/client.js";
import { getSettings } from "./settingsService.js";
import { sendTelegramMessage } from "./notificationService.js";
import { logEvent } from "./eventService.js";
import type { RotationRunRow, RotationProgressRow, ServerRow } from "../types.js";

// Migration pipeline: mercury/original old mp4s → delete originals, copy
// mercury/movies/<id> to venus+saturn+jupiter, then delete from mercury.
// Mirrors the manual flow in del-org/, driven through screen sessions so it
// survives certuary restarts. Deletions require explicit UI confirmation.

export type RotationStatus =
  | "preparing"
  | "awaiting_delete_originals"
  | "deleting_originals"
  | "copying"
  | "verifying"
  | "awaiting_delete_movies"
  | "deleting_movies"
  | "done"
  | "failed"
  | "cancelled";

const TARGETS = [
  { name: "jupiter", subdir: "jjj", csv: "j.csv", script: "mer_2_jup.sh" },
  { name: "saturn", subdir: "sss", csv: "s.csv", script: "mer_2_sat.sh" },
  { name: "venus", subdir: "vvv", csv: "v.csv", script: "mer_2_ven.sh" },
] as const;

const ACTIVE_STATUSES: RotationStatus[] = [
  "preparing",
  "awaiting_delete_originals",
  "deleting_originals",
  "copying",
  "verifying",
  "awaiting_delete_movies",
  "deleting_movies",
];

// SSH exec runs a non-interactive, non-login shell where ~/.bashrc PATH
// additions (e.g. ~/bin/mcli) are missing — extend PATH explicitly.
const ENV_PREFIX = `export PATH="$PATH:$HOME/bin:$HOME/.local/bin:/usr/local/bin";`;

function sh(server: ServerRow, cmd: string) {
  return execCommand(server, `${ENV_PREFIX} ${cmd}`);
}

function mcliServer(): { server: ServerRow; dir: string } | null {
  const settings = getSettings();
  if (!settings.mcli_server_id) return null;
  const server = db.prepare(`SELECT * FROM servers WHERE id=?`).get(settings.mcli_server_id) as
    | ServerRow
    | undefined;
  if (!server) return null;
  return { server, dir: settings.rotation_dir || "/home/belet/del-org" };
}

export function getActiveRun(): (RotationRunRow & { progress: RotationProgressRow[] }) | null {
  const run = db
    .prepare(`SELECT * FROM rotation_runs ORDER BY created_at DESC LIMIT 1`)
    .get() as RotationRunRow | undefined;
  if (!run) return null;
  const progress = db
    .prepare(`SELECT * FROM rotation_progress WHERE run_id=?`)
    .all(run.id) as RotationProgressRow[];
  return { ...run, progress };
}

export function listRuns(limit = 20) {
  return db
    .prepare(`SELECT * FROM rotation_runs ORDER BY created_at DESC LIMIT ?`)
    .all(limit);
}

function setStatus(id: string, status: RotationStatus, detail?: string, error?: string) {
  db.prepare(`UPDATE rotation_runs SET status=?, detail=?, error=?, updated_at=datetime('now') WHERE id=?`).run(
    status,
    detail ?? null,
    error ?? null,
    id,
  );
}

function setProgress(runId: string, target: string, status: string, doneCount = 0, lastId?: string | null) {
  db.prepare(
    `INSERT INTO rotation_progress (run_id, target, status, done_count, last_id) VALUES (?,?,?,?,?)
     ON CONFLICT(run_id, target) DO UPDATE SET status=excluded.status, done_count=excluded.done_count, last_id=excluded.last_id`,
  ).run(runId, target, status, doneCount, lastId ?? null);
}

function screenCmd(session: string, workdir: string, script: string): string {
  return `cd ${workdir} && screen -dmS ${session} bash ${script}`;
}

async function screenAlive(server: ServerRow, session: string): Promise<boolean> {
  const res = await sh(server, `screen -ls | grep -c '[.]${session}[ \t]' || true`);
  return res.stdout.trim() !== "0";
}

async function killScreens(server: ServerRow) {
  await execCommand(
    server,
    `for s in $(screen -ls | grep -o 'certuary-[a-z]*' | sort -u); do screen -S "$s" -X quit 2>/dev/null; done; true`,
  );
}

async function readFile(server: ServerRow, path: string): Promise<string> {
  const res = await sh(server, `cat ${path} 2>/dev/null`);
  return res.stdout.trim();
}

export async function startRotation(olderThan?: string): Promise<RotationRunRow> {
  const ctx = mcliServer();
  if (!ctx) throw new Error("Не настроен сервер с mcli — укажите его в настройках");
  const existing = getActiveRun();
  if (existing && ACTIVE_STATUSES.includes(existing.status as RotationStatus)) {
    throw new Error("Миграция уже запущена");
  }
  const ot = (olderThan ?? getSettings().rotation_older_than ?? "7d").replace(/[^0-9a-z]/gi, "");
  const id = randomUUID();
  db.prepare(`INSERT INTO rotation_runs (id, status, older_than) VALUES (?, 'preparing', ?)`).run(id, ot);
  for (const t of TARGETS) setProgress(id, t.name, "pending");
  setProgress(id, "originals", "pending");
  setProgress(id, "mercury", "pending");
  runPrepare(id).catch((err) => {
    setStatus(id, "failed", undefined, (err as Error).message);
    logEvent(ctx.server.id, null, "rotation", `Миграция не удалась: ${(err as Error).message}`, false);
  });
  return db.prepare(`SELECT * FROM rotation_runs WHERE id=?`).get(id) as RotationRunRow;
}

export async function maybeAutoStartRotation(usePct: number) {
  const run = getActiveRun();
  if (run && ACTIVE_STATUSES.includes(run.status as RotationStatus)) return;
  await startRotation();
  logEvent(null, null, "rotation", `Авто-запуск миграции: mercury заполнен на ${usePct.toFixed(0)}%`, true);
  sendTelegramMessage(`⚠️ Mercury заполнен на <b>${usePct.toFixed(0)}%</b> — запущена автоматическая миграция архива`).catch(() => {});
}

export async function confirmStep(runId: string, step: "originals" | "movies") {
  const run = db.prepare(`SELECT * FROM rotation_runs WHERE id=?`).get(runId) as RotationRunRow | undefined;
  if (!run) throw new Error("Прогон не найден");
  if (step === "originals" && run.status !== "awaiting_delete_originals") {
    throw new Error("Сейчас не ожидается подтверждение удаления оригиналов");
  }
  if (step === "movies" && run.status !== "awaiting_delete_movies") {
    throw new Error("Сейчас не ожидается подтверждение удаления movies");
  }
  runPipeline(runId).catch((err) => {
    setStatus(runId, "failed", undefined, (err as Error).message);
  });
}

export async function cancelRotation(runId: string) {
  const ctx = mcliServer();
  const run = db.prepare(`SELECT * FROM rotation_runs WHERE id=?`).get(runId) as RotationRunRow | undefined;
  if (!run) throw new Error("Прогон не найден");
  if (!ACTIVE_STATUSES.includes(run.status as RotationStatus)) {
    throw new Error("Прогон уже завершён");
  }
  if (ctx) await killScreens(ctx.server);
  setStatus(runId, "cancelled");
  logEvent(ctx?.server.id ?? null, null, "rotation", "Миграция отменена пользователем", true);
}

// Resume the tick loop for an unfinished run after a service restart.
export function resumeActiveRun() {
  const run = getActiveRun();
  if (run && ACTIVE_STATUSES.includes(run.status as RotationStatus)) {
    scheduleTick(run.id);
  }
}

const tickTimers = new Map<string, NodeJS.Timeout>();
function scheduleTick(runId: string, ms = 20000) {
  if (tickTimers.has(runId)) return;
  const t = setInterval(() => {
    tick(runId).catch((err) => console.error("rotation tick failed", err));
  }, ms);
  tickTimers.set(runId, t);
}
function stopTick(runId: string) {
  const t = tickTimers.get(runId);
  if (t) clearInterval(t);
  tickTimers.delete(runId);
}

async function runPipeline(runId: string) {
  const run = db.prepare(`SELECT * FROM rotation_runs WHERE id=?`).get(runId) as RotationRunRow;
  const ctx = mcliServer();
  if (!ctx) throw new Error("mcli-сервер не настроен");
  const { server, dir } = ctx;

  if (run.status === "awaiting_delete_originals") {
    await sh(server, screenCmd("certuary-mm", dir, "del_mp4.csv"));
    setStatus(runId, "deleting_originals", "Удаление оригинальных mp4 запущено (screen certuary-mm)");
    setProgress(runId, "originals", "running");
    scheduleTick(runId);
    return;
  }
  if (run.status === "awaiting_delete_movies") {
    await sh(server, `cd ${dir} && bash mercury-del-movies.sh && screen -dmS certuary-mm bash del_mercury.csv`);
    setStatus(runId, "deleting_movies", "Удаление movies с mercury запущено (screen certuary-mm)");
    setProgress(runId, "mercury", "running");
    scheduleTick(runId);
    return;
  }
}

async function tick(runId: string) {
  const ctx = mcliServer();
  const run = db.prepare(`SELECT * FROM rotation_runs WHERE id=?`).get(runId) as RotationRunRow | undefined;
  if (!ctx || !run) return stopTick(runId);
  const { server, dir } = ctx;
  const status = run.status as RotationStatus;

  if (status === "preparing") {
    // preparation itself runs inline; nothing to poll
    return;
  }

  if (status === "deleting_originals") {
    if (await screenAlive(server, "certuary-mm")) return;
    setProgress(runId, "originals", "done");
    logEvent(server.id, null, "rotation", "Оригинальные mp4 удалены, стартую копию на 3 MinIO", true);
    for (const t of TARGETS) {
      const res = await execCommand(
        server,
        screenCmd(`certuary-${t.name}`, `${dir}/${t.subdir}`, t.script),
      );
      setProgress(runId, t.name, res.code === 0 ? "running" : "error");
    }
    setStatus(runId, "copying", "Копия mercury/movies → venus/saturn/jupiter запущена");
    return;
  }

  if (status === "copying") {
    let allDone = true;
    for (const t of TARGETS) {
      const lastId = await readFile(server, `${dir}/${t.subdir}/last_copied`);
      const countRes = await execCommand(
        server,
        `grep -nxF "${lastId}" ${dir}/${t.subdir}/${t.csv} 2>/dev/null | head -1 | cut -d: -f1`,
      );
      const doneCount = Number(countRes.stdout.trim()) || 0;
      const alive = await screenAlive(server, `certuary-${t.name}`);
      const status = alive ? "running" : doneCount >= run.total_ids ? "done" : "stalled";
      if (status !== "done") allDone = false;
      setProgress(runId, t.name, status, doneCount, lastId || null);
    }
    if (allDone) {
      setStatus(runId, "verifying", "Все три копии завершены, проверка…");
      await verifyRun(runId, server);
    }
    return;
  }

  if (status === "deleting_movies") {
    if (await screenAlive(server, "certuary-mm")) return;
    setProgress(runId, "mercury", "done");
    setStatus(runId, "done", "Миграция завершена");
    stopTick(runId);
    logEvent(server.id, null, "rotation", `Миграция завершена: ${run.total_ids} объектов`, true);
    sendTelegramMessage(`✅ Миграция mercury → venus/saturn/jupiter завершена (${run.total_ids} объектов)`).catch(() => {});
    return;
  }
}

async function verifyRun(runId: string, server: ServerRow) {
  const { dir } = mcliServer()!;
  const run = db.prepare(`SELECT * FROM rotation_runs WHERE id=?`).get(runId) as RotationRunRow;
  // sample up to 10 ids and compare du sizes source vs each replica
  const listRes = await sh(server, `shuf -n 10 ${dir}/list.mercury 2>/dev/null || head -10 ${dir}/list.mercury`);
  const ids = listRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10);
  let mismatches = 0;
  const checked: string[] = [];
  for (const id of ids) {
    const src = await sh(server, `mcli du --recursive mercury/movies/${id}/ 2>/dev/null | awk '{print $1}'`);
    const srcSize = src.stdout.trim();
    for (const t of TARGETS) {
      const dst = await sh(server, `mcli du --recursive ${t.name}/movies/${id}/ 2>/dev/null | awk '{print $1}'`);
      if (!dst.stdout.trim() || dst.stdout.trim() !== srcSize) mismatches++;
    }
    checked.push(id);
  }
  const detail = `Проверено ${checked.length} из ${run.total_ids} ID, расхождений: ${mismatches}`;
  setStatus(runId, "awaiting_delete_movies", detail);
  logEvent(server.id, null, "rotation", `Верификация копий: ${detail}. Ожидается подтверждение удаления`, mismatches === 0);
  sendTelegramMessage(
    `⚠️ Копия на venus/saturn/jupiter завершена. ${detail}. Подтвердите удаление данных с mercury.`,
  ).catch(() => {});
}

export async function runPrepare(runId: string) {
  const ctx = mcliServer();
  if (!ctx) throw new Error("mcli-сервер не настроен");
  const { server, dir } = ctx;
  const run = db.prepare(`SELECT * FROM rotation_runs WHERE id=?`).get(runId) as RotationRunRow;
  const res = await execCommand(
    server,
    `cd ${dir} && mcli find mercury/original --older-than ${run.older_than} > 7d && ` +
      `awk -F"/" '{print $3}' 7d > list.ids && sort -n list.ids | uniq > list.mercury && ` +
      `bash del-mp4.sh && bash v-s-j.sh && wc -l < list.mercury`,
  );
  if (res.code !== 0) {
    setStatus(runId, "failed", undefined, res.stderr || res.stdout || `код ${res.code}`);
    throw new Error(res.stderr || `Подготовка завершилась с кодом ${res.code}`);
  }
  const total = Number(res.stdout.trim().split("\n").pop()) || 0;
  if (total === 0) {
    setStatus(runId, "done", "Нет объектов старше порога — миграция не требуется");
    db.prepare(`UPDATE rotation_runs SET total_ids=0 WHERE id=?`).run(runId);
    return;
  }
  db.prepare(`UPDATE rotation_runs SET total_ids=? WHERE id=?`).run(runId, total);
  setStatus(runId, "awaiting_delete_originals", `Найдено ${total} объектов старше ${run.older_than}. Списки сформированы.`);
  logEvent(server.id, null, "rotation", `Подготовка завершена: ${total} объектов к миграции`, true);
  sendTelegramMessage(
    `📦 Миграция mercury подготовлена: <b>${total}</b> объектов. Подтвердите удаление оригинальных mp4.`,
  ).catch(() => {});
}

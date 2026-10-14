import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { latestDisks, latestMinio, collectMinio, collectAllDisks } from "../services/diskMonitor.js";
import {
  getActiveRun,
  listRuns,
  startRotation,
  confirmStep,
  cancelRotation,
} from "../services/rotationService.js";
import { getSettings } from "../services/settingsService.js";

export const storageRouter = Router();

storageRouter.get("/overview", (_req, res) => {
  const settings = getSettings();
  res.json({
    disks: latestDisks(),
    minio: latestMinio(),
    run: getActiveRun(),
    mcliConfigured: Boolean(settings.mcli_server_id),
    mcliServerId: settings.mcli_server_id,
  });
});

storageRouter.get("/disks/history", (req, res) => {
  const serverId = String(req.query.serverId ?? "");
  const hours = Math.min(Number(req.query.hours ?? 24), 24 * 30);
  if (!serverId) return res.status(400).json({ error: "serverId required" });
  const rows = db
    .prepare(
      `SELECT mount, used_bytes, total_bytes, use_pct, created_at FROM disk_samples
       WHERE server_id=? AND created_at > datetime('now', ?)
       ORDER BY created_at ASC`,
    )
    .all(serverId, `-${hours} hours`);
  res.json(rows);
});

// manual refresh — read-only, safe on production hosts
storageRouter.post("/collect", async (_req, res) => {
  try {
    await collectAllDisks();
    await collectMinio();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const startSchema = z.object({
  olderThan: z.string().regex(/^\d+[smhdwy]$/, "формат: 7d, 30d, 12h").optional(),
});

storageRouter.post("/rotation/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const run = await startRotation(parsed.data.olderThan);
    res.json(run);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

storageRouter.post("/rotation/:id/confirm", async (req, res) => {
  const step = req.body?.step;
  if (step !== "originals" && step !== "movies") {
    return res.status(400).json({ error: "step: originals | movies" });
  }
  try {
    await confirmStep(req.params.id, step);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

storageRouter.post("/rotation/:id/cancel", async (req, res) => {
  try {
    await cancelRotation(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

storageRouter.get("/rotation", (_req, res) => {
  res.json({ run: getActiveRun() });
});

storageRouter.get("/rotation/history", (_req, res) => {
  res.json(listRuns());
});

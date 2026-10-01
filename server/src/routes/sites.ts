import { Router } from "express";
import { db } from "../db/index.js";
import { checkLiveCertificate } from "../services/tlsCheck.js";
import { renewNpmCertificate } from "../services/npmIntegration.js";
import { getServer } from "../services/serverService.js";
import { scanServer } from "../services/certScanner.js";
import type { SiteRow } from "../types.js";

export const sitesRouter = Router();

const SELECT_FIELDS = `s.*, sv.name as server_name, sv.host as server_host, sv.kind as server_kind, c.subject_cn, c.sans, c.issuer, c.not_before, c.not_after, c.fingerprint, c.last_synced_at, c.live_status, c.live_checked_at, c.live_subject_cn, c.live_issuer, c.live_not_after, c.live_fingerprint`;

sitesRouter.get("/", (req, res) => {
  const serverId = req.query.serverId as string | undefined;
  const rows = serverId
    ? db
        .prepare(
          `SELECT ${SELECT_FIELDS} FROM sites s JOIN servers sv ON sv.id = s.server_id LEFT JOIN certificates c ON c.site_id = s.id WHERE s.server_id = ? ORDER BY s.domain`,
        )
        .all(serverId)
    : db
        .prepare(
          `SELECT ${SELECT_FIELDS} FROM sites s JOIN servers sv ON sv.id = s.server_id LEFT JOIN certificates c ON c.site_id = s.id ORDER BY c.not_after ASC`,
        )
        .all();
  res.json(rows);
});

sitesRouter.get("/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT ${SELECT_FIELDS} FROM sites s JOIN servers sv ON sv.id = s.server_id LEFT JOIN certificates c ON c.site_id = s.id WHERE s.id = ?`,
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

sitesRouter.post("/:id/check-live", async (req, res) => {
  const site = db.prepare(`SELECT id FROM sites WHERE id=?`).get(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  await checkLiveCertificate(req.params.id);
  const row = db
    .prepare(
      `SELECT ${SELECT_FIELDS} FROM sites s JOIN servers sv ON sv.id = s.server_id LEFT JOIN certificates c ON c.site_id = s.id WHERE s.id = ?`,
    )
    .get(req.params.id);
  res.json(row);
});

sitesRouter.post("/:id/npm-renew", async (req, res) => {
  const site = db.prepare(`SELECT * FROM sites WHERE id=?`).get(req.params.id) as SiteRow | undefined;
  if (!site) return res.status(404).json({ error: "not found" });
  const server = getServer(site.server_id);
  if (!server || server.kind !== "npm") {
    return res.status(400).json({ error: "Доступно только для серверов типа Nginx Proxy Manager" });
  }
  const cert = db.prepare(`SELECT fingerprint FROM certificates WHERE site_id=?`).get(site.id) as
    | { fingerprint: string | null }
    | undefined;
  const match = /^npm-cert-(\d+)-/.exec(cert?.fingerprint ?? "");
  if (!match) return res.status(400).json({ error: "Не найден ID сертификата NPM для этого сайта" });
  const result = await renewNpmCertificate(server, Number(match[1]));
  if (result.ok) await scanServer(server);
  const row = db
    .prepare(
      `SELECT ${SELECT_FIELDS} FROM sites s JOIN servers sv ON sv.id = s.server_id LEFT JOIN certificates c ON c.site_id = s.id WHERE s.id = ?`,
    )
    .get(req.params.id);
  res.json({ ...result, site: row });
});

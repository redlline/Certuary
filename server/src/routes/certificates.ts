import { Router } from "express";
import multer from "multer";
import { db } from "../db/index.js";
import { getServer } from "../services/serverService.js";
import { validateBundle, deployBundle } from "../services/certUploadService.js";
import { uploadNpmCustomCertificate } from "../services/npmIntegration.js";
import { matchBulkGroups, deployBulkGroups, type BulkGroup } from "../services/bulkCertService.js";
import { reload } from "../services/nginxControl.js";
import { logEvent } from "../services/eventService.js";
import type { SiteRow } from "../types.js";

export const certificatesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
const uploadAny = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 50 } });

function groupFilesByStem(files: Express.Multer.File[]): BulkGroup[] {
  const groups = new Map<string, { cert?: Express.Multer.File; key?: Express.Multer.File; chain?: Express.Multer.File }>();
  for (const file of files) {
    const dot = file.originalname.lastIndexOf(".");
    const stem = dot >= 0 ? file.originalname.slice(0, dot) : file.originalname;
    const ext = dot >= 0 ? file.originalname.slice(dot + 1).toLowerCase() : "";
    const entry = groups.get(stem) ?? {};
    if (ext === "key") entry.key = file;
    else if (["crt", "pem", "cer"].includes(ext)) {
      if (!entry.cert) entry.cert = file;
      else entry.chain = file;
    }
    groups.set(stem, entry);
  }
  const result: BulkGroup[] = [];
  for (const [stem, entry] of groups) {
    if (!entry.cert || !entry.key) continue;
    result.push({
      groupName: stem,
      certPem: entry.cert.buffer.toString("utf8"),
      keyPem: entry.key.buffer.toString("utf8"),
      chainPem: entry.chain?.buffer.toString("utf8"),
    });
  }
  return result;
}

certificatesRouter.get("/expiring", (req, res) => {
  const days = Number(req.query.days ?? 14);
  const rows = db
    .prepare(
      `SELECT s.id as site_id, s.domain, sv.id as server_id, sv.name as server_name, c.not_after
       FROM certificates c
       JOIN sites s ON s.id = c.site_id
       JOIN servers sv ON sv.id = s.server_id
       WHERE c.not_after IS NOT NULL AND julianday(c.not_after) - julianday('now') <= ?
       ORDER BY c.not_after ASC`,
    )
    .all(days);
  res.json(rows);
});

certificatesRouter.post(
  "/sites/:siteId/upload",
  upload.fields([
    { name: "cert", maxCount: 1 },
    { name: "key", maxCount: 1 },
    { name: "chain", maxCount: 1 },
  ]),
  async (req, res) => {
    const site = db.prepare(`SELECT * FROM sites WHERE id=?`).get(req.params.siteId) as SiteRow | undefined;
    if (!site) return res.status(404).json({ error: "site not found" });
    const server = getServer(site.server_id);
    if (!server) return res.status(404).json({ error: "server not found" });
    const files = req.files as { cert?: Express.Multer.File[]; key?: Express.Multer.File[]; chain?: Express.Multer.File[] } | undefined;
    const certFile = files?.cert?.[0];
    const keyFile = files?.key?.[0];
    const chainFile = files?.chain?.[0];
    if (!certFile || !keyFile) {
      return res.status(400).json({ error: "Нужны файлы cert и key" });
    }
    const bundle = {
      certPem: certFile.buffer.toString("utf8"),
      keyPem: keyFile.buffer.toString("utf8"),
      chainPem: chainFile?.buffer.toString("utf8"),
    };
    const validation = validateBundle(bundle);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }
    if (req.query.confirm !== "true") {
      // dry-run: return parsed info for confirmation step
      return res.json({ preview: true, info: validation.info });
    }
    let result;
    if (server.kind === "npm") {
      const match = /^npm:proxy-host:(\d+)$/.exec(site.config_file_path ?? "");
      if (!match) return res.status(400).json({ error: "Не найден ID хоста NPM для этого сайта" });
      const fullChainPem = bundle.chainPem
        ? `${bundle.certPem.trim()}\n${bundle.chainPem.trim()}\n`
        : bundle.certPem;
      result = await uploadNpmCustomCertificate(server, Number(match[1]), site.domain, fullChainPem, bundle.keyPem);
    } else {
      result = await deployBundle(server, site, bundle);
    }
    if (!result.ok) return res.status(500).json(result);
    // refresh stored cert info immediately
    const { scanServer } = await import("../services/certScanner.js");
    scanServer(server).catch(() => {});
    res.json(result);
  },
);

certificatesRouter.post("/bulk-match", uploadAny.any(), (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const groups = groupFilesByStem(files);
  if (groups.length === 0) {
    return res.status(400).json({
      error: "Не найдено ни одной пары cert+key. Имена файлов должны совпадать (example.com.crt + example.com.key)",
    });
  }
  res.json({ results: matchBulkGroups(groups) });
});

certificatesRouter.post("/bulk-deploy", uploadAny.any(), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const groups = groupFilesByStem(files);
  let selections: Record<string, string>;
  try {
    selections = JSON.parse(req.body.selections ?? "{}");
  } catch {
    return res.status(400).json({ error: "Некорректный формат selections" });
  }
  const results = await deployBulkGroups(groups, selections);
  const affectedServerIds = new Set(
    results
      .filter((r) => r.ok)
      .map((r) => {
        const site = db.prepare(`SELECT server_id FROM sites WHERE id=?`).get(r.siteId) as
          | { server_id: string }
          | undefined;
        return site?.server_id;
      })
      .filter(Boolean) as string[],
  );
  const { scanServer } = await import("../services/certScanner.js");
  for (const serverId of affectedServerIds) {
    const server = getServer(serverId);
    if (server) scanServer(server).catch(() => {});
  }
  res.json({ results });
});

certificatesRouter.post("/batch-reload", async (req, res) => {
  const serverIds = Array.isArray(req.body?.serverIds) ? (req.body.serverIds as string[]) : [];
  const results: { serverId: string; ok: boolean; output: string }[] = [];
  for (const serverId of serverIds) {
    const server = getServer(serverId);
    if (!server) {
      results.push({ serverId, ok: false, output: "Сервер не найден" });
      continue;
    }
    if (server.kind === "npm") {
      results.push({ serverId, ok: false, output: "NPM управляет своим nginx самостоятельно" });
      continue;
    }
    const result = await reload(server);
    logEvent(
      server.id,
      null,
      "reload",
      result.ok
        ? "Reload выполнен (пакетная перезагрузка)"
        : `Reload (пакетная перезагрузка) завершился с ошибкой: ${result.output}`,
      result.ok,
    );
    results.push({ serverId, ...result });
  }
  res.json({ results });
});

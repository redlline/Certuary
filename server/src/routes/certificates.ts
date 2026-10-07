import { Router } from "express";
import multer from "multer";
import forge from "node-forge";
import { db } from "../db/index.js";
import { getServer } from "../services/serverService.js";
import { validateBundle, deployBundle, sanitizePem } from "../services/certUploadService.js";
import { uploadNpmCustomCertificate } from "../services/npmIntegration.js";
import { matchBulkGroups, deployBulkGroups, type BulkGroup } from "../services/bulkCertService.js";
import { reload } from "../services/nginxControl.js";
import { logEvent } from "../services/eventService.js";
import type { SiteRow } from "../types.js";

export const certificatesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
const uploadAny = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 50 } });

type FileRole = "cert" | "key" | "unknown";

function classifyFile(file: Express.Multer.File): FileRole {
  const text = file.buffer.toString("utf8");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return "key";
  if (/-----BEGIN CERTIFICATE-----/.test(text)) return "cert";
  const ext = file.originalname.slice(file.originalname.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "key") return "key";
  if (["crt", "pem", "cer", "cert"].includes(ext)) return "cert";
  return "unknown";
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(0, dot) : name;
}

// Filenames from common CAs don't share the cert/key stem
// ("certificate.crt"+"private.key"+"ca_bundle.crt" from ZeroSSL,
// "fullchain.pem"+"privkey.pem" from Let's Encrypt). Strip known filler
// tokens so those stems converge onto the domain-ish part.
const FILLER_TOKENS = new Set([
  "cert", "certificate", "crt", "cer", "pem", "key", "priv", "privkey",
  "private", "public", "bundle", "cabundle", "ca", "chain", "fullchain",
  "full", "rsa", "ecc", "ssl", "tls", "star", "wildcard", "combined",
]);

function normalizeStem(stem: string): string {
  return stem
    .toLowerCase()
    .split(/[.\-_]+/)
    .map((p) => p.replace(/\d+$/, ""))
    .filter((p) => p && !FILLER_TOKENS.has(p))
    .join(".");
}

function keyMatchesCert(certPem: string, keyPem: string): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
    const pub = cert.publicKey as forge.pki.rsa.PublicKey;
    return pub.n.toString() === key.n.toString() && pub.e.toString() === key.e.toString();
  } catch {
    return false;
  }
}

function certFieldCn(pem: string, who: "subject" | "issuer"): string | null {
  try {
    const cert = forge.pki.certificateFromPem(pem);
    return (who === "subject" ? cert.subject : cert.issuer).getField("CN")?.value ?? null;
  } catch {
    return null;
  }
}

export interface GroupedFiles {
  groups: BulkGroup[];
  leftovers: { name: string; files: string[] }[];
}

export function groupFilesByStem(files: Express.Multer.File[]): GroupedFiles {
  // Phase 1: group by exact filename stem, classifying by PEM content
  // (a ".pem" holding a private key counts as the key, etc).
  const byStem = new Map<
    string,
    { certs: Express.Multer.File[]; keys: Express.Multer.File[] }
  >();
  const looseCerts: { file: Express.Multer.File; stem: string }[] = [];
  const looseKeys: { file: Express.Multer.File; stem: string }[] = [];
  const unclassified: string[] = [];
  for (const file of files) {
    const stem = stemOf(file.originalname);
    const role = classifyFile(file);
    if (role === "unknown") {
      unclassified.push(file.originalname);
      continue;
    }
    const entry = byStem.get(stem) ?? { certs: [], keys: [] };
    (role === "key" ? entry.keys : entry.certs).push(file);
    byStem.set(stem, entry);
  }

  const groups: BulkGroup[] = [];
  const leftovers: { name: string; files: string[] }[] = [];

  for (const [stem, entry] of byStem) {
    if (entry.certs.length === 0) {
      for (const k of entry.keys) looseKeys.push({ file: k, stem });
      continue;
    }
    if (entry.keys.length === 0) {
      for (const c of entry.certs) looseCerts.push({ file: c, stem });
      continue;
    }
    groups.push({
      groupName: stem,
      certPem: entry.certs[0].buffer.toString("utf8"),
      keyPem: entry.keys[0].buffer.toString("utf8"),
      chainPem: entry.certs[1]?.buffer.toString("utf8"),
    });
    for (const c of entry.certs.slice(2)) looseCerts.push({ file: c, stem });
    for (const k of entry.keys.slice(1)) looseKeys.push({ file: k, stem });
  }

  // Phase 2: pair loose certs with loose keys. Keys are tried in
  // same-normalized-stem order first, then the rest — a real modulus match
  // makes pairing safe regardless of filenames.
  looseCerts.sort((a, b) => a.file.originalname.localeCompare(b.file.originalname));
  looseKeys.sort((a, b) => a.file.originalname.localeCompare(b.file.originalname));
  const usedKeys = new Set<Express.Multer.File>();
  const usedCerts = new Set<Express.Multer.File>();
  for (const c of looseCerts) {
    const norm = normalizeStem(c.stem);
    const ordered = [
      ...looseKeys.filter((k) => !usedKeys.has(k.file) && normalizeStem(k.stem) === norm),
      ...looseKeys.filter((k) => !usedKeys.has(k.file) && normalizeStem(k.stem) !== norm),
    ];
    const certPem = c.file.buffer.toString("utf8");
    const match = ordered.find((k) =>
      keyMatchesCert(certPem, k.file.buffer.toString("utf8")),
    );
    if (!match) continue;
    usedCerts.add(c.file);
    usedKeys.add(match.file);
    groups.push({
      groupName: norm || c.stem,
      certPem,
      keyPem: match.file.buffer.toString("utf8"),
    });
  }

  // Unpaired certs that are pure-filler names (ca_bundle, chain…) most likely
  // hold intermediates. Attach them as chains — prefer the group whose leaf
  // issuer matches the chain cert's subject CN.
  const chainable = looseCerts.filter(
    (c) => !usedCerts.has(c.file) && !normalizeStem(c.stem) && /CERTIFICATE/.test(c.file.buffer.toString("utf8")),
  );
  for (const chain of chainable) {
    const chainPem = chain.file.buffer.toString("utf8");
    const chainCn = certFieldCn(chainPem, "subject");
    const target =
      groups.find((g) => !g.chainPem && certFieldCn(g.certPem, "issuer") === chainCn) ??
      groups.find((g) => !g.chainPem);
    if (!target) break;
    usedCerts.add(chain.file);
    target.chainPem = chainPem;
  }

  // Selections are keyed by groupName — keep them unique.
  const seen = new Map<string, number>();
  for (const g of groups) {
    const orig = g.groupName;
    const count = seen.get(orig) ?? 0;
    seen.set(orig, count + 1);
    if (count > 0) g.groupName = `${orig} (${count + 1})`;
  }

  for (const c of looseCerts) {
    if (!usedCerts.has(c.file)) leftovers.push({ name: c.stem, files: [c.file.originalname] });
  }
  for (const k of looseKeys) {
    if (!usedKeys.has(k.file)) leftovers.push({ name: k.stem, files: [k.file.originalname] });
  }
  for (const name of unclassified) leftovers.push({ name, files: [name] });
  return { groups, leftovers };
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
      const certPem = sanitizePem(bundle.certPem);
      const fullChainPem = bundle.chainPem
        ? `${certPem.trim()}\n${sanitizePem(bundle.chainPem).trim()}\n`
        : certPem;
      result = await uploadNpmCustomCertificate(server, Number(match[1]), site.domain, fullChainPem, sanitizePem(bundle.keyPem));
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
  const { groups, leftovers } = groupFilesByStem(files);
  const results = [
    ...matchBulkGroups(groups),
    ...leftovers.map((l) => ({
      groupName: l.name,
      valid: false,
      reason: `Не найдена пара сертификат+ключ (файлы: ${l.files.join(", ")})`,
      matches: [] as never[],
    })),
  ];
  if (results.length === 0) {
    return res.status(400).json({
      error: "Не найдено ни одной пары cert+key. Имена файлов должны совпадать (example.com.crt + example.com.key)",
    });
  }
  res.json({ results });
});

certificatesRouter.post("/bulk-deploy", uploadAny.any(), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const { groups } = groupFilesByStem(files);
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

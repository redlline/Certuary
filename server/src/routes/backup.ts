import { Router } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DB_PATH } from "../db/index.js";

export const backupRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_KEY_PATH = path.join(__dirname, "..", "..", "data", "secret.key");

backupRouter.get("/export", (_req, res) => {
  const zip = new AdmZip();
  zip.addLocalFile(DB_PATH, "", "fleet.db");
  if (fs.existsSync(SECRET_KEY_PATH)) {
    zip.addLocalFile(SECRET_KEY_PATH, "", "secret.key");
  }
  const buffer = zip.toBuffer();
  const filename = `certuary-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

backupRouter.post("/import", upload.single("backup"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Нужен файл backup.zip" });
  try {
    const zip = new AdmZip(req.file.buffer);
    const dbEntry = zip.getEntry("fleet.db");
    const keyEntry = zip.getEntry("secret.key");
    if (!dbEntry) return res.status(400).json({ error: "В архиве не найден fleet.db" });
    fs.writeFileSync(DB_PATH, dbEntry.getData());
    if (keyEntry) fs.writeFileSync(SECRET_KEY_PATH, keyEntry.getData());
    res.json({
      ok: true,
      message: "Бэкап восстановлен. Перезапустите сервер, чтобы изменения применились.",
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error)?.message ?? String(err) });
  }
});

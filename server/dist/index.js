import "./logger.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import "./db/index.js";
import { serversRouter } from "./routes/servers.js";
import { sitesRouter } from "./routes/sites.js";
import { certificatesRouter } from "./routes/certificates.js";
import { eventsRouter } from "./routes/events.js";
import { settingsRouter } from "./routes/settings.js";
import { authRouter } from "./routes/auth.js";
import { backupRouter } from "./routes/backup.js";
import { logsRouter } from "./routes/logs.js";
import { groupsRouter } from "./routes/groups.js";
import { startScheduler } from "./scheduler.js";
import { requireAuth } from "./auth.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.CERTUARY_API_PORT ? Number(process.env.CERTUARY_API_PORT) : 4000;
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use((req, res, next) => {
    const method = req.method;
    const url = req.originalUrl;
    res.on("finish", () => {
        if (!url.startsWith("/api") || url.startsWith("/api/logs"))
            return;
        if (res.statusCode < 400)
            return;
        const level = res.statusCode >= 500 ? console.error : console.warn;
        level(`${method} ${url} ${res.statusCode}`);
    });
    next();
});
app.use("/api/auth", authRouter);
app.use("/api/servers", requireAuth, serversRouter);
app.use("/api/sites", requireAuth, sitesRouter);
app.use("/api/certificates", requireAuth, certificatesRouter);
app.use("/api/events", requireAuth, eventsRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/backup", requireAuth, backupRouter);
app.use("/api/logs", requireAuth, logsRouter);
app.use("/api/groups", requireAuth, groupsRouter);
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
    // hashed asset filenames (assets/*) can be cached forever; index.html must always be revalidated
    // so browsers pick up new asset hashes immediately after a deploy instead of serving a stale bundle
    app.use(express.static(clientDist, {
        index: false,
        setHeaders: (res, filePath) => {
            if (filePath.includes(`${path.sep}assets${path.sep}`)) {
                res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            }
        },
    }));
    app.get("*", (_req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(path.join(clientDist, "index.html"));
    });
}
app.listen(PORT, () => {
    console.log(`Certuary API listening on http://localhost:${PORT}`);
    startScheduler();
});
//# sourceMappingURL=index.js.map
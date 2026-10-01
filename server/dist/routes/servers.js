import { Router } from "express";
import { z } from "zod";
import { createServer, deleteServer, DuplicateServerError, getServer, listServers, testConnection, updateServer, } from "../services/serverService.js";
import { scanServer } from "../services/certScanner.js";
import { detectDockerContainers } from "../services/dockerDetect.js";
import { logEvent } from "../services/eventService.js";
import { db } from "../db/index.js";
export const serversRouter = Router();
const serverInputSchema = z.object({
    name: z.string().min(1),
    kind: z.enum(["nginx", "apache", "haproxy", "npm"]).optional(),
    groupId: z.string().nullable().optional(),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).optional(),
    sshUser: z.string().min(1),
    authType: z.enum(["key", "password"]),
    secret: z.string().min(1),
    sudoPassword: z.string().optional(),
    reloadCommand: z.string().optional(),
    testCommand: z.string().optional(),
    configPaths: z.array(z.string()).optional(),
});
function withSiteCounts(server) {
    const siteCount = db.prepare(`SELECT COUNT(*) as c FROM sites WHERE server_id=?`).get(server.id);
    const soonest = db
        .prepare(`SELECT MIN(c.not_after) as d FROM certificates c JOIN sites s ON s.id=c.site_id WHERE s.server_id=?`)
        .get(server.id);
    const { secret_encrypted, sudo_password_encrypted, ...safe } = server;
    return {
        ...safe,
        hasSudoPassword: !!sudo_password_encrypted,
        siteCount: siteCount?.c ?? 0,
        soonestExpiry: soonest?.d ?? null,
    };
}
serversRouter.get("/", (_req, res) => {
    res.json(listServers().map(withSiteCounts));
});
serversRouter.get("/:id", (req, res) => {
    const server = getServer(req.params.id);
    if (!server)
        return res.status(404).json({ error: "not found" });
    res.json(withSiteCounts(server));
});
const detectDockerSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).optional(),
    sshUser: z.string().min(1),
    authType: z.enum(["key", "password"]),
    secret: z.string().min(1),
    sudoPassword: z.string().optional(),
    kind: z.enum(["nginx", "apache", "haproxy", "npm"]).optional(),
});
serversRouter.post("/detect-docker", async (req, res) => {
    const parsed = detectDockerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { host, port, sshUser, authType, secret, sudoPassword, kind } = parsed.data;
    const cfg = {
        host,
        port: port ?? 22,
        username: sshUser,
        readyTimeout: 10000,
        ...(authType === "key" ? { privateKey: secret } : { password: secret }),
    };
    try {
        const result = await detectDockerContainers(cfg, kind ?? "nginx", sudoPassword);
        res.json(result);
    }
    catch (err) {
        res.status(400).json({ error: err?.message ?? String(err) });
    }
});
serversRouter.post("/", async (req, res) => {
    const parsed = serverInputSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    try {
        const server = createServer(parsed.data);
        // fire-and-forget initial scan
        scanServer(server).catch(() => { });
        res.status(201).json(withSiteCounts(server));
    }
    catch (err) {
        if (err instanceof DuplicateServerError)
            return res.status(409).json({ error: err.message });
        res.status(500).json({ error: err?.message ?? String(err) });
    }
});
serversRouter.put("/:id", (req, res) => {
    const parsed = serverInputSchema.partial().safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    try {
        const server = updateServer(req.params.id, parsed.data);
        if (!server)
            return res.status(404).json({ error: "not found" });
        res.json(withSiteCounts(server));
    }
    catch (err) {
        if (err instanceof DuplicateServerError)
            return res.status(409).json({ error: err.message });
        res.status(500).json({ error: err?.message ?? String(err) });
    }
});
serversRouter.delete("/:id", (req, res) => {
    deleteServer(req.params.id);
    res.status(204).end();
});
serversRouter.post("/:id/test", async (req, res) => {
    const server = getServer(req.params.id);
    if (!server)
        return res.status(404).json({ error: "not found" });
    const result = await testConnection(server);
    res.json(result);
});
serversRouter.post("/:id/scan", async (req, res) => {
    const server = getServer(req.params.id);
    if (!server)
        return res.status(404).json({ error: "not found" });
    await scanServer(server);
    res.json(withSiteCounts(getServer(server.id)));
});
serversRouter.post("/:id/reload", async (req, res) => {
    const server = getServer(req.params.id);
    if (!server)
        return res.status(404).json({ error: "not found" });
    if (server.kind === "npm") {
        return res.json({
            ok: false,
            output: "Nginx Proxy Manager управляет своим nginx самостоятельно — ручной reload через Certuary недоступен.",
        });
    }
    const { reload } = await import("../services/nginxControl.js");
    const result = await reload(server);
    logEvent(server.id, null, "reload", result.ok ? "Reload выполнен вручную" : `Reload вручную завершился с ошибкой: ${result.output}`, result.ok);
    res.json(result);
});
//# sourceMappingURL=servers.js.map
import { Router } from "express";
import { db } from "../db/index.js";
export const eventsRouter = Router();
eventsRouter.get("/", (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const rows = db.prepare(`SELECT * FROM events ORDER BY created_at DESC LIMIT ?`).all(limit);
    res.json(rows);
});
//# sourceMappingURL=events.js.map
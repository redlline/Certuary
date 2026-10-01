import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";

export const groupsRouter = Router();

groupsRouter.get("/", (_req, res) => {
  res.json(db.prepare(`SELECT * FROM groups ORDER BY name`).all());
});

groupsRouter.post("/", (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const id = uuid();
  try {
    db.prepare(`INSERT INTO groups (id, name) VALUES (?, ?)`).run(id, parsed.data.name);
  } catch {
    return res.status(409).json({ error: "Группа с таким названием уже существует" });
  }
  res.status(201).json(db.prepare(`SELECT * FROM groups WHERE id=?`).get(id));
});

groupsRouter.put("/:id", (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = db.prepare(`SELECT * FROM groups WHERE id=?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  try {
    db.prepare(`UPDATE groups SET name=? WHERE id=?`).run(parsed.data.name, req.params.id);
  } catch {
    return res.status(409).json({ error: "Группа с таким названием уже существует" });
  }
  res.json(db.prepare(`SELECT * FROM groups WHERE id=?`).get(req.params.id));
});

groupsRouter.delete("/:id", (req, res) => {
  db.prepare(`UPDATE servers SET group_id=NULL WHERE group_id=?`).run(req.params.id);
  db.prepare(`DELETE FROM groups WHERE id=?`).run(req.params.id);
  res.status(204).end();
});

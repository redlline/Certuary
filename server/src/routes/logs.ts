import { Router } from "express";
import { getLogs } from "../logger.js";

export const logsRouter = Router();

logsRouter.get("/", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 300;
  const level = req.query.level as string | undefined;
  res.json(getLogs(limit, level));
});

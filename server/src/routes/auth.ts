import { Router } from "express";
import { z } from "zod";
import { getSettings } from "../services/settingsService.js";
import {
  createSessionToken,
  hashPassword,
  setAdminPasswordHash,
  setSessionCookie,
  clearSessionCookie,
  verifyPassword,
} from "../auth.js";

export const authRouter = Router();

authRouter.get("/status", (_req, res) => {
  const settings = getSettings();
  res.json({ configured: !!settings.admin_password_hash });
});

authRouter.post("/setup", (req, res) => {
  const settings = getSettings();
  if (settings.admin_password_hash) {
    return res.status(400).json({ error: "Пароль уже настроен" });
  }
  const parsed = z.object({ password: z.string().min(6) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
  setAdminPasswordHash(hashPassword(parsed.data.password));
  setSessionCookie(res, createSessionToken());
  res.json({ ok: true });
});

authRouter.post("/login", (req, res) => {
  const settings = getSettings();
  if (!settings.admin_password_hash) {
    return res.status(400).json({ error: "Пароль ещё не настроен" });
  }
  const parsed = z.object({ password: z.string() }).safeParse(req.body);
  if (!parsed.success || !verifyPassword(parsed.data.password, settings.admin_password_hash)) {
    return res.status(401).json({ error: "Неверный пароль" });
  }
  setSessionCookie(res, createSessionToken());
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post("/change-password", (req, res) => {
  const settings = getSettings();
  const parsed = z
    .object({ currentPassword: z.string(), newPassword: z.string().min(6) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Новый пароль должен быть не короче 6 символов" });
  if (settings.admin_password_hash && !verifyPassword(parsed.data.currentPassword, settings.admin_password_hash)) {
    return res.status(401).json({ error: "Неверный текущий пароль" });
  }
  setAdminPasswordHash(hashPassword(parsed.data.newPassword));
  res.json({ ok: true });
});

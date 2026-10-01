import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getSettings, setAdminPasswordHash } from "./services/settingsService.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const COOKIE_NAME = "certuary_session";

function getSessionSecret(): string {
  // derived deterministically so restarts don't invalidate every session's HMAC scheme,
  // but the secret itself lives only in the encrypted-secret key file already on disk.
  return process.env.CERTUARY_SESSION_SECRET ?? "certuary-default-session-secret-change-me";
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${sign(b64)}`;
}

function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [b64, signature] = token.split(".");
  if (!b64 || !signature) return false;
  if (sign(b64) !== signature) return false;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  }
  return out;
}

export function setSessionCookie(res: Response, token: string) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Path=/`,
  );
}

export function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const settings = getSettings();
  if (!settings.admin_password_hash) {
    // no password configured yet: open setup mode
    return next();
  }
  const cookies = parseCookies(req.headers.cookie);
  if (verifySessionToken(cookies[COOKIE_NAME])) {
    return next();
  }
  res.status(401).json({ error: "Требуется авторизация" });
}

export { setAdminPasswordHash };

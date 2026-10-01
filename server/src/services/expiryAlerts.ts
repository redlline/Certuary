import { db } from "../db/index.js";
import { getSettings } from "./settingsService.js";
import { sendTelegramMessage } from "./notificationService.js";
import { daysUntil } from "../lib/dates.js";
import { logEvent } from "./eventService.js";

export async function checkExpiryAndNotify() {
  const settings = getSettings();
  const thresholds = (JSON.parse(settings.alert_thresholds) as number[]).sort((a, b) => b - a);
  if (thresholds.length === 0) return;
  const rows = db
    .prepare(
      `SELECT c.id, s.id as site_id, sv.id as server_id, s.domain, sv.name as server_name, c.not_after, c.notified_thresholds
       FROM certificates c
       JOIN sites s ON s.id = c.site_id
       JOIN servers sv ON sv.id = s.server_id
       WHERE c.not_after IS NOT NULL`,
    )
    .all() as {
    id: string;
    site_id: string;
    server_id: string;
    domain: string;
    server_name: string;
    not_after: string;
    notified_thresholds: string;
  }[];
  for (const row of rows) {
    const days = daysUntil(row.not_after);
    if (days === null) continue;
    const notified = JSON.parse(row.notified_thresholds || "[]") as number[];
    const dueThreshold = thresholds.find((t) => days <= t && !notified.includes(t));
    if (dueThreshold === undefined) continue;
    const text =
      days < 0
        ? `🔴 Сертификат для <b>${escapeHtml(row.domain)}</b> (${escapeHtml(row.server_name)}) истёк ${Math.abs(days)} дн. назад`
        : `⚠️ Сертификат для <b>${escapeHtml(row.domain)}</b> (${escapeHtml(row.server_name)}) истекает через ${days} дн.`;
    const result = await sendTelegramMessage(text);
    if (result.ok) {
      const updatedNotified = [...notified, dueThreshold];
      db.prepare(`UPDATE certificates SET notified_thresholds=? WHERE id=?`).run(
        JSON.stringify(updatedNotified),
        row.id,
      );
      logEvent(
        row.server_id,
        row.site_id,
        "alert",
        `Отправлено уведомление в Telegram: ${row.domain} истекает через ${days} дн. (порог ${dueThreshold} дн.)`,
        true,
      );
    } else {
      logEvent(
        row.server_id,
        row.site_id,
        "alert",
        `Не удалось отправить уведомление в Telegram для ${row.domain}: ${result.error ?? "неизвестная ошибка"}`,
        false,
      );
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

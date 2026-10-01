import { db } from "../db/index.js";
import type { SettingsRow } from "../types.js";

export function getSettings(): SettingsRow {
  return db.prepare(`SELECT * FROM settings WHERE id = 1`).get() as SettingsRow;
}

export function updateSettings(input: {
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
  alertThresholds?: number[];
  theme?: string;
}): SettingsRow {
  const existing = getSettings();
  db.prepare(`UPDATE settings SET telegram_bot_token=?, telegram_chat_id=?, alert_thresholds=?, theme=? WHERE id=1`).run(
    input.telegramBotToken !== undefined ? input.telegramBotToken : existing.telegram_bot_token,
    input.telegramChatId !== undefined ? input.telegramChatId : existing.telegram_chat_id,
    input.alertThresholds ? JSON.stringify(input.alertThresholds) : existing.alert_thresholds,
    input.theme ?? existing.theme,
  );
  return getSettings();
}

export function setAdminPasswordHash(hash: string) {
  db.prepare(`UPDATE settings SET admin_password_hash=? WHERE id=1`).run(hash);
}

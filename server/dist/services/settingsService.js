import { db } from "../db/index.js";
export function getSettings() {
    return db.prepare(`SELECT * FROM settings WHERE id = 1`).get();
}
export function updateSettings(input) {
    const existing = getSettings();
    db.prepare(`UPDATE settings SET telegram_bot_token=?, telegram_chat_id=?, alert_thresholds=?, theme=? WHERE id=1`).run(input.telegramBotToken !== undefined ? input.telegramBotToken : existing.telegram_bot_token, input.telegramChatId !== undefined ? input.telegramChatId : existing.telegram_chat_id, input.alertThresholds ? JSON.stringify(input.alertThresholds) : existing.alert_thresholds, input.theme ?? existing.theme);
    return getSettings();
}
export function setAdminPasswordHash(hash) {
    db.prepare(`UPDATE settings SET admin_password_hash=? WHERE id=1`).run(hash);
}
//# sourceMappingURL=settingsService.js.map
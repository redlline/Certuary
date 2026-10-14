import { db } from "../db/index.js";
export function getSettings() {
    return db.prepare(`SELECT * FROM settings WHERE id = 1`).get();
}
export function updateSettings(input) {
    const existing = getSettings();
    db.prepare(`UPDATE settings SET telegram_bot_token=?, telegram_chat_id=?, alert_thresholds=?, theme=?,
     mcli_server_id=?, rotation_dir=?, rotation_older_than=?, rotation_auto=?, rotation_trigger_pct=?,
     disk_warn_pct=?, disk_crit_pct=? WHERE id=1`).run(input.telegramBotToken !== undefined ? input.telegramBotToken : existing.telegram_bot_token, input.telegramChatId !== undefined ? input.telegramChatId : existing.telegram_chat_id, input.alertThresholds ? JSON.stringify(input.alertThresholds) : existing.alert_thresholds, input.theme ?? existing.theme, input.mcliServerId !== undefined ? input.mcliServerId : existing.mcli_server_id, input.rotationDir ?? existing.rotation_dir, input.rotationOlderThan ?? existing.rotation_older_than, input.rotationAuto !== undefined ? (input.rotationAuto ? 1 : 0) : existing.rotation_auto, input.rotationTriggerPct ?? existing.rotation_trigger_pct, input.diskWarnPct ?? existing.disk_warn_pct, input.diskCritPct ?? existing.disk_crit_pct);
    return getSettings();
}
export function setAdminPasswordHash(hash) {
    db.prepare(`UPDATE settings SET admin_password_hash=? WHERE id=1`).run(hash);
}
//# sourceMappingURL=settingsService.js.map
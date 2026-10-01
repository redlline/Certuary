import { getSettings } from "./settingsService.js";
export async function sendTelegramMessage(text) {
    const settings = getSettings();
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
        return { ok: false, error: "Telegram не настроен" };
    }
    try {
        const res = await fetch(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: settings.telegram_chat_id,
                text,
                parse_mode: "HTML",
                disable_web_page_preview: true,
            }),
        });
        if (!res.ok) {
            const body = await res.text();
            return { ok: false, error: `Telegram API ${res.status}: ${body}` };
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=notificationService.js.map
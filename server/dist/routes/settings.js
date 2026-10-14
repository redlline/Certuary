import { Router } from "express";
import { z } from "zod";
import { getSettings, updateSettings } from "../services/settingsService.js";
import { sendTelegramMessage } from "../services/notificationService.js";
export const settingsRouter = Router();
function toClient(s) {
    return {
        telegramBotToken: s.telegram_bot_token,
        telegramChatId: s.telegram_chat_id,
        alertThresholds: JSON.parse(s.alert_thresholds),
        theme: s.theme,
        mcliServerId: s.mcli_server_id,
        rotationDir: s.rotation_dir,
        rotationOlderThan: s.rotation_older_than,
        rotationAuto: Boolean(s.rotation_auto),
        rotationTriggerPct: s.rotation_trigger_pct,
        diskWarnPct: s.disk_warn_pct,
        diskCritPct: s.disk_crit_pct,
    };
}
settingsRouter.get("/", (_req, res) => {
    res.json(toClient(getSettings()));
});
const updateSchema = z.object({
    telegramBotToken: z.string().nullable().optional(),
    telegramChatId: z.string().nullable().optional(),
    alertThresholds: z.array(z.number().int().positive()).optional(),
    theme: z.enum(["dark", "light"]).optional(),
    mcliServerId: z.string().nullable().optional(),
    rotationDir: z.string().min(1).optional(),
    rotationOlderThan: z.string().regex(/^\d+[smhdwy]$/).optional(),
    rotationAuto: z.boolean().optional(),
    rotationTriggerPct: z.number().min(1).max(100).optional(),
    diskWarnPct: z.number().min(1).max(100).optional(),
    diskCritPct: z.number().min(1).max(100).optional(),
});
settingsRouter.put("/", (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    res.json(toClient(updateSettings(parsed.data)));
});
settingsRouter.post("/telegram/test", async (_req, res) => {
    const result = await sendTelegramMessage("✅ Certuary: тестовое сообщение. Уведомления настроены верно.");
    if (!result.ok)
        return res.status(400).json(result);
    res.json(result);
});
//# sourceMappingURL=settings.js.map
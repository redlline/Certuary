import { Router } from "express";
import { z } from "zod";
import { getSettings, updateSettings } from "../services/settingsService.js";
import { sendTelegramMessage } from "../services/notificationService.js";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  const settings = getSettings();
  res.json({
    telegramBotToken: settings.telegram_bot_token,
    telegramChatId: settings.telegram_chat_id,
    alertThresholds: JSON.parse(settings.alert_thresholds),
    theme: settings.theme,
  });
});

const updateSchema = z.object({
  telegramBotToken: z.string().nullable().optional(),
  telegramChatId: z.string().nullable().optional(),
  alertThresholds: z.array(z.number().int().positive()).optional(),
  theme: z.enum(["dark", "light"]).optional(),
});

settingsRouter.put("/", (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const settings = updateSettings(parsed.data);
  res.json({
    telegramBotToken: settings.telegram_bot_token,
    telegramChatId: settings.telegram_chat_id,
    alertThresholds: JSON.parse(settings.alert_thresholds),
    theme: settings.theme,
  });
});

settingsRouter.post("/telegram/test", async (_req, res) => {
  const result = await sendTelegramMessage("✅ Certuary: тестовое сообщение. Уведомления настроены верно.");
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

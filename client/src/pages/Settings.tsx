import { useEffect, useState } from "react";
import { Download, KeyRound, Send, Upload } from "lucide-react";
import { api } from "../api";
import type { AppSettings } from "../types";

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <h2 className="text-sm font-medium text-[var(--text-h)] mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--text-dim)]">{label}</span>
      {children}
    </label>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [thresholds, setThresholds] = useState("");
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const s = await api.getSettings();
    setSettings(s);
    setThresholds(s.alertThresholds.join(", "));
  }

  useEffect(() => {
    load();
  }, []);

  if (!settings) return <div className="text-[var(--text-dim)]">Загрузка...</div>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const alertThresholds = thresholds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const updated = await api.updateSettings({
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId,
        alertThresholds,
      });
      setSettings(updated);
      setThresholds(updated.alertThresholds.join(", "));
      setSaveResult({ ok: true, text: "Настройки сохранены" });
    } catch (e) {
      setSaveResult({ ok: false, text: (e as Error).message ?? String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function testTelegram() {
    setTestResult(null);
    try {
      setTestResult(await api.testTelegram());
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message ?? String(e) });
    }
  }

  async function importBackup() {
    if (!backupFile) return;
    const fd = new FormData();
    fd.append("backup", backupFile);
    try {
      setBackupMessage((await api.importBackup(fd)).message);
    } catch (e) {
      setBackupMessage((e as Error).message ?? String(e));
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);
    if (passwords.next !== passwords.confirm) {
      setPasswordMessage("Пароли не совпадают");
      return;
    }
    try {
      await api.changePassword(passwords.current, passwords.next);
      setPasswordMessage("Пароль изменён");
      setPasswords({ current: "", next: "", confirm: "" });
    } catch (e) {
      setPasswordMessage((e as Error).message ?? String(e));
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-h)]">Настройки</h1>
        <p className="text-sm text-[var(--text-dim)]">Уведомления, бэкап и безопасность</p>
      </div>

      <SettingsSection title="Telegram-уведомления">
        <form onSubmit={save} className="flex flex-col gap-3">
          <Field label="Bot token">
            <input
              className="input"
              value={settings.telegramBotToken ?? ""}
              onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
              placeholder="123456:ABC-DEF..."
            />
          </Field>
          <Field label="Chat ID">
            <input
              className="input"
              value={settings.telegramChatId ?? ""}
              onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
              placeholder="-100123456789"
            />
          </Field>
          <Field label="Пороги предупреждений (дней до истечения, через запятую)">
            <input
              className="input"
              value={thresholds}
              onChange={(e) => setThresholds(e.target.value)}
              placeholder="30, 14, 7, 1"
            />
          </Field>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={testTelegram}
              className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2"
              style={{ border: "1px solid var(--border)" }}
            >
              <Send size={14} /> Отправить тест
            </button>
          </div>
          {saveResult && (
            <div className="text-sm" style={{ color: saveResult.ok ? "#4ade80" : "#f87171" }}>
              {saveResult.text}
            </div>
          )}
          {testResult && (
            <div className="text-sm" style={{ color: testResult.ok ? "#4ade80" : "#f87171" }}>
              {testResult.ok ? "Сообщение отправлено" : testResult.error}
            </div>
          )}
        </form>
      </SettingsSection>

      <SettingsSection title="Бэкап конфигурации">
        <p className="text-xs text-[var(--text-dim)] mb-3">
          Архив содержит базу данных (серверы, сайты, сертификаты) и ключ шифрования SSH-доступов.
          Храните его в надёжном месте.
        </p>
        <div className="flex flex-col gap-3">
          <a
            href={api.exportBackupUrl()}
            className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2 w-fit"
            style={{ border: "1px solid var(--border)" }}
          >
            <Download size={14} /> Скачать бэкап
          </a>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setBackupFile(e.target.files?.[0] ?? null)}
              className="input text-xs"
            />
            <button
              onClick={importBackup}
              disabled={!backupFile}
              className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2 shrink-0"
              style={{ border: "1px solid var(--border)" }}
            >
              <Upload size={14} /> Восстановить
            </button>
          </div>
          {backupMessage && (
            <div className="text-sm" style={{ color: "var(--text-h)" }}>
              {backupMessage}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Смена пароля">
        <form onSubmit={changePassword} className="flex flex-col gap-3">
          <Field label="Текущий пароль">
            <input
              type="password"
              className="input"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
            />
          </Field>
          <Field label="Новый пароль">
            <input
              type="password"
              className="input"
              value={passwords.next}
              onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
            />
          </Field>
          <Field label="Повторите новый пароль">
            <input
              type="password"
              className="input"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
            />
          </Field>
          <button type="submit" className="btn-primary flex items-center justify-center gap-1.5 w-fit px-4">
            <KeyRound size={14} /> Изменить пароль
          </button>
          {passwordMessage && (
            <div className="text-sm text-[var(--text-h)]">{passwordMessage}</div>
          )}
        </form>
      </SettingsSection>
    </div>
  );
}

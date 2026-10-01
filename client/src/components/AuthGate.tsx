import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { api } from "../api";
import { Logo } from "./Logo";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function init() {
    setLoading(true);
    try {
      const status = await api.authStatus();
      setConfigured(status.configured);
      if (!status.configured) {
        setAuthed(true);
      } else {
        try {
          await api.listServers();
          setAuthed(true);
        } catch {
          setAuthed(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    init();
  }, []);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.authSetup(password);
      setAuthed(true);
      setConfigured(true);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      setAuthed(true);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (authed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-xl p-6"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Logo size={28} />
          <span className="text-lg font-semibold text-[var(--text-h)]">Certuary</span>
        </div>
        <p className="text-sm text-[var(--text-dim)] mb-4">
          {configured ? "Введите пароль для входа" : "Задайте пароль администратора"}
        </p>
        <form onSubmit={configured ? handleLogin : handleSetup} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 input">
            <Lock size={14} style={{ color: "var(--text-dim)" }} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              required
              className="bg-transparent outline-none flex-1 text-sm"
              style={{ color: "var(--text-h)" }}
              autoFocus
            />
          </div>
          {!configured && (
            <div className="flex items-center gap-2 input">
              <Lock size={14} style={{ color: "var(--text-dim)" }} />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Повторите пароль"
                required
                className="bg-transparent outline-none flex-1 text-sm"
                style={{ color: "var(--text-h)" }}
              />
            </div>
          )}
          {error && (
            <div className="text-sm" style={{ color: "#f87171" }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Подождите..." : configured ? "Войти" : "Сохранить и войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

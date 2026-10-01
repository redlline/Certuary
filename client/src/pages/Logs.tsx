import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../api";
import type { LogEntry } from "../types";

const LEVEL_FILTERS = [
  { value: undefined, label: "Все" },
  { value: "info", label: "Инфо" },
  { value: "warn", label: "Предупреждения" },
  { value: "error", label: "Ошибки" },
] as const;

const LEVEL_COLORS: Record<string, string> = {
  info: "var(--text-dim)",
  warn: "#eab308",
  error: "#f87171",
};

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLogs(await api.listLogs(500, level));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [level]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, level]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-h)]">Логи системы</h1>
          <p className="text-sm text-[var(--text-dim)]">
            Внутренние логи процесса Certuary (последние записи в памяти)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 text-sm rounded-md px-3 py-2 transition ${autoRefresh ? "tab-active" : "tab"}`}
          >
            <RefreshCw
              size={14}
              className={autoRefresh ? "animate-spin" : ""}
              style={{ animationDuration: "2s" }}
            />
            Авто-обновление
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2"
            style={{ border: "1px solid var(--border)" }}
          >
            Обновить
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {LEVEL_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setLevel(f.value)}
            className={`text-xs rounded-md px-3 py-1.5 transition ${level === f.value ? "tab-active" : "tab"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-xl flex-1 overflow-y-auto font-mono text-xs p-3"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", maxHeight: "70vh" }}
      >
        {loading ? (
          <div className="text-[var(--text-dim)]">Загрузка...</div>
        ) : logs.length === 0 ? (
          <div className="text-[var(--text-dim)]">Записей нет</div>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="whitespace-pre-wrap break-all py-0.5">
              <span className="text-[var(--text-dim)]">
                {new Date(entry.ts).toLocaleString("ru-RU")}
              </span>{" "}
              <span style={{ color: LEVEL_COLORS[entry.level] }}>[{entry.level.toUpperCase()}]</span>{" "}
              {entry.message}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

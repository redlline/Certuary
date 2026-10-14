import { useEffect, useState } from "react";
import { Database, HardDrive, RefreshCw, Play, Trash2, Ban } from "lucide-react";
import { api } from "../api";
import type { DiskSample, MinioSample, RotationRun, RotationStatus } from "../types";

function fmtGb(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  return `${(bytes / 1073741824).toFixed(1)} ГБ`;
}

function barColor(pct: number | null): string {
  if (pct === null) return "var(--border)";
  if (pct >= 90) return "#f87171";
  if (pct >= 80) return "#facc15";
  return "#4ade80";
}

function UsageBar({ pct }: { pct: number | null }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: barColor(pct) }}
      />
    </div>
  );
}

const STATUS_LABELS: Record<RotationStatus, string> = {
  preparing: "Подготовка списков…",
  awaiting_delete_originals: "Ожидает подтверждения удаления оригиналов",
  deleting_originals: "Удаление оригинальных mp4…",
  copying: "Копирование на venus/saturn/jupiter…",
  verifying: "Верификация копий…",
  awaiting_delete_movies: "Ожидает подтверждения удаления с mercury",
  deleting_movies: "Удаление данных с mercury…",
  done: "Завершена",
  failed: "Ошибка",
  cancelled: "Отменена",
};

const ACTIVE: RotationStatus[] = [
  "preparing",
  "awaiting_delete_originals",
  "deleting_originals",
  "copying",
  "verifying",
  "awaiting_delete_movies",
  "deleting_movies",
];

const TARGET_LABELS: Record<string, string> = {
  originals: "Оригиналы (mp4)",
  jupiter: "→ jupiter",
  saturn: "→ saturn",
  venus: "→ venus",
  mercury: "Очистка mercury",
};

export function StoragePage() {
  const [disks, setDisks] = useState<DiskSample[]>([]);
  const [minio, setMinio] = useState<MinioSample[]>([]);
  const [run, setRun] = useState<RotationRun | null>(null);
  const [history, setHistory] = useState<RotationRun[]>([]);
  const [mcliConfigured, setMcliConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const o = await api.storageOverview();
      setDisks(o.disks);
      setMinio(o.minio);
      setRun(o.run);
      setMcliConfigured(o.mcliConfigured);
      setHistory(await api.rotationHistory());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await api.collectStorage();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const activeRun = run && ACTIVE.includes(run.status) ? run : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-h)]">Хранилище / MinIO</h1>
          <p className="text-sm text-[var(--text-dim)]">
            Наполнение дисков и миграция архива mercury → venus/saturn/jupiter
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2"
          style={{ border: "1px solid var(--border)" }}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Обновить
        </button>
      </div>

      {error && (
        <div className="rounded-md px-4 py-2 text-sm" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {!mcliConfigured && (
        <div className="rounded-md px-4 py-3 text-sm" style={{ background: "rgba(250,204,21,0.1)", color: "#facc15" }}>
          Сервер с mcli не настроен — укажите его в Настройках (например, cache-4).
        </div>
      )}

      <section>
        <h2 className="text-sm font-medium text-[var(--text-h)] mb-3 flex items-center gap-2">
          <Database size={15} /> MinIO-кластеры
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {minio.length === 0 && (
            <div className="text-sm text-[var(--text-dim)]">Данных пока нет — нажмите «Обновить»</div>
          )}
          {minio.map((m) => (
            <div
              key={m.alias}
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-h)]">{m.alias}</span>
                <span className="text-xs" style={{ color: barColor(m.use_pct) }}>
                  {m.use_pct !== null ? `${m.use_pct.toFixed(0)}%` : "недоступен"}
                </span>
              </div>
              <UsageBar pct={m.use_pct} />
              <div className="text-xs text-[var(--text-dim)]">
                {fmtGb(m.used_bytes)} / {fmtGb(m.total_bytes)}
                {m.objects !== null && ` · ${m.objects} объектов`}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-xl p-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-sm font-medium text-[var(--text-h)] mb-3">Миграция архива</h2>
        {activeRun ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-h)]">{STATUS_LABELS[activeRun.status]}</span>
              <span className="text-[var(--text-dim)] text-xs">
                {activeRun.total_ids} объектов · старше {activeRun.older_than}
              </span>
            </div>
            {activeRun.detail && <div className="text-xs text-[var(--text-dim)]">{activeRun.detail}</div>}
            <div className="flex flex-col gap-1.5">
              {(activeRun.progress ?? []).map((p) => (
                <div key={p.target} className="flex items-center gap-3 text-xs">
                  <span className="w-32 text-[var(--text-dim)]">{TARGET_LABELS[p.target] ?? p.target}</span>
                  <div className="flex-1">
                    <UsageBar pct={activeRun.total_ids ? (p.done_count / activeRun.total_ids) * 100 : null} />
                  </div>
                  <span className="w-24 text-right text-[var(--text-dim)]">
                    {p.done_count}/{activeRun.total_ids} {p.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              {activeRun.status === "awaiting_delete_originals" && (
                <button
                  disabled={busy}
                  onClick={() => action(() => api.confirmRotation(activeRun.id, "originals"))}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <Trash2 size={14} /> Подтвердить удаление оригиналов
                </button>
              )}
              {activeRun.status === "awaiting_delete_movies" && (
                <button
                  disabled={busy}
                  onClick={() => action(() => api.confirmRotation(activeRun.id, "movies"))}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <Trash2 size={14} /> Подтвердить удаление с mercury
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => action(() => api.cancelRotation(activeRun.id))}
                className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2"
                style={{ border: "1px solid var(--border)", color: "#f87171" }}
              >
                <Ban size={14} /> Отменить
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              disabled={busy || !mcliConfigured}
              onClick={() => action(() => api.startRotation())}
              className="btn-primary flex items-center gap-1.5"
            >
              <Play size={14} /> Запустить миграцию
            </button>
            <span className="text-xs text-[var(--text-dim)]">
              find {`--older-than`} из настроек; удаление — только после вашего подтверждения
            </span>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-[var(--text-h)] mb-3 flex items-center gap-2">
          <HardDrive size={15} /> Диски серверов
        </h2>
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-dim)]" style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-4 py-2">Сервер</th>
                <th className="px-4 py-2">Точка</th>
                <th className="px-4 py-2">Использовано</th>
                <th className="px-4 py-2 w-48">Заполнено</th>
                <th className="px-4 py-2">Замер</th>
              </tr>
            </thead>
            <tbody>
              {disks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--text-dim)]">
                    Замеры появятся после первого сбора (каждые 15 минут) или кнопкой «Обновить»
                  </td>
                </tr>
              )}
              {disks.map((d) => (
                <tr key={`${d.server_id}:${d.mount}`} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-2 text-[var(--text-h)]">{d.server_name}</td>
                  <td className="px-4 py-2 text-[var(--text-dim)]">{d.mount}</td>
                  <td className="px-4 py-2 text-[var(--text-dim)]">
                    {fmtGb(d.used_bytes)} / {fmtGb(d.total_bytes)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <UsageBar pct={d.use_pct} />
                      </div>
                      <span className="text-xs w-10 text-right" style={{ color: barColor(d.use_pct) }}>
                        {d.use_pct.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--text-dim)]">{d.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-[var(--text-h)] mb-3">История миграций</h2>
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-dim)]" style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-4 py-2">Запуск</th>
                  <th className="px-4 py-2">Статус</th>
                  <th className="px-4 py-2">Объектов</th>
                  <th className="px-4 py-2">Детали</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-2 text-[var(--text-dim)] text-xs">{r.created_at}</td>
                    <td className="px-4 py-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            r.status === "done"
                              ? "rgba(74,222,128,0.12)"
                              : r.status === "failed" || r.status === "cancelled"
                                ? "rgba(248,113,113,0.12)"
                                : "rgba(250,204,21,0.12)",
                          color:
                            r.status === "done"
                              ? "#4ade80"
                              : r.status === "failed" || r.status === "cancelled"
                                ? "#f87171"
                                : "#facc15",
                        }}
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[var(--text-dim)]">{r.total_ids}</td>
                    <td className="px-4 py-2 text-xs text-[var(--text-dim)]">{r.error ?? r.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

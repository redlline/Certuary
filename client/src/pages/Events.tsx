import { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { api } from "../api";
import type { EventRow } from "../types";

const EVENT_LABELS: Record<string, string> = {
  scan: "Сканирование",
  upload: "Загрузка сертификата",
  reload: "Reload nginx",
};

export function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listEvents(200).then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, []);

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-h)]">Журнал событий</h1>
        <p className="text-sm text-[var(--text-dim)]">
          Сканирования, загрузки сертификатов, reload и ошибки
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {["all", "scan", "upload", "reload"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs rounded-md px-3 py-1.5 shrink-0 ${filter === f ? "tab-active" : "tab"}`}
          >
            {f === "all" ? "Все" : (EVENT_LABELS[f] ?? f)}
          </button>
        ))}
      </div>

      <div className="rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--text-dim)]">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--text-dim)]">Событий нет</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-dim)] text-xs" style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Время</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Тип</th>
                  <th className="px-5 py-2 font-normal">Сообщение</th>
                  <th className="px-5 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => (
                  <tr key={ev.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-2.5 text-[var(--text-dim)] whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-h)] whitespace-nowrap">
                      {EVENT_LABELS[ev.type] ?? ev.type}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-dim)]">{ev.message}</td>
                    <td className="px-5 py-2.5">
                      {ev.success ? (
                        <CircleCheck size={15} color="#4ade80" />
                      ) : (
                        <CircleX size={15} color="#f87171" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

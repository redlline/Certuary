import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate } from "../lib/dates";
import type { SiteRow } from "../types";
import { SiteModal } from "./SiteModal";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function levelColor(count: number): string {
  if (count === 0) return "transparent";
  if (count === 1) return "#6366f1";
  if (count === 2) return "#eab308";
  return "#ef4444";
}

export function CertCalendar({ sites }: { sites: SiteRow[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const [modalSite, setModalSite] = useState<SiteRow | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, SiteRow[]>();
    for (const site of sites) {
      if (!site.not_after) continue;
      const d = new Date(site.not_after);
      d.setHours(0, 0, 0, 0);
      const key = dateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(site);
    }
    return map;
  }, [sites]);

  const upcoming = useMemo(
    () =>
      sites
        .filter((s) => s.not_after && new Date(s.not_after) >= today)
        .sort((a, b) => (a.not_after ?? "").localeCompare(b.not_after ?? ""))
        .slice(0, 8),
    [sites],
  );

  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstOffset = (new Date(year, monthIdx, 1).getDay() + 6) % 7;
  const gridStart = new Date(year, monthIdx, 1 - firstOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }

  const monthLabel = month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const selectedSites = selected ? (byDay.get(selected) ?? []) : null;
  const selectedLabel = selected
    ? new Date(
        Number(selected.split("-")[0]),
        Number(selected.split("-")[1]),
        Number(selected.split("-")[2]),
      ).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    : null;

  return (
    <div className="flex flex-col md:flex-row gap-5">
      <div className="flex flex-col gap-3 shrink-0" style={{ width: 280 }}>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMonth(new Date(year, monthIdx - 1, 1))}
            className="rounded-md p-1 hover:bg-[var(--bg-hover)]"
            style={{ border: "1px solid var(--border)" }}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-medium text-[var(--text-h)] capitalize">{monthLabel}</span>
          <button
            onClick={() => setMonth(new Date(year, monthIdx + 1, 1))}
            className="rounded-md p-1 hover:bg-[var(--bg-hover)]"
            style={{ border: "1px solid var(--border)" }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[9px] text-[var(--text-dim)] pb-0.5">
              {d}
            </div>
          ))}
          {days.map((day, i) => {
            const inMonth = day.getMonth() === monthIdx;
            const key = dateKey(day);
            const daySites = byDay.get(key) ?? [];
            const isToday = dateKey(day) === dateKey(today);
            const isSelected = key === selected;
            const hasCerts = daySites.length > 0;
            return (
              <button
                key={i}
                type="button"
                disabled={!hasCerts}
                onClick={() => setSelected(isSelected ? null : key)}
                className="relative flex items-center justify-center rounded text-[11px] font-medium transition"
                style={{
                  width: 32,
                  height: 32,
                  opacity: inMonth ? 1 : 0.3,
                  border: isSelected
                    ? "1.5px solid var(--text-h)"
                    : isToday
                      ? "1.5px solid #6366f1"
                      : "1px solid transparent",
                  background: hasCerts ? levelColor(daySites.length) : "transparent",
                  color: hasCerts ? "#fff" : inMonth ? "var(--text-h)" : "var(--text-dim)",
                  cursor: hasCerts ? "pointer" : "default",
                }}
                title={
                  hasCerts
                    ? `${daySites.length === 1 ? "1 сертификат" : `${daySites.length} сертификата`}: ${daySites.map((s) => s.domain).join(", ")}`
                    : undefined
                }
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-[var(--text-dim)] flex-wrap">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: "#6366f1" }} /> 1
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: "#eab308" }} /> 2
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: "#ef4444" }} /> 3+
          </span>
          <span>— нажмите на закрашенную дату, чтобы увидеть сертификаты</span>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--text-h)] flex items-center gap-1.5">
            <CalendarDays size={14} style={{ color: "var(--text-dim)" }} />
            {selectedSites ? `Истекают ${selectedLabel}` : "Ближайшие истечения"}
          </h3>
          {selectedSites && (
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-[var(--text-dim)] hover:text-[var(--text-h)] hover:underline"
            >
              Показать все
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {(selectedSites ?? upcoming).length === 0 ? (
            <div className="text-sm text-[var(--text-dim)] py-4">
              Нет данных о сроках сертификатов
            </div>
          ) : (
            (selectedSites ?? upcoming).map((site) => (
              <button
                key={site.id}
                onClick={() => setModalSite(site)}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition hover:bg-[var(--bg-hover,rgba(255,255,255,0.04))] text-left"
                style={{ border: "1px solid var(--border)" }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[var(--text-h)] truncate">{site.domain}</span>
                  <span className="text-xs text-[var(--text-dim)] truncate">{site.server_name}</span>
                </div>
                <span className="text-xs text-[var(--text-dim)] whitespace-nowrap shrink-0">
                  {fmtDate(site.not_after)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {modalSite && (
        <SiteModal site={modalSite} onClose={() => setModalSite(null)} onUpdated={setModalSite} />
      )}
    </div>
  );
}

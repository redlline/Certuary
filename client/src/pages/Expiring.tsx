import { useEffect, useMemo, useState } from "react";
import { CloudUpload, Download, Power } from "lucide-react";
import { api } from "../api";
import { CertUploadModal } from "../components/CertUploadModal";
import { ExpiryBadge } from "../components/ExpiryBadge";
import { expiryStatus, fmtDate } from "../lib/dates";
import type { SiteRow } from "../types";

export function ExpiringPage() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadSite, setUploadSite] = useState<SiteRow | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadResults, setReloadResults] = useState<
    { serverId: string; ok: boolean; output: string }[] | null
  >(null);

  async function load() {
    setLoading(true);
    const all = await api.listSites();
    setSites(all.filter((s) => ["warning", "critical", "expired"].includes(expiryStatus(s.not_after))));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const selectedServerIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of selected) {
      const site = sites.find((s) => s.id === id);
      if (site) set.add(site.server_id);
    }
    return Array.from(set);
  }, [selected, sites]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === sites.length) setSelected(new Set());
    else setSelected(new Set(sites.map((s) => s.id)));
  }

  async function reloadSelected() {
    if (selectedServerIds.length === 0) return;
    setReloading(true);
    setReloadResults(null);
    try {
      const { results } = await api.batchReload(selectedServerIds);
      setReloadResults(results);
    } finally {
      setReloading(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["Домен", "Сервер", "Издатель", "Истекает", "Дней осталось"],
      ...sites.map((s) => {
        const days = s.not_after
          ? Math.floor((new Date(s.not_after).getTime() - Date.now()) / 86400000)
          : "";
        return [
          s.domain,
          s.server_name ?? "",
          s.issuer ?? "",
          s.not_after ? fmtDate(s.not_after) : "",
          String(days),
        ];
      }),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certuary-expiring-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-h)]">Все истекающие</h1>
          <p className="text-sm text-[var(--text-dim)]">
            Сертификаты, требующие внимания (≤30 дней или истекли)
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={sites.length === 0}
          className="flex items-center justify-center gap-1.5 text-sm rounded-md px-3 py-2 w-fit"
          style={{ border: "1px solid var(--border)" }}
        >
          <Download size={14} /> Экспорт CSV
        </button>
      </div>

      {selected.size > 0 && (
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg px-4 py-3"
          style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}
        >
          <span className="text-sm text-[var(--text-h)]">
            Выбрано {selected.size}, серверов: {selectedServerIds.length}
          </span>
          <button
            onClick={reloadSelected}
            disabled={reloading}
            className="btn-primary flex items-center justify-center gap-1.5 sm:ml-auto"
          >
            <Power size={14} /> {reloading ? "Перезагрузка..." : "Reload выбранных серверов"}
          </button>
        </div>
      )}

      {reloadResults && (
        <div
          className="rounded-lg p-3 text-sm flex flex-col gap-1"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {reloadResults.map((r) => (
            <div key={r.serverId} style={{ color: r.ok ? "#4ade80" : "#f87171" }}>
              {r.ok ? "OK" : "Ошибка"}: {r.serverId} {!r.ok && `— ${r.output}`}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--text-dim)]">Загрузка...</div>
        ) : sites.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--text-dim)]">
            Все сертификаты в порядке
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-dim)] text-xs" style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-2 font-normal">
                    <input
                      type="checkbox"
                      checked={selected.size === sites.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Домен</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Сервер</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Истекает</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Статус</th>
                  <th className="px-5 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(site.id)}
                        onChange={() => toggle(site.id)}
                      />
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-h)] whitespace-nowrap">{site.domain}</td>
                    <td className="px-5 py-2.5 text-[var(--text-dim)] whitespace-nowrap">
                      {site.server_name}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-dim)] whitespace-nowrap">
                      {fmtDate(site.not_after)}
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <ExpiryBadge notAfter={site.not_after} />
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => setUploadSite(site)}
                        className="flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 ml-auto"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <CloudUpload size={13} /> Обновить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uploadSite && (
        <CertUploadModal
          site={uploadSite}
          onClose={() => setUploadSite(null)}
          onDeployed={load}
        />
      )}
    </div>
  );
}

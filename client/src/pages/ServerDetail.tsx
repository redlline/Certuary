import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CloudUpload, Pencil, Power, Radio, RefreshCw } from "lucide-react";
import { api } from "../api";
import { CertUploadModal } from "../components/CertUploadModal";
import { ExpiryBadge } from "../components/ExpiryBadge";
import { ServerModal } from "../components/ServerModal";
import { StatusDot } from "../components/ServerCard";
import { SiteModal } from "../components/SiteModal";
import { fmtDate } from "../lib/dates";
import type { ServerRow, SiteRow } from "../types";

export function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [server, setServer] = useState<ServerRow | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadSite, setUploadSite] = useState<SiteRow | null>(null);
  const [modalSite, setModalSite] = useState<SiteRow | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadResult, setReloadResult] = useState<{ ok: boolean; output: string } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewResult, setRenewResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    const [server, sites] = await Promise.all([api.getServer(id), api.listSites(id)]);
    setServer(server);
    setSites(sites.map((s) => ({ ...s, server_name: server.name })));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function scan() {
    if (!id) return;
    await api.scanServer(id);
    load();
  }

  async function checkLive(siteId: string) {
    await api.checkLive(siteId);
    load();
  }

  async function renewNpm(siteId: string) {
    setRenewingId(siteId);
    setRenewResult(null);
    try {
      const res = await api.renewNpmCert(siteId);
      setRenewResult({ ok: res.ok, message: res.message });
    } catch (e) {
      setRenewResult({ ok: false, message: (e as Error).message ?? String(e) });
    } finally {
      setRenewingId(null);
      load();
    }
  }

  async function reload() {
    if (!id) return;
    setReloading(true);
    setReloadResult(null);
    try {
      setReloadResult(await api.reloadServer(id));
    } finally {
      setReloading(false);
    }
  }

  if (loading || !server) {
    return <div className="text-[var(--text-dim)]">Загрузка...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/servers"
        className="flex items-center gap-1.5 text-sm text-[var(--text-dim)] hover:text-[var(--text-h)] w-fit"
      >
        <ArrowLeft size={14} /> Все серверы
      </Link>

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatusDot status={server.status} />
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-h)]">{server.name}</h1>
            <p className="text-sm text-[var(--text-dim)]">
              {server.ssh_user}@{server.host}:{server.port} • последняя проверка:{" "}
              {server.last_checked_at ? fmtDate(server.last_checked_at) : "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2"
            style={{ border: "1px solid var(--border)" }}
          >
            <Pencil size={14} /> Редактировать
          </button>
          <button
            onClick={scan}
            className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2"
            style={{ border: "1px solid var(--border)" }}
          >
            <RefreshCw size={14} /> {server.kind === "npm" ? "Обновить из NPM" : "Сканировать"}
          </button>
          {server.kind !== "npm" && (
            <button onClick={reload} disabled={reloading} className="btn-primary flex items-center gap-1.5">
              <Power size={14} /> {reloading ? "Перезагрузка..." : "Reload nginx"}
            </button>
          )}
        </div>
      </div>

      {server.last_error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
        >
          {server.last_error}
        </div>
      )}
      {reloadResult && (
        <div
          className="rounded-md px-3 py-2 text-sm whitespace-pre-wrap"
          style={{
            background: reloadResult.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            color: reloadResult.ok ? "#4ade80" : "#f87171",
          }}
        >
          {reloadResult.ok ? "nginx перезагружен успешно" : `Ошибка reload:\n${reloadResult.output}`}
        </div>
      )}
      {renewResult && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: renewResult.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            color: renewResult.ok ? "#4ade80" : "#f87171",
          }}
        >
          {renewResult.message}
        </div>
      )}

      <div className="rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-medium text-[var(--text-h)]">
            Сайты и сертификаты ({sites.length})
          </h2>
        </div>
        {sites.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--text-dim)]">
            Сайты не найдены. Запустите сканирование после проверки путей к конфигам.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-dim)] text-xs" style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Домен / CN</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">SAN</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Издатель</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Истекает</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Статус</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">На проде</th>
                  <th className="px-5 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => {
                  const sans: string[] = site.sans ? JSON.parse(site.sans) : [];
                  return (
                    <tr key={site.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <button onClick={() => setModalSite(site)} className="text-left hover:underline">
                          <div className="text-[var(--text-h)]">{site.domain}</div>
                          {site.subject_cn && site.subject_cn !== site.domain && (
                            <div className="text-xs text-[var(--text-dim)]">CN: {site.subject_cn}</div>
                          )}
                        </button>
                      </td>
                      <td
                        className="px-5 py-2.5 text-[var(--text-dim)] text-xs max-w-[220px]"
                        title={sans.join(", ")}
                      >
                        {sans.length === 0
                          ? "—"
                          : sans.length <= 2
                            ? sans.join(", ")
                            : `${sans.slice(0, 2).join(", ")} +${sans.length - 2}`}
                      </td>
                      <td className="px-5 py-2.5 text-[var(--text-dim)] whitespace-nowrap">
                        {site.issuer ?? "—"}
                      </td>
                      <td className="px-5 py-2.5 text-[var(--text-dim)] whitespace-nowrap">
                        {fmtDate(site.not_after)}
                      </td>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <ExpiryBadge notAfter={site.not_after} />
                      </td>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() =>
                            site.live_status === "unknown" ? checkLive(site.id) : setModalSite(site)
                          }
                          className="flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1"
                          style={{
                            background:
                              site.live_status === "ok"
                                ? "rgba(34,197,94,0.12)"
                                : site.live_status === "mismatch"
                                  ? "rgba(239,68,68,0.12)"
                                  : "rgba(107,114,128,0.12)",
                            color:
                              site.live_status === "ok"
                                ? "#4ade80"
                                : site.live_status === "mismatch"
                                  ? "#f87171"
                                  : "#9ca3af",
                          }}
                          title={
                            site.live_status === "unknown"
                              ? "Нажмите, чтобы проверить"
                              : "Нажмите, чтобы увидеть подробности"
                          }
                        >
                          <Radio size={12} />
                          {site.live_status === "ok"
                            ? "совпадает"
                            : site.live_status === "mismatch"
                              ? "не совпадает"
                              : site.live_status === "unreachable"
                                ? "недоступен"
                                : "проверить"}
                        </button>
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        {server.kind === "npm" ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => renewNpm(site.id)}
                              disabled={renewingId === site.id}
                              className="flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5"
                              style={{ border: "1px solid var(--border)" }}
                              title="Запросить обновление через Let's Encrypt в NPM"
                            >
                              <RefreshCw size={13} className={renewingId === site.id ? "animate-spin" : ""} />
                              {renewingId === site.id ? "..." : "Let's Encrypt"}
                            </button>
                            <button
                              onClick={() => setUploadSite(site)}
                              className="flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5"
                              style={{ border: "1px solid var(--border)" }}
                              title="Загрузить свой сертификат (например ZeroSSL) и привязать в NPM"
                            >
                              <CloudUpload size={13} /> Свой
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setUploadSite(site)}
                            className="flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 ml-auto"
                            style={{ border: "1px solid var(--border)" }}
                          >
                            <CloudUpload size={13} /> Обновить сертификат
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
      {showEdit && (
        <ServerModal
          server={server}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            load();
          }}
        />
      )}
      {modalSite && (
        <SiteModal
          site={modalSite}
          onClose={() => setModalSite(null)}
          onUpdated={(updated) => {
            setModalSite(updated);
            setSites((list) =>
              list.map((s) => (s.id === updated.id ? { ...updated, server_name: server.name } : s)),
            );
          }}
        />
      )}
    </div>
  );
}

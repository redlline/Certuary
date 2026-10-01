import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import { api } from "../api";
import { fmtDate } from "../lib/dates";
import type { LiveStatus, SiteRow } from "../types";
import { ExpiryBadge } from "./ExpiryBadge";

const LIVE_LABELS: Record<LiveStatus, string> = {
  unknown: "Не проверено",
  ok: "Совпадает",
  mismatch: "Не совпадает",
  unreachable: "Недоступен",
};

const LIVE_COLORS: Record<LiveStatus, string> = {
  unknown: "#9ca3af",
  ok: "#4ade80",
  mismatch: "#f87171",
  unreachable: "#9ca3af",
};

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-[var(--text-h)] uppercase tracking-wide">
          {title}
        </h3>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function KVRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-[var(--text-dim)] shrink-0">{label}</span>
      <span className={`text-[var(--text-h)] text-right break-all ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function SiteModal({
  site,
  onClose,
  onUpdated,
}: {
  site: SiteRow;
  onClose: () => void;
  onUpdated?: (site: SiteRow) => void;
}) {
  const [current, setCurrent] = useState(site);
  const [checking, setChecking] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewResult, setRenewResult] = useState<{ ok: boolean; text: string } | null>(null);
  const sans: string[] = current.sans ? JSON.parse(current.sans) : [];

  async function checkLive() {
    setChecking(true);
    try {
      const updated = await api.checkLive(current.id);
      setCurrent(updated);
      onUpdated?.(updated);
    } finally {
      setChecking(false);
    }
  }

  async function renewNpm() {
    setRenewing(true);
    setRenewResult(null);
    try {
      const res = await api.renewNpmCert(current.id);
      setRenewResult({ ok: res.ok, text: res.message });
      if (res.site) {
        setCurrent(res.site);
        onUpdated?.(res.site);
      }
    } catch (e) {
      setRenewResult({ ok: false, text: (e as Error).message ?? String(e) });
    } finally {
      setRenewing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-lg rounded-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-medium text-[var(--text-h)]">{current.domain}</h2>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-h)]">
            <X size={18} />
          </button>
        </div>
        <Link
          to={`/servers/${current.server_id}`}
          className="text-xs text-[var(--text-dim)] hover:underline"
        >
          {current.server_name ?? "Сервер"} →
        </Link>

        <div className="mt-4 flex items-center gap-2">
          <ExpiryBadge notAfter={current.not_after} />
        </div>

        {current.server_kind === "npm" && (
          <Section title="Nginx Proxy Manager">
            <p className="text-sm text-[var(--text-dim)]">
              Сертификат выпущен и хранится в NPM. Можно запросить обновление через
              Let&apos;s Encrypt прямо в NPM, либо загрузить свой готовый сертификат
              (например ZeroSSL) — кнопка &quot;Свой&quot; в таблице сайтов сервера.
            </p>
            <button
              type="button"
              onClick={renewNpm}
              disabled={renewing}
              className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2 w-fit mt-1"
              style={{ border: "1px solid var(--border)" }}
            >
              <RefreshCw size={13} className={renewing ? "animate-spin" : ""} />
              {renewing ? "Обновление..." : "Обновить через NPM (Let's Encrypt)"}
            </button>
            {renewResult && (
              <div className="text-sm" style={{ color: renewResult.ok ? "#4ade80" : "#f87171" }}>
                {renewResult.text}
              </div>
            )}
          </Section>
        )}

        <Section title="Сертификат на диске (файл сервера)">
          <KVRow label="CN" value={current.subject_cn ?? "—"} />
          <KVRow label="SAN" value={sans.length ? sans.join(", ") : "—"} />
          <KVRow label="Издатель" value={current.issuer ?? "—"} />
          <KVRow label="Действителен с" value={fmtDate(current.not_before)} />
          <KVRow label="Действителен до" value={fmtDate(current.not_after)} />
          <KVRow label="Отпечаток (SHA-256)" value={current.fingerprint ?? "—"} mono />
          {current.cert_path && <KVRow label="Путь к сертификату" value={current.cert_path} mono />}
          {current.key_path && <KVRow label="Путь к ключу" value={current.key_path} mono />}
          {current.chain_path && <KVRow label="Путь к цепочке" value={current.chain_path} mono />}
          {current.trusted_cert_path && (
            <KVRow label="ssl_trusted_certificate" value={current.trusted_cert_path} mono />
          )}
          <KVRow
            label="Последняя синхронизация"
            value={current.last_synced_at ? fmtDate(current.last_synced_at) : "—"}
          />
        </Section>

        <Section
          title="Проверка в реальном времени (что реально отдаёт сервер по 443)"
          action={
            <button
              onClick={checkLive}
              disabled={checking}
              className="flex items-center gap-1 text-xs rounded-md px-2 py-1 hover:bg-[var(--bg-hover)]"
              style={{ border: "1px solid var(--border)" }}
            >
              <RefreshCw size={11} className={checking ? "animate-spin" : ""} />
              {checking ? "Проверка..." : "Перепроверить"}
            </button>
          }
        >
          <KVRow
            label="Статус"
            value={
              <span style={{ color: LIVE_COLORS[current.live_status] }}>
                {LIVE_LABELS[current.live_status]}
              </span>
            }
          />
          <KVRow
            label="Проверено"
            value={current.live_checked_at ? fmtDate(current.live_checked_at) : "—"}
          />
          {current.live_status !== "unknown" && current.live_status !== "unreachable" && (
            <>
              <KVRow label="CN (по сети)" value={current.live_subject_cn ?? "—"} />
              <KVRow label="Издатель (по сети)" value={current.live_issuer ?? "—"} />
              <KVRow
                label="Срок (по сети)"
                value={current.live_not_after ? fmtDate(current.live_not_after) : "—"}
              />
              <KVRow label="Отпечаток (по сети)" value={current.live_fingerprint ?? "—"} mono />
            </>
          )}
          {current.live_status === "unreachable" && (
            <p className="text-sm mt-2" style={{ color: "#f87171" }}>
              Не удалось подключиться к {current.server_host ?? "серверу"}:{current.https_port} по
              TLS (таймаут или соединение закрыто).
            </p>
          )}
          {current.live_status === "mismatch" && (
            <div className="mt-2 flex flex-col gap-2 text-sm" style={{ color: "#f87171" }}>
              <p>
                Сертификат, реально отданный на {current.server_host}:{current.https_port}, отличается
                от того, что в файле на диске.
              </p>
              <p>
                Ожидался (из файла): CN={current.subject_cn ?? "—"}, издатель={current.issuer ?? "—"}
              </p>
              <p>
                Получен по сети: CN={current.live_subject_cn ?? "—"}, издатель=
                {current.live_issuer ?? "—"}, срок=
                {current.live_not_after ? fmtDate(current.live_not_after) : "—"}
              </p>
              <p className="text-[var(--text-dim)]">
                Возможные причины: промежуточный proxy/SSL-инспекция (например nxfilter) на пути
                проверки, балансировщик отдаёт другой backend, либо домен резолвится на другой IP,
                чем указан как host этого сервера.
              </p>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

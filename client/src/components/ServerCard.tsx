import { Link } from "react-router-dom";
import { Pencil, RefreshCw, Server, Trash2 } from "lucide-react";
import { timeAgo } from "../lib/dates";
import type { ServerRow, ServerStatus } from "../types";
import { ExpiryBadge } from "./ExpiryBadge";

const STATUS_COLORS: Record<ServerStatus, string> = {
  online: "#22c55e",
  offline: "#ef4444",
  error: "#f97316",
  unknown: "#6b7280",
};

export function StatusDot({ status }: { status: ServerStatus }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      title={status}
    />
  );
}

export function ServerCard({
  server,
  onScan,
  onDelete,
  onEdit,
}: {
  server: ServerRow;
  onScan: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 transition hover:border-[var(--accent)]"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between">
        <Link to={`/servers/${server.id}`} className="flex items-center gap-2 group">
          <div className="rounded-lg p-2" style={{ background: "var(--accent-soft)" }}>
            <Server size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <div className="font-medium text-[var(--text-h)] group-hover:underline">
              {server.name}
            </div>
            <div className="text-xs text-[var(--text-dim)]">
              {server.ssh_user}@{server.host}:{server.port}
            </div>
          </div>
        </Link>
        <StatusDot status={server.status} />
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--text-dim)]">
        <span>
          {server.siteCount} {server.siteCount === 1 ? "сайт" : "сайтов"}
        </span>
        {server.soonestExpiry ? (
          <ExpiryBadge notAfter={server.soonestExpiry} />
        ) : (
          <span>нет сертификатов</span>
        )}
      </div>

      {server.last_error && (
        <div
          className="text-xs rounded-md px-2 py-1 truncate"
          style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
          title={server.last_error}
        >
          {server.last_error}
        </div>
      )}

      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <button
          onClick={() => onScan(server.id)}
          className="flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 transition hover:bg-[var(--bg-elevated)]"
          style={{ border: "1px solid var(--border)" }}
        >
          <RefreshCw size={13} /> Сканировать
        </button>
        <Link
          to={`/servers/${server.id}`}
          className="text-xs rounded-md px-2.5 py-1.5 transition hover:bg-[var(--bg-elevated)]"
          style={{ border: "1px solid var(--border)" }}
        >
          Подробнее
        </Link>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 transition hover:bg-[var(--bg-elevated)]"
          style={{ border: "1px solid var(--border)" }}
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(server.id)}
          className="ml-auto flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 transition hover:bg-[rgba(239,68,68,0.1)]"
          style={{ color: "#f87171" }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

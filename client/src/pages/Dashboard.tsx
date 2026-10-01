import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleQuestionMark, Server, ServerCrash, ServerOff, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { CertCalendar } from "../components/CertCalendar";
import { ExpiryBadge } from "../components/ExpiryBadge";
import { expiryStatus, fmtDate, timeAgo } from "../lib/dates";
import type { ServerGroup, ServerRow, ServerStatus, SiteRow } from "../types";

const SERVER_STATUS: Record<ServerStatus, { label: string; bg: string; text: string; border: string; icon: typeof Server }> = {
  online: {
    label: "Онлайн",
    bg: "rgba(34,197,94,0.12)",
    text: "#4ade80",
    border: "rgba(34,197,94,0.35)",
    icon: Server,
  },
  offline: {
    label: "Офлайн",
    bg: "rgba(239,68,68,0.12)",
    text: "#f87171",
    border: "rgba(239,68,68,0.35)",
    icon: ServerOff,
  },
  error: {
    label: "Ошибка",
    bg: "rgba(249,115,22,0.12)",
    text: "#fb923c",
    border: "rgba(249,115,22,0.35)",
    icon: ServerCrash,
  },
  unknown: {
    label: "Не проверен",
    bg: "rgba(107,114,128,0.12)",
    text: "#9ca3af",
    border: "rgba(107,114,128,0.35)",
    icon: CircleQuestionMark,
  },
};

function DashServerCard({ s }: { s: ServerRow }) {
  const st = SERVER_STATUS[s.status] ?? SERVER_STATUS.unknown;
  const Icon = st.icon;
  return (
    <Link
      to={`/servers/${s.id}`}
      className="rounded-xl p-4 flex flex-col gap-2 transition hover:border-[var(--accent)]"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-h)] truncate">{s.name}</span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0"
          style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}
        >
          <Icon size={11} />
          {st.label}
        </span>
      </div>
      <div className="text-xs text-[var(--text-dim)] truncate">
        {s.ssh_user}@{s.host}:{s.port}
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--text-dim)] mt-1">
        <span>
          {s.siteCount} {s.siteCount === 1 ? "сайт" : "сайтов"} • {timeAgo(s.last_checked_at)}
        </span>
        {s.soonestExpiry && <ExpiryBadge notAfter={s.soonestExpiry} />}
      </div>
    </Link>
  );
}

function ServerMiniGrid({ servers }: { servers: ServerRow[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
      {servers.map((s) => (
        <DashServerCard key={s.id} s={s} />
      ))}
    </div>
  );
}

function GroupedServers({ servers, groups }: { servers: ServerRow[]; groups: ServerGroup[] }) {
  if (servers.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center text-sm text-[var(--text-dim)]"
        style={{ background: "var(--bg-card)", border: "1px dashed var(--border)" }}
      >
        Серверы ещё не добавлены
      </div>
    );
  }
  if (!groups || groups.length === 0) return <ServerMiniGrid servers={servers} />;

  const grouped = groups
    .map((g) => ({ group: g, servers: servers.filter((s) => s.group_id === g.id) }))
    .filter((e) => e.servers.length > 0);
  const ungrouped = servers.filter((s) => !s.group_id || !groups.some((g) => g.id === s.group_id));

  return (
    <div className="flex flex-col gap-5">
      {grouped.map(({ group, servers: gs }) => (
        <div key={group.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-[var(--text-h)] uppercase tracking-wide">
              {group.name}
            </h3>
            <span className="text-[11px] text-[var(--text-dim)]">{gs.length}</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>
          <ServerMiniGrid servers={gs} />
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-[var(--text-h)] uppercase tracking-wide">
              Без группы
            </h3>
            <span className="text-[11px] text-[var(--text-dim)]">{ungrouped.length}</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>
          <ServerMiniGrid servers={ungrouped} />
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl p-4 flex items-center gap-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="rounded-lg p-2" style={{ background: "var(--accent-soft)", color: color ?? "var(--accent)" }}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-semibold text-[var(--text-h)]">{value}</div>
        <div className="text-xs text-[var(--text-dim)]">{label}</div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [groups, setGroups] = useState<ServerGroup[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [sites, servers, groups] = await Promise.all([
      api.listSites(),
      api.listServers(),
      api.listGroups(),
    ]);
    setSites(sites);
    setServers(servers);
    setGroups(groups);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="text-[var(--text-dim)]">Загрузка...</div>;

  const totalCerts = sites.length;
  const critical = sites.filter((s) => ["critical", "expired"].includes(expiryStatus(s.not_after))).length;
  const warning = sites.filter((s) => expiryStatus(s.not_after) === "warning").length;
  const ok = sites.filter((s) => expiryStatus(s.not_after) === "ok").length;
  const online = servers.filter((s) => s.status === "online").length;
  const attention = sites
    .filter((s) => ["critical", "expired", "warning"].includes(expiryStatus(s.not_after)))
    .sort((a, b) => (a.not_after ?? "").localeCompare(b.not_after ?? ""));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-h)]">Дашборд</h1>
        <p className="text-sm text-[var(--text-dim)]">Обзор флота nginx и сроков сертификатов</p>
      </div>

      {critical > 0 && (
        <div
          className="rounded-lg px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)" }}
        >
          <TriangleAlert size={18} style={{ color: "#f87171" }} />
          <span className="text-sm" style={{ color: "#f87171" }}>
            {critical} {critical === 1 ? "сертификат требует" : "сертификатов требуют"} немедленного
            внимания (≤7 дней или истёк)
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={<Server size={18} />} label="Серверов онлайн" value={`${online}/${servers.length}`} />
        <StatCard icon={<ShieldCheck size={18} />} label="Сертификатов в порядке" value={String(ok)} color="#4ade80" />
        <StatCard icon={<ShieldAlert size={18} />} label="Скоро истекают" value={String(warning)} color="#facc15" />
        <StatCard icon={<TriangleAlert size={18} />} label="Критично / истекли" value={String(critical)} color="#f87171" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-[var(--text-h)]">Серверы ({servers.length})</h2>
          <Link to="/servers" className="text-xs text-[var(--text-dim)] hover:text-[var(--text-h)] hover:underline">
            Все серверы →
          </Link>
        </div>
        <GroupedServers servers={servers} groups={groups} />
      </div>

      <div className="rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h2 className="text-sm font-medium text-[var(--text-h)] mb-3">Календарь истечений</h2>
        <CertCalendar sites={sites} />
      </div>

      <div className="rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-medium text-[var(--text-h)]">Требуют внимания</h2>
        </div>
        {attention.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--text-dim)]">
            Все сертификаты в порядке ({totalCerts} всего)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-dim)] text-xs" style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Домен</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Сервер</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Истекает</th>
                  <th className="px-5 py-2 font-normal whitespace-nowrap">Статус</th>
                </tr>
              </thead>
              <tbody>
                {attention.map((site) => (
                  <tr key={site.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-2.5 text-[var(--text-h)] whitespace-nowrap">{site.domain}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <Link to={`/servers/${site.server_id}`} className="hover:underline">
                        {site.server_name}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-[var(--text-dim)] whitespace-nowrap">
                      {fmtDate(site.not_after)}
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <ExpiryBadge notAfter={site.not_after} />
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

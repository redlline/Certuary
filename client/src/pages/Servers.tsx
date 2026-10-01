import { useEffect, useState } from "react";
import { FolderCog, Plus } from "lucide-react";
import { api } from "../api";
import { GroupsModal } from "../components/GroupsModal";
import { ServerCard } from "../components/ServerCard";
import { ServerModal } from "../components/ServerModal";
import type { ServerGroup, ServerRow } from "../types";

export function ServersPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [groups, setGroups] = useState<ServerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ServerRow | null>(null);
  const [showGroups, setShowGroups] = useState(false);

  async function load() {
    setLoading(true);
    const [servers, groups] = await Promise.all([api.listServers(), api.listGroups()]);
    setServers(servers);
    setGroups(groups);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function scan(id: string) {
    await api.scanServer(id);
    load();
  }

  async function remove(id: string) {
    if (confirm("Удалить сервер? Это удалит всю информацию о его сайтах и сертификатах.")) {
      await api.deleteServer(id);
      load();
    }
  }

  const grouped = groups.map((g) => ({
    group: g,
    servers: servers.filter((s) => s.group_id === g.id),
  }));
  const ungrouped = servers.filter((s) => !s.group_id || !groups.some((g) => g.id === s.group_id));

  function renderGrid(list: ServerRow[]) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((s) => (
          <ServerCard
            key={s.id}
            server={s}
            onScan={scan}
            onDelete={remove}
            onEdit={() => setEditing(s)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-h)]">Серверы</h1>
          <p className="text-sm text-[var(--text-dim)]">Удалённые серверы, подключённые по SSH</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGroups(true)}
            className="flex items-center justify-center gap-2 w-fit text-sm rounded-md px-3 py-2"
            style={{ border: "1px solid var(--border)" }}
          >
            <FolderCog size={16} /> Группы
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary flex items-center justify-center gap-2 w-fit"
          >
            <Plus size={16} /> Добавить сервер
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-[var(--text-dim)]">Загрузка...</div>
      ) : servers.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: "var(--bg-card)", border: "1px dashed var(--border)" }}
        >
          <p className="text-[var(--text-dim)] mb-3">Серверы ещё не добавлены</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            Добавить первый сервер
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped
            .filter((g) => g.servers.length > 0)
            .map(({ group, servers: gs }) => (
              <div key={group.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--text-h)] uppercase tracking-wide">
                    {group.name}
                  </h2>
                  <span className="text-xs text-[var(--text-dim)]">{gs.length}</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
                {renderGrid(gs)}
              </div>
            ))}
          {ungrouped.length > 0 && (
            <div className="flex flex-col gap-3">
              {groups.length > 0 && (
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--text-h)] uppercase tracking-wide">
                    Без группы
                  </h2>
                  <span className="text-xs text-[var(--text-dim)]">{ungrouped.length}</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
              )}
              {renderGrid(ungrouped)}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <ServerModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {editing && (
        <ServerModal
          server={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {showGroups && <GroupsModal onClose={() => setShowGroups(false)} onChanged={load} />}
    </div>
  );
}

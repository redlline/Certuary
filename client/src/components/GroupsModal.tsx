import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../api";
import type { ServerGroup } from "../types";

export function GroupsModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<ServerGroup[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setGroups(await api.listGroups());
  }

  useEffect(() => {
    reload();
  }, []);

  async function create() {
    if (!newName.trim()) return;
    setError(null);
    try {
      await api.createGroup(newName.trim());
      setNewName("");
      reload();
      onChanged();
    } catch (e) {
      setError((e as Error).message ?? String(e));
    }
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    setError(null);
    try {
      await api.renameGroup(id, editName.trim());
      setEditing(null);
      reload();
      onChanged();
    } catch (e) {
      setError((e as Error).message ?? String(e));
    }
  }

  async function remove(id: string) {
    if (confirm("Удалить группу? Серверы из неё останутся, но будут без группы.")) {
      await api.deleteGroup(id);
      reload();
      onChanged();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-[var(--text-h)]">Группы серверов</h2>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-h)]">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-3 text-sm" style={{ color: "#f87171" }}>
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2 mb-4">
          {groups.length === 0 && (
            <div className="text-sm text-[var(--text-dim)]">Групп пока нет</div>
          )}
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5"
              style={{ border: "1px solid var(--border)" }}
            >
              {editing === g.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input flex-1"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && rename(g.id)}
                  />
                  <button
                    onClick={() => rename(g.id)}
                    className="text-[var(--text-dim)] hover:text-[var(--text-h)]"
                  >
                    <Check size={15} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-[var(--text-h)]">{g.name}</span>
                  <button
                    onClick={() => {
                      setEditing(g.id);
                      setEditName(g.name);
                    }}
                    className="text-[var(--text-dim)] hover:text-[var(--text-h)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove(g.id)}
                    className="hover:opacity-80"
                    style={{ color: "#f87171" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Новая группа (организация)"
            className="input flex-1"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button onClick={create} className="btn-primary flex items-center gap-1.5 px-3">
            <Plus size={15} /> Добавить
          </button>
        </div>
      </div>
    </div>
  );
}

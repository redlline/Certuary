import { useEffect, useState } from "react";
import { Container, Plus, Search, X } from "lucide-react";
import { api } from "../api";
import type {
  AuthType,
  DockerCandidate,
  DockerContainerInfo,
  ServerGroup,
  ServerInput,
  ServerKind,
  ServerRow,
} from "../types";

const KIND_DEFAULTS: Record<ServerKind, { reload: string; test: string; configPaths: string }> = {
  nginx: {
    reload: "sudo systemctl reload nginx",
    test: "sudo nginx -t",
    configPaths: "/etc/nginx/sites-enabled/*, /etc/nginx/conf.d/*.conf",
  },
  apache: {
    reload: "sudo systemctl reload apache2",
    test: "sudo apachectl configtest",
    configPaths: "/etc/apache2/sites-enabled/*.conf, /etc/httpd/conf.d/*.conf",
  },
  haproxy: {
    reload: "sudo systemctl reload haproxy",
    test: "sudo haproxy -c -f /etc/haproxy/haproxy.cfg",
    configPaths: "/etc/haproxy/haproxy.cfg",
  },
  npm: { reload: "", test: "", configPaths: "" },
};

const KIND_LABELS: Record<ServerKind, string> = {
  nginx: "nginx",
  apache: "apache",
  haproxy: "haproxy",
  npm: "Nginx Proxy Manager",
};

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ""}`}>
      <span className="text-[var(--text-dim)]">{label}</span>
      {children}
    </label>
  );
}

export function ServerModal({
  server,
  onClose,
  onSaved,
}: {
  server?: ServerRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!server;
  const [name, setName] = useState(server?.name ?? "");
  const [kind, setKind] = useState<ServerKind>(server?.kind ?? "nginx");
  const [groups, setGroups] = useState<ServerGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(server?.group_id ?? null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [host, setHost] = useState(server?.host ?? "");
  const [port, setPort] = useState(server?.port ?? 22);
  const [sshUser, setSshUser] = useState(server?.ssh_user ?? "root");
  const [authType, setAuthType] = useState<AuthType>(server?.auth_type ?? "key");
  const [secret, setSecret] = useState("");
  const [reloadCommand, setReloadCommand] = useState(server?.reload_command ?? KIND_DEFAULTS.nginx.reload);
  const [testCommand, setTestCommand] = useState(server?.test_command ?? KIND_DEFAULTS.nginx.test);
  const [configPaths, setConfigPaths] = useState<string>(
    server ? (JSON.parse(server.config_paths) as string[]).join(", ") : KIND_DEFAULTS.nginx.configPaths,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [inDocker, setInDocker] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DockerCandidate[] | null>(null);
  const [allContainers, setAllContainers] = useState<DockerContainerInfo[] | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [sudoPw, setSudoPw] = useState("");

  useEffect(() => {
    api.listGroups().then(setGroups);
  }, []);

  async function createGroup() {
    if (!newGroupName.trim()) return;
    const group = await api.createGroup(newGroupName.trim());
    setGroups((gs) => [...gs, group].sort((a, b) => a.name.localeCompare(b.name)));
    setGroupId(group.id);
    setNewGroupName("");
    setNewGroupMode(false);
  }

  function selectKind(k: ServerKind) {
    setKind(k);
    if (!isEdit) {
      setReloadCommand(KIND_DEFAULTS[k].reload);
      setTestCommand(KIND_DEFAULTS[k].test);
      setConfigPaths(KIND_DEFAULTS[k].configPaths);
      if (k === "npm") {
        setAuthType("password");
        setPort(81);
      } else if (kind === "npm") {
        setPort(22);
      }
    }
    setCandidates(null);
    setAllContainers(null);
    setSelectedContainer(null);
    setInDocker(false);
  }

  async function detectDocker() {
    if (!host || !sshUser || !secret) {
      setDetectError("Сначала укажите хост, SSH-пользователя и пароль/ключ");
      return;
    }
    setDetecting(true);
    setDetectError(null);
    setCandidates(null);
    setAllContainers(null);
    try {
      const { candidates, allContainers } = await api.detectDocker({
        host,
        port,
        sshUser,
        authType,
        secret,
        kind,
        ...(sudoPw ? { sudoPassword: sudoPw } : {}),
      });
      setCandidates(candidates);
      if (candidates.length === 0) {
        setAllContainers(allContainers);
        setDetectError(
          allContainers.length === 0
            ? "На этом хосте не запущено ни одного Docker-контейнера"
            : `Среди запущенных контейнеров нет ни одного с образом, похожим на "${KIND_LABELS[kind]}" (ищем по названию образа)`,
        );
      }
    } catch (e) {
      setDetectError((e as Error).message ?? String(e));
    } finally {
      setDetecting(false);
    }
  }

  function applyCandidate(candidate: DockerCandidate) {
    setSelectedContainer(candidate.name);
    setReloadCommand(candidate.reloadCommand);
    setTestCommand(candidate.testCommand);
    if (candidate.configPaths.length > 0) setConfigPaths(candidate.configPaths.join(", "));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: ServerInput = {
        name,
        kind,
        groupId,
        host,
        port,
        sshUser,
        authType,
        ...(secret ? { secret } : {}),
        ...(sudoPw ? { sudoPassword: sudoPw } : {}),
        reloadCommand,
        testCommand,
        configPaths: configPaths
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      };
      let id: string;
      if (isEdit) {
        if (!secret && authType !== server!.auth_type) {
          setError("При смене типа авторизации нужно ввести новый пароль/ключ");
          setSaving(false);
          return;
        }
        id = (await api.updateServer(server!.id, input)).id;
      } else {
        if (!secret) {
          setError("Введите пароль или ключ");
          setSaving(false);
          return;
        }
        id = (await api.createServer(input)).id;
      }
      setTestResult(await api.testServer(id));
      onSaved();
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setSaving(false);
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-[var(--text-h)]">
            {isEdit ? "Редактировать сервер" : "Добавить сервер"}
          </h2>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-h)]">
            <X size={18} />
          </button>
        </div>

        {testResult && (
          <div
            className="mb-4 rounded-md px-3 py-2 text-sm"
            style={{
              background: testResult.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              color: testResult.ok ? "#4ade80" : "#f87171",
            }}
          >
            {testResult.ok ? "Подключение успешно: " : "Сохранено, но подключение не удалось: "}
            {testResult.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormField label="Название">
            <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
          </FormField>

          <FormField label="Тип сервера">
            <div className="flex gap-2 flex-wrap">
              {(["nginx", "apache", "haproxy", "npm"] as ServerKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => selectKind(k)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${k === "npm" ? "" : "capitalize"} ${kind === k ? "tab-active" : "tab"}`}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </FormField>

          {kind === "npm" && (
            <p className="text-xs text-[var(--text-dim)] -mt-1">
              Certuary подключится к API Nginx Proxy Manager и сам найдёт все добавленные там хосты,
              домены и сертификаты. Управлять reload&apos;ом и файлами конфигов через Certuary для
              этого типа не нужно — NPM делает это сам.
            </p>
          )}

          <FormField label="Группа (организация)">
            {newGroupMode ? (
              <div className="flex gap-2">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Название группы"
                  className="input"
                  autoFocus
                />
                <button type="button" onClick={createGroup} className="btn-primary px-3">
                  Добавить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewGroupMode(false);
                    setNewGroupName("");
                  }}
                  className="rounded-md px-3 text-sm"
                  style={{ border: "1px solid var(--border)" }}
                >
                  Отмена
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={groupId ?? ""}
                  onChange={(e) => setGroupId(e.target.value || null)}
                  className="input flex-1"
                >
                  <option value="">Без группы</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setNewGroupMode(true)}
                  className="rounded-md px-2.5 flex items-center justify-center"
                  style={{ border: "1px solid var(--border)" }}
                  title="Новая группа"
                >
                  <Plus size={15} />
                </button>
              </div>
            )}
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Хост" className="col-span-2">
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
                className="input"
                placeholder="192.168.1.10"
              />
            </FormField>
            <FormField label="Порт">
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="input"
              />
            </FormField>
          </div>

          <FormField label={kind === "npm" ? "Email администратора NPM" : "SSH пользователь"}>
            <input
              value={sshUser}
              onChange={(e) => setSshUser(e.target.value)}
              required
              className="input"
            />
          </FormField>

          {kind !== "npm" && (
            <FormField label="Тип авторизации">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAuthType("key")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${authType === "key" ? "tab-active" : "tab"}`}
                >
                  SSH-ключ
                </button>
                <button
                  type="button"
                  onClick={() => setAuthType("password")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${authType === "password" ? "tab-active" : "tab"}`}
                >
                  Пароль
                </button>
              </div>
            </FormField>
          )}

          <FormField
            label={
              kind === "npm"
                ? "Пароль администратора NPM"
                : authType === "key"
                  ? "Приватный ключ"
                  : "Пароль"
            }
          >
            {isEdit && (
              <p className="text-xs text-[var(--text-dim)] mb-1">
                Текущий {authType === "key" ? "ключ" : "пароль"} скрыт и не показывается. Оставьте
                поле пустым, чтобы не менять, или введите новое значение для замены.
              </p>
            )}
            {authType === "key" && kind !== "npm" ? (
              <textarea
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                rows={5}
                className="input font-mono text-xs"
                placeholder={isEdit ? "оставьте пустым, чтобы не менять" : "-----BEGIN OPENSSH PRIVATE KEY-----"}
              />
            ) : (
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="input"
                placeholder={isEdit ? "оставьте пустым, чтобы не менять" : undefined}
                autoComplete="new-password"
              />
            )}
          </FormField>

          {kind !== "npm" && sshUser !== "root" && (
            <FormField label="Пароль sudo">
              {isEdit && (
                <p className="text-xs text-[var(--text-dim)] mb-1">
                  Текущий пароль sudo скрыт. Пусто — не менять, введите значение для замены или
                  очистки.
                </p>
              )}
              <p className="text-xs text-[var(--text-dim)] mb-1">
                Для команд с правами root (reload, установка сертификатов). Если пусто —
                используется SSH-пароль или sudo без пароля (NOPASSWD).
              </p>
              <input
                type="password"
                value={sudoPw}
                onChange={(e) => setSudoPw(e.target.value)}
                className="input"
                autoComplete="new-password"
              />
            </FormField>
          )}

          {kind !== "npm" && (
            <div className="flex flex-col gap-2 rounded-md p-3" style={{ border: "1px solid var(--border)" }}>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={inDocker}
                  onChange={(e) => {
                    setInDocker(e.target.checked);
                    setCandidates(null);
                    setAllContainers(null);
                    setDetectError(null);
                  }}
                />
                <Container size={14} style={{ color: "var(--text-dim)" }} />
                Сервис запущен в Docker-контейнере
              </label>
              {inDocker && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-[var(--text-dim)]">
                    SSH должен вести на хост, где запущен Docker (не внутрь контейнера). Система
                    найдёт подходящие контейнеры и подставит команды reload/проверки и пути к
                    конфигам.
                  </p>
                  <button
                    type="button"
                    onClick={detectDocker}
                    disabled={detecting}
                    className="flex items-center gap-1.5 text-sm rounded-md px-3 py-1.5 w-fit"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    <Search size={13} />
                    {detecting ? "Поиск контейнеров..." : "Найти контейнеры"}
                  </button>
                  {detectError && (
                    <div className="text-xs" style={{ color: "#f87171" }}>
                      {detectError}
                    </div>
                  )}
                  {allContainers && allContainers.length > 0 && (
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-[11px] text-[var(--text-dim)]">
                        Запущенные на хосте контейнеры:
                      </span>
                      {allContainers.map((c) => (
                        <div key={c.name} className="text-[11px] font-mono text-[var(--text-dim)]">
                          {c.name} <span className="opacity-70">({c.image})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {candidates && candidates.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {candidates.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => applyCandidate(c)}
                          className="flex flex-col gap-1 rounded-md p-2.5 text-left text-xs transition"
                          style={{
                            border:
                              selectedContainer === c.name
                                ? "1px solid var(--accent)"
                                : "1px solid var(--border)",
                            background:
                              selectedContainer === c.name ? "var(--accent-soft)" : "transparent",
                          }}
                        >
                          <span className="font-medium text-[var(--text-h)]">
                            {c.name}{" "}
                            <span className="text-[var(--text-dim)] font-normal">({c.image})</span>
                          </span>
                          <span className="text-[var(--text-dim)] font-mono">{c.reloadCommand}</span>
                          {c.note && <span style={{ color: "#facc15" }}>{c.note}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {kind !== "npm" && (
            <>
              <FormField label="Команда reload">
                <input
                  value={reloadCommand}
                  onChange={(e) => setReloadCommand(e.target.value)}
                  className="input"
                />
              </FormField>
              <FormField label="Команда проверки конфига">
                <input
                  value={testCommand}
                  onChange={(e) => setTestCommand(e.target.value)}
                  className="input"
                />
              </FormField>
              <FormField label="Пути к конфигам (через запятую)">
                <input
                  value={configPaths}
                  onChange={(e) => setConfigPaths(e.target.value)}
                  className="input"
                />
              </FormField>
            </>
          )}

          {error && (
            <div className="text-sm" style={{ color: "#f87171" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary mt-2">
            {saving ? "Сохранение..." : isEdit ? "Сохранить изменения" : "Добавить сервер"}
          </button>
        </form>
      </div>
    </div>
  );
}

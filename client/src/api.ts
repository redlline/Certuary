import type {
  AppSettings,
  BulkDeployResult,
  BulkMatchResult,
  CertInfo,
  DockerCandidate,
  DockerContainerInfo,
  EventRow,
  LogEntry,
  ServerGroup,
  ServerInput,
  ServerRow,
  SiteRow,
} from "./types";

const API = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers:
      options?.body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message: unknown = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? body.message ?? message;
    } catch {}
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  authStatus: () => request<{ configured: boolean }>(`/auth/status`),
  authSetup: (password: string) =>
    request(`/auth/setup`, { method: "POST", body: JSON.stringify({ password }) }),
  login: (password: string) =>
    request(`/auth/login`, { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request(`/auth/logout`, { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request(`/auth/change-password`, {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  listServers: () => request<ServerRow[]>(`/servers`),
  getServer: (id: string) => request<ServerRow>(`/servers/${id}`),
  createServer: (input: ServerInput) =>
    request<{ id: string }>(`/servers`, { method: "POST", body: JSON.stringify(input) }),
  updateServer: (id: string, input: ServerInput) =>
    request<{ id: string }>(`/servers/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteServer: (id: string) => request(`/servers/${id}`, { method: "DELETE" }),
  testServer: (id: string) =>
    request<{ ok: boolean; message: string }>(`/servers/${id}/test`, { method: "POST" }),
  scanServer: (id: string) => request(`/servers/${id}/scan`, { method: "POST" }),
  reloadServer: (id: string) =>
    request<{ ok: boolean; output: string }>(`/servers/${id}/reload`, { method: "POST" }),
  detectDocker: (input: {
    host: string;
    port: number;
    sshUser: string;
    authType: string;
    secret: string;
    kind: string;
    sudoPassword?: string;
  }) =>
    request<{ candidates: DockerCandidate[]; allContainers: DockerContainerInfo[] }>(
      `/servers/detect-docker`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  renewNpmCert: (siteId: string) =>
    request<{ ok: boolean; message: string; site?: SiteRow }>(
      `/sites/${siteId}/npm-renew`,
      { method: "POST" },
    ),
  listSites: (serverId?: string) =>
    request<SiteRow[]>(`/sites${serverId ? `?serverId=${serverId}` : ""}`),
  checkLive: (siteId: string) =>
    request<SiteRow>(`/sites/${siteId}/check-live`, { method: "POST" }),

  expiringCertificates: (days = 14) =>
    request<SiteRow[]>(`/certificates/expiring?days=${days}`),
  previewCertUpload: (siteId: string, formData: FormData) =>
    request<{ info: CertInfo }>(`/certificates/sites/${siteId}/upload`, {
      method: "POST",
      body: formData,
    }),
  confirmCertUpload: (siteId: string, formData: FormData) =>
    request<{ ok: boolean; message: string }>(
      `/certificates/sites/${siteId}/upload?confirm=true`,
      { method: "POST", body: formData },
    ),
  batchReload: (serverIds: string[]) =>
    request<{ results: { serverId: string; ok: boolean; output: string }[] }>(
      `/certificates/batch-reload`,
      { method: "POST", body: JSON.stringify({ serverIds }) },
    ),
  bulkMatch: (formData: FormData) =>
    request<{ results: BulkMatchResult[] }>(`/certificates/bulk-match`, {
      method: "POST",
      body: formData,
    }),
  bulkDeploy: (formData: FormData) =>
    request<{ results: BulkDeployResult[] }>(`/certificates/bulk-deploy`, {
      method: "POST",
      body: formData,
    }),

  listEvents: (limit = 100) => request<EventRow[]>(`/events?limit=${limit}`),

  getSettings: () => request<AppSettings>(`/settings`),
  updateSettings: (settings: Partial<AppSettings>) =>
    request<AppSettings>(`/settings`, { method: "PUT", body: JSON.stringify(settings) }),
  testTelegram: () =>
    request<{ ok: boolean; error?: string }>(`/settings/telegram/test`, { method: "POST" }),

  exportBackupUrl: () => `${API}/backup/export`,
  importBackup: (formData: FormData) =>
    request<{ message: string }>(`/backup/import`, { method: "POST", body: formData }),

  listLogs: (limit = 300, level?: string) =>
    request<LogEntry[]>(`/logs?limit=${limit}${level ? `&level=${level}` : ""}`),

  listGroups: () => request<ServerGroup[]>(`/groups`),
  createGroup: (name: string) =>
    request<ServerGroup>(`/groups`, { method: "POST", body: JSON.stringify({ name }) }),
  renameGroup: (id: string, name: string) =>
    request(`/groups/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteGroup: (id: string) => request(`/groups/${id}`, { method: "DELETE" }),
};

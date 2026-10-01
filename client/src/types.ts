export type ServerKind = "nginx" | "apache" | "haproxy" | "npm";
export type AuthType = "key" | "password";
export type ServerStatus = "online" | "offline" | "error" | "unknown";
export type LiveStatus = "unknown" | "ok" | "mismatch" | "unreachable";

export interface ServerRow {
  id: string;
  name: string;
  kind: ServerKind;
  group_id: string | null;
  host: string;
  port: number;
  ssh_user: string;
  auth_type: AuthType;
  reload_command: string;
  test_command: string;
  config_paths: string;
  status: ServerStatus;
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
  siteCount: number;
  soonestExpiry: string | null;
}

export interface ServerGroup {
  id: string;
  name: string;
  created_at?: string;
}

export interface SiteRow {
  id: string;
  server_id: string;
  domain: string;
  config_file_path: string | null;
  cert_path: string | null;
  key_path: string | null;
  chain_path: string | null;
  trusted_cert_path: string | null;
  https_port: number;
  subject_cn: string | null;
  sans: string | null;
  issuer: string | null;
  not_before: string | null;
  not_after: string | null;
  fingerprint: string | null;
  last_synced_at: string | null;
  live_status: LiveStatus;
  live_checked_at: string | null;
  live_subject_cn: string | null;
  live_issuer: string | null;
  live_not_after: string | null;
  live_fingerprint: string | null;
  server_name?: string;
  server_host?: string;
  server_kind?: ServerKind;
}

export interface DockerCandidate {
  name: string;
  image: string;
  reloadCommand: string;
  testCommand: string;
  configPaths: string[];
  note?: string;
}

export interface DockerContainerInfo {
  name: string;
  image: string;
}

export interface EventRow {
  id: number;
  type: string;
  message: string;
  success: boolean;
  created_at: string;
}

export interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface AppSettings {
  telegramBotToken: string | null;
  telegramChatId: string | null;
  alertThresholds: number[];
}

export interface CertInfo {
  subjectCn?: string;
  sans?: string[];
  issuer?: string;
  notAfter?: string;
}

export interface BulkMatchResult {
  groupName: string;
  valid: boolean;
  reason?: string;
  info?: CertInfo;
  matches: { siteId: string; domain: string; serverName: string }[];
}

export interface BulkDeployResult {
  groupName: string;
  ok: boolean;
  message: string;
}

export interface ServerInput {
  name: string;
  kind: ServerKind;
  groupId?: string | null;
  host: string;
  port: number;
  sshUser: string;
  authType: AuthType;
  secret?: string;
  sudoPassword?: string;
  reloadCommand: string;
  testCommand: string;
  configPaths: string[];
}

export type ServerKind = "nginx" | "apache" | "haproxy" | "npm";
export type AuthType = "key" | "password";

export interface ServerRow {
  id: string;
  name: string;
  kind: ServerKind;
  group_id: string | null;
  host: string;
  port: number;
  ssh_user: string;
  auth_type: AuthType;
  secret_encrypted: string;
  sudo_password_encrypted: string | null;
  reload_command: string;
  test_command: string;
  config_paths: string;
  status: string;
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
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
  created_at: string;
}

export interface CertificateRow {
  id: string;
  site_id: string;
  subject_cn: string | null;
  sans: string | null;
  issuer: string | null;
  not_before: string | null;
  not_after: string | null;
  fingerprint: string | null;
  notified_thresholds: string;
  live_status: string;
  live_checked_at: string | null;
  last_synced_at: string;
  live_subject_cn?: string | null;
  live_issuer?: string | null;
  live_not_after?: string | null;
  live_fingerprint?: string | null;
}

export interface EventRow {
  id: string;
  server_id: string | null;
  site_id: string | null;
  type: string;
  message: string | null;
  success: number;
  created_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  created_at: string;
}

export interface SettingsRow {
  id: number;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  alert_thresholds: string;
  admin_password_hash: string | null;
  theme: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface CertBundle {
  certPem: string;
  keyPem: string;
  chainPem?: string;
}

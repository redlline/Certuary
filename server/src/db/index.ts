import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, "fleet.db");
export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'nginx' CHECK (kind IN ('nginx','apache','haproxy')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  ssh_user TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('key','password')),
  secret_encrypted TEXT NOT NULL,
  reload_command TEXT NOT NULL DEFAULT 'sudo systemctl reload nginx',
  test_command TEXT NOT NULL DEFAULT 'sudo nginx -t',
  config_paths TEXT NOT NULL DEFAULT '["/etc/nginx/sites-enabled/*","/etc/nginx/conf.d/*.conf"]',
  status TEXT NOT NULL DEFAULT 'unknown',
  last_error TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  config_file_path TEXT,
  cert_path TEXT,
  key_path TEXT,
  chain_path TEXT,
  trusted_cert_path TEXT,
  https_port INTEGER NOT NULL DEFAULT 443,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(server_id, domain, config_file_path)
);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  subject_cn TEXT,
  sans TEXT,
  issuer TEXT,
  not_before TEXT,
  not_after TEXT,
  fingerprint TEXT,
  notified_thresholds TEXT NOT NULL DEFAULT '[]',
  live_status TEXT NOT NULL DEFAULT 'unknown',
  live_checked_at TEXT,
  last_synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
  site_id TEXT REFERENCES sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  alert_thresholds TEXT NOT NULL DEFAULT '[30,14,7,1]',
  admin_password_hash TEXT,
  theme TEXT NOT NULL DEFAULT 'dark'
);

INSERT OR IGNORE INTO settings (id) VALUES (1);
`);

// lightweight migrations for columns added after initial release
function addColumnIfMissing(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing("certificates", "live_subject_cn", "TEXT");
addColumnIfMissing("certificates", "live_issuer", "TEXT");
addColumnIfMissing("certificates", "live_not_after", "TEXT");
addColumnIfMissing("certificates", "live_fingerprint", "TEXT");

db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
addColumnIfMissing("servers", "group_id", "TEXT");

// widen the `kind` CHECK constraint to allow 'npm' (Nginx Proxy Manager); SQLite can't ALTER a CHECK
// constraint in place, so rebuild the table when the old constraint is detected.
{
  const tableSql = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='servers'`)
    .get() as { sql: string } | undefined;
  if (tableSql && !tableSql.sql.includes("'npm'")) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE servers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'nginx' CHECK (kind IN ('nginx','apache','haproxy','npm')),
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 22,
        ssh_user TEXT NOT NULL,
        auth_type TEXT NOT NULL CHECK (auth_type IN ('key','password')),
        secret_encrypted TEXT NOT NULL,
        reload_command TEXT NOT NULL DEFAULT 'sudo systemctl reload nginx',
        test_command TEXT NOT NULL DEFAULT 'sudo nginx -t',
        config_paths TEXT NOT NULL DEFAULT '["/etc/nginx/sites-enabled/*","/etc/nginx/conf.d/*.conf"]',
        status TEXT NOT NULL DEFAULT 'unknown',
        last_error TEXT,
        last_checked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        group_id TEXT
      );
      INSERT INTO servers_new SELECT id,name,kind,host,port,ssh_user,auth_type,secret_encrypted,reload_command,test_command,config_paths,status,last_error,last_checked_at,created_at,group_id FROM servers;
      DROP TABLE servers;
      ALTER TABLE servers_new RENAME TO servers;
    `);
    db.pragma("foreign_keys = ON");
  }
}
// optional sudo password for non-root SSH users (escalation via sudo -S)
addColumnIfMissing("servers", "sudo_password_encrypted", "TEXT");

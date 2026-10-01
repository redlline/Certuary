import forge from "node-forge";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { execCommand, execPrivileged } from "../ssh/client.js";
import { logEvent } from "./eventService.js";
import { scanNpmServer } from "./npmIntegration.js";
import type { ExecResult, ServerKind, ServerRow } from "../types.js";

interface DiscoveredSite {
  configFilePath: string | null;
  serverName: string | null;
  certPath: string;
  keyPath: string | null;
  trustedCertPath: string | null;
}

// Strips # comments (nginx/HAProxy style) and /* */ comments (Apache style)
function stripComments(text: string): string {
  // Remove /* ... */ block comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove # line comments (preserve newline so line numbers stay roughly intact)
  text = text.replace(/#[^\n]*/g, "");
  return text;
}

// nginx: server { server_name ...; ssl_certificate ...; ssl_certificate_key ...; ssl_trusted_certificate ...; }
function parseNginxConfig(text: string, filePath: string): DiscoveredSite[] {
  text = stripComments(text);
  const sites: DiscoveredSite[] = [];
  const blockRegex = /server\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    const block = match[1];
    const serverNameMatch = /server_name\s+([^;]+);/.exec(block);
    const certMatch = /ssl_certificate\s+([^;]+);/.exec(block);
    const keyMatch = /ssl_certificate_key\s+([^;]+);/.exec(block);
    const trustedMatch = /ssl_trusted_certificate\s+([^;]+);/.exec(block);
    if (!certMatch) continue;
    const serverName = serverNameMatch ? serverNameMatch[1].trim().split(/\s+/)[0] : null;
    sites.push({
      configFilePath: filePath,
      serverName,
      certPath: certMatch[1].trim(),
      keyPath: keyMatch ? keyMatch[1].trim() : null,
      trustedCertPath: trustedMatch ? trustedMatch[1].trim() : null,
    });
  }
  return sites;
}

// Apache: <VirtualHost ...> ServerName ...; SSLCertificateFile ...; SSLCertificateKeyFile ...; SSLCertificateChainFile ...; </VirtualHost>
function parseApacheConfig(text: string, filePath: string): DiscoveredSite[] {
  text = stripComments(text);
  const sites: DiscoveredSite[] = [];
  const blockRegex = /<VirtualHost[^>]*>([\s\S]*?)<\/VirtualHost>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    const block = match[1];
    const serverNameMatch = /ServerName\s+([^\s]+)/i.exec(block);
    const certMatch = /SSLCertificateFile\s+([^\s]+)/i.exec(block);
    const keyMatch = /SSLCertificateKeyFile\s+([^\s]+)/i.exec(block);
    const chainMatch = /SSLCertificateChainFile\s+([^\s]+)/i.exec(block);
    if (!certMatch) continue;
    sites.push({
      configFilePath: filePath,
      serverName: serverNameMatch ? serverNameMatch[1].trim() : null,
      certPath: certMatch[1].trim(),
      keyPath: keyMatch ? keyMatch[1].trim() : null,
      trustedCertPath: chainMatch ? chainMatch[1].trim() : null,
    });
  }
  return sites;
}

// HAProxy: bind ... ssl crt /path/to/combined.pem (cert+key in one file, no separate key path)
function parseHaproxyConfig(text: string): DiscoveredSite[] {
  text = stripComments(text);
  const sites: DiscoveredSite[] = [];
  const bindRegex = /bind\s+\S+\s+ssl\s+(?:[^\n]*?\s)?crt\s+(\S+)/gi;
  let match: RegExpExecArray | null;
  while ((match = bindRegex.exec(text)) !== null) {
    const certPath = match[1].trim();
    const name = certPath.split("/").pop()?.replace(/\.pem$/, "") ?? certPath;
    sites.push({
      configFilePath: certPath,
      serverName: name,
      certPath,
      keyPath: certPath,
      trustedCertPath: null,
    });
  }
  return sites;
}

function parseConfig(kind: ServerKind, text: string, filePath: string): DiscoveredSite[] {
  if (kind === "apache") return parseApacheConfig(text, filePath);
  if (kind === "haproxy") return parseHaproxyConfig(text);
  return parseNginxConfig(text, filePath);
}

// Reads a remote file; falls back to sudo when the SSH user can't read it directly.
async function catRemote(server: ServerRow, filePath: string): Promise<ExecResult> {
  const res = await execCommand(server, `cat "${filePath}"`);
  if (res.code === 0) return res;
  try {
    return await execPrivileged(server, `cat "${filePath}"`);
  } catch {
    return res;
  }
}

async function listConfigFiles(server: ServerRow): Promise<string[]> {
  const globs = JSON.parse(server.config_paths) as string[];
  const command = globs.map((g) => `for f in ${g}; do [ -f "$f" ] && echo "$f"; done`).join("; ");
  let { stdout } = await execCommand(server, command);
  // config dirs may be unreadable for non-root users — retry via sudo
  if (!stdout.trim() && server.ssh_user !== "root") {
    try {
      stdout = (await execPrivileged(server, command)).stdout;
    } catch {
      // keep whatever the unprivileged listing returned
    }
  }
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function parsePemDates(pem: string) {
  const cert = forge.pki.certificateFromPem(pem);
  const subjectCn = cert.subject.getField("CN")?.value ?? null;
  const sanExt = cert.getExtension("subjectAltName");
  const sans = (sanExt as { altNames?: { value: string }[] } | undefined)?.altNames?.map((a) => a.value) ?? [];
  const issuer = cert.issuer.getField("CN")?.value ?? null;
  const fingerprint = forge.md.sha256
    .create()
    .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
    .digest()
    .toHex();
  return {
    subjectCn,
    sans,
    issuer,
    notBefore: cert.validity.notBefore.toISOString(),
    notAfter: cert.validity.notAfter.toISOString(),
    fingerprint,
  };
}

export async function scanServer(server: ServerRow) {
  if (server.kind === "npm") return scanNpmServer(server);
  try {
    const configFiles = await listConfigFiles(server);
    const discovered: DiscoveredSite[] = [];
    for (const file of configFiles) {
      const { stdout } = await catRemote(server, file);
      discovered.push(...parseConfig(server.kind, stdout, file));
    }
    for (const site of discovered) {
      if (!site.certPath) continue;
      const domain = site.serverName ?? site.certPath;
      let row = db
        .prepare(`SELECT * FROM sites WHERE server_id = ? AND domain = ? AND config_file_path = ?`)
        .get(server.id, domain, site.configFilePath) as { id: string } | undefined;
      if (!row) {
        const id = uuid();
        db.prepare(
          `INSERT INTO sites (id, server_id, domain, config_file_path, cert_path, key_path, trusted_cert_path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, server.id, domain, site.configFilePath, site.certPath, site.keyPath, site.trustedCertPath);
        row = { id };
      } else {
        db.prepare(`UPDATE sites SET cert_path = ?, key_path = ?, trusted_cert_path = ? WHERE id = ?`).run(
          site.certPath,
          site.keyPath,
          site.trustedCertPath,
          row.id,
        );
      }
      try {
        const { stdout: pem, code } = await catRemote(server, site.certPath);
        if (code !== 0 || !pem.includes("BEGIN CERTIFICATE")) continue;
        const parsed = parsePemDates(pem);
        const existing = db
          .prepare(`SELECT id, fingerprint FROM certificates WHERE site_id = ?`)
          .get(row.id) as { id: string; fingerprint: string | null } | undefined;
        if (existing) {
          const fingerprintChanged = existing.fingerprint !== parsed.fingerprint;
          db.prepare(
            `UPDATE certificates SET subject_cn=?, sans=?, issuer=?, not_before=?, not_after=?, fingerprint=?, last_synced_at=datetime('now')${
              fingerprintChanged ? ", notified_thresholds='[]'" : ""
            } WHERE id=?`,
          ).run(
            parsed.subjectCn,
            JSON.stringify(parsed.sans),
            parsed.issuer,
            parsed.notBefore,
            parsed.notAfter,
            parsed.fingerprint,
            existing.id,
          );
        } else {
          db.prepare(
            `INSERT INTO certificates (id, site_id, subject_cn, sans, issuer, not_before, not_after, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            uuid(),
            row.id,
            parsed.subjectCn,
            JSON.stringify(parsed.sans),
            parsed.issuer,
            parsed.notBefore,
            parsed.notAfter,
            parsed.fingerprint,
          );
        }
      } catch {
        // unreadable cert file, skip - keep previous data
      }
    }
    db.prepare(`UPDATE servers SET status='online', last_error=NULL, last_checked_at=datetime('now') WHERE id=?`).run(
      server.id,
    );
    logEvent(server.id, null, "scan", "Scan completed successfully", true);
  } catch (err) {
    db.prepare(`UPDATE servers SET status='offline', last_error=?, last_checked_at=datetime('now') WHERE id=?`).run(
      (err as Error)?.message ?? String(err),
      server.id,
    );
    logEvent(server.id, null, "scan", `Scan failed: ${(err as Error)?.message ?? err}`, false);
  }
}

export async function scanAllServers() {
  const servers = db.prepare(`SELECT * FROM servers`).all() as ServerRow[];
  for (const server of servers) {
    await scanServer(server);
  }
}

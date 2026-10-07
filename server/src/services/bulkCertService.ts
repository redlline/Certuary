import { db } from "../db/index.js";
import { validateBundle, deployBundle, sanitizePem } from "./certUploadService.js";
import { uploadNpmCustomCertificate } from "./npmIntegration.js";
import { getServer } from "./serverService.js";
import type { CertBundle, SiteRow } from "../types.js";

export interface BulkGroup extends CertBundle {
  groupName: string;
}

function domainMatchesName(domain: string, name: string): boolean {
  domain = domain.toLowerCase().trim();
  name = name.toLowerCase().trim();
  if (!domain || !name) return false;
  if (domain === name) return true;
  // cert wildcard "*.example.com" covers one level: "sub.example.com"
  if (name.startsWith("*.")) {
    const suffix = name.slice(2);
    return (
      domain.endsWith(`.${suffix}`) &&
      domain.split(".").length === suffix.split(".").length + 1
    );
  }
  // site listed as wildcard "*.example.com" matches any cert name under it
  if (domain.startsWith("*.")) {
    const suffix = domain.slice(2);
    return name.endsWith(`.${suffix}`);
  }
  return false;
}

function findMatchingSites(subjectCn: string | null, sans: string[], groupName: string) {
  const candidates = new Set<string>();
  if (subjectCn) candidates.add(subjectCn.toLowerCase());
  for (const san of sans) candidates.add(san.toLowerCase());
  // filename is a weak hint, useful when cert CN/SAN uses a different spelling
  // (e.g. wildcard file named "example.com" or IDN/punycode mismatches)
  if (groupName.includes(".")) candidates.add(groupName.toLowerCase());
  const allSites = db
    .prepare(
      `SELECT s.id as site_id, s.domain, sv.id as server_id, sv.name as server_name FROM sites s JOIN servers sv ON sv.id = s.server_id`,
    )
    .all() as { site_id: string; domain: string; server_id: string; server_name: string }[];
  return allSites.filter((s) =>
    [...candidates].some((c) => domainMatchesName(String(s.domain), c)),
  );
}

export function matchBulkGroups(groups: BulkGroup[]) {
  return groups.map((group) => {
    const bundle = { certPem: group.certPem, keyPem: group.keyPem, chainPem: group.chainPem };
    const validation = validateBundle(bundle);
    if (!validation.valid) {
      return { groupName: group.groupName, valid: false, reason: validation.reason, matches: [] };
    }
    const sites = findMatchingSites(
      validation.info.subjectCn,
      validation.info.sans ?? [],
      group.groupName,
    );
    return {
      groupName: group.groupName,
      valid: true,
      info: validation.info,
      matches: sites.map((s) => ({
        siteId: s.site_id,
        domain: s.domain,
        serverId: s.server_id,
        serverName: s.server_name,
      })),
    };
  });
}

export async function deployBulkGroups(groups: BulkGroup[], selections: Record<string, string>) {
  const results: { groupName: string; siteId: string; ok: boolean; message: string }[] = [];
  for (const group of groups) {
    const siteId = selections[group.groupName];
    if (!siteId) continue;
    const site = db.prepare(`SELECT * FROM sites WHERE id=?`).get(siteId) as SiteRow | undefined;
    if (!site) {
      results.push({ groupName: group.groupName, siteId, ok: false, message: "Сайт не найден" });
      continue;
    }
    const server = getServer(site.server_id);
    if (!server) {
      results.push({ groupName: group.groupName, siteId, ok: false, message: "Сервер не найден" });
      continue;
    }
    let result: { ok: boolean; message: string };
    if (server.kind === "npm") {
      const match = /^npm:proxy-host:(\d+)$/.exec(site.config_file_path ?? "");
      if (!match) {
        result = { ok: false, message: "Не найден ID хоста NPM для этого сайта" };
      } else {
        const certPem = sanitizePem(group.certPem);
        const fullChainPem = group.chainPem
          ? `${certPem.trim()}\n${sanitizePem(group.chainPem).trim()}\n`
          : certPem;
        result = await uploadNpmCustomCertificate(
          server,
          Number(match[1]),
          site.domain,
          fullChainPem,
          sanitizePem(group.keyPem),
        );
      }
    } else {
      result = await deployBundle(server, site, {
        certPem: group.certPem,
        keyPem: group.keyPem,
        chainPem: group.chainPem,
      });
    }
    results.push({ groupName: group.groupName, siteId, ok: result.ok, message: result.message });
  }
  return results;
}

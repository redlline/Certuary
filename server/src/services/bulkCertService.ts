import { db } from "../db/index.js";
import { validateBundle, deployBundle } from "./certUploadService.js";
import { getServer } from "./serverService.js";
import type { CertBundle, SiteRow } from "../types.js";

export interface BulkGroup extends CertBundle {
  groupName: string;
}

function findMatchingSites(subjectCn: string | null, sans: string[]) {
  const candidates = new Set<string>();
  if (subjectCn) candidates.add(subjectCn.toLowerCase());
  for (const san of sans) candidates.add(san.toLowerCase());
  const allSites = db
    .prepare(
      `SELECT s.id as site_id, s.domain, sv.id as server_id, sv.name as server_name FROM sites s JOIN servers sv ON sv.id = s.server_id`,
    )
    .all() as { site_id: string; domain: string; server_id: string; server_name: string }[];
  return allSites.filter((s) => candidates.has(String(s.domain).toLowerCase()));
}

export function matchBulkGroups(groups: BulkGroup[]) {
  return groups.map((group) => {
    const bundle = { certPem: group.certPem, keyPem: group.keyPem, chainPem: group.chainPem };
    const validation = validateBundle(bundle);
    if (!validation.valid) {
      return { groupName: group.groupName, valid: false, reason: validation.reason, matches: [] };
    }
    const sites = findMatchingSites(validation.info.subjectCn, validation.info.sans ?? []);
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
    const result = await deployBundle(server, site, {
      certPem: group.certPem,
      keyPem: group.keyPem,
      chainPem: group.chainPem,
    });
    results.push({ groupName: group.groupName, siteId, ok: result.ok, message: result.message });
  }
  return results;
}

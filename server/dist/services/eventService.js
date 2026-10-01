import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
export function logEvent(serverId, siteId, type, message, success) {
    db.prepare(`INSERT INTO events (id, server_id, site_id, type, message, success) VALUES (?, ?, ?, ?, ?, ?)`).run(uuid(), serverId, siteId, type, message, success ? 1 : 0);
    const serverName = serverId
        ? db.prepare(`SELECT name FROM servers WHERE id=?`).get(serverId)?.name
        : null;
    const siteDomain = siteId
        ? db.prepare(`SELECT domain FROM sites WHERE id=?`).get(siteId)?.domain
        : null;
    const target = [serverName, siteDomain].filter(Boolean).join(" / ");
    const line = `[${type}]${target ? ` ${target}:` : ""} ${message}`;
    if (success)
        console.log(line);
    else
        console.error(line);
}
//# sourceMappingURL=eventService.js.map
import tls from "node:tls";
import { db } from "../db/index.js";
import { logEvent } from "./eventService.js";
function fetchPeerCertificate(host, port, servername) {
    return new Promise((resolve) => {
        const socket = tls.connect({ host, port, servername, rejectUnauthorized: false, timeout: 8000 }, () => {
            const cert = socket.getPeerCertificate(false);
            socket.end();
            if (!cert || !cert.fingerprint256) {
                resolve(null);
                return;
            }
            const subjectCn = cert.subject?.CN;
            const issuerCn = cert.issuer?.CN;
            resolve({
                fingerprint: cert.fingerprint256.replace(/:/g, "").toLowerCase(),
                subjectCn: Array.isArray(subjectCn) ? (subjectCn[0] ?? null) : (subjectCn ?? null),
                issuer: Array.isArray(issuerCn) ? (issuerCn[0] ?? null) : (issuerCn ?? null),
                notAfter: cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
            });
        });
        socket.on("error", () => resolve(null));
        socket.on("timeout", () => {
            socket.destroy();
            resolve(null);
        });
    });
}
export async function checkLiveCertificate(siteId) {
    const row = db
        .prepare(`SELECT s.id as site_id, sv.id as server_id, s.domain, sv.host, s.https_port, c.fingerprint
       FROM sites s JOIN servers sv ON sv.id = s.server_id LEFT JOIN certificates c ON c.site_id = s.id
       WHERE s.id = ?`)
        .get(siteId);
    if (!row)
        return;
    const live = await fetchPeerCertificate(row.host, row.https_port, row.domain);
    const certRow = db.prepare(`SELECT id, live_status FROM certificates WHERE site_id = ?`).get(siteId);
    if (!certRow)
        return;
    let status;
    if (live === null) {
        status = "unreachable";
    }
    else if (row.fingerprint && live.fingerprint === row.fingerprint.toLowerCase()) {
        status = "ok";
    }
    else {
        status = "mismatch";
    }
    db.prepare(`UPDATE certificates SET live_status=?, live_checked_at=datetime('now'), live_subject_cn=?, live_issuer=?, live_not_after=?, live_fingerprint=? WHERE id=?`).run(status, live?.subjectCn ?? null, live?.issuer ?? null, live?.notAfter ?? null, live?.fingerprint ?? null, certRow.id);
    if (status !== certRow.live_status) {
        if (status === "mismatch") {
            logEvent(row.server_id, row.site_id, "live-check", `Реальный сертификат на ${row.host}:${row.https_port} НЕ совпадает с тем, что в файле (CN получен: ${live?.subjectCn ?? "—"})`, false);
        }
        else if (status === "unreachable") {
            logEvent(row.server_id, row.site_id, "live-check", `Не удалось подключиться к ${row.host}:${row.https_port} по TLS`, false);
        }
        else {
            logEvent(row.server_id, row.site_id, "live-check", `Реальный сертификат на ${row.host}:${row.https_port} теперь совпадает с файлом`, true);
        }
    }
}
export async function checkAllLiveCertificates() {
    const sites = db.prepare(`SELECT id FROM sites`).all();
    for (const site of sites) {
        await checkLiveCertificate(site.id);
    }
}
//# sourceMappingURL=tlsCheck.js.map
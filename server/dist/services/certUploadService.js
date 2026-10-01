import forge from "node-forge";
import { execCommand, execPrivileged, withSftp } from "../ssh/client.js";
import { testConfig, reload } from "./nginxControl.js";
import { logEvent } from "./eventService.js";
export function validateBundle(bundle) {
    let cert;
    try {
        cert = forge.pki.certificateFromPem(bundle.certPem);
    }
    catch {
        return { valid: false, reason: "Не удалось прочитать сертификат (.crt/.pem)" };
    }
    let privateKey;
    try {
        privateKey = forge.pki.privateKeyFromPem(bundle.keyPem);
    }
    catch {
        return { valid: false, reason: "Не удалось прочитать приватный ключ (.key)" };
    }
    try {
        const pub = cert.publicKey;
        const priv = privateKey;
        if (pub.n.toString() !== priv.n.toString() || pub.e.toString() !== priv.e.toString()) {
            return { valid: false, reason: "Приватный ключ не соответствует сертификату" };
        }
    }
    catch {
        return { valid: false, reason: "Не удалось сверить ключ и сертификат (неподдерживаемый тип ключа)" };
    }
    const now = new Date();
    if (cert.validity.notAfter < now) {
        return { valid: false, reason: "Сертификат уже просрочен" };
    }
    const subjectCn = cert.subject.getField("CN")?.value ?? null;
    const sanExt = cert.getExtension("subjectAltName");
    const sans = sanExt?.altNames?.map((a) => a.value) ?? [];
    return {
        valid: true,
        info: {
            subjectCn,
            sans,
            notBefore: cert.validity.notBefore.toISOString(),
            notAfter: cert.validity.notAfter.toISOString(),
            issuer: cert.issuer.getField("CN")?.value ?? null,
        },
    };
}
export async function deployBundle(server, site, bundle) {
    if (!site.cert_path || !site.key_path) {
        return { ok: false, message: "Для этого сайта не определены пути сертификата/ключа на сервере" };
    }
    const ts = Date.now();
    const certBackup = `${site.cert_path}.bak-${ts}`;
    const keyBackup = `${site.key_path}.bak-${ts}`;
    // Non-root users can't write to system cert paths directly, so files go to
    // /tmp via SFTP first and are then moved into place under sudo.
    const isRoot = server.ssh_user === "root";
    const certTmp = `/tmp/certuary-cert-${ts}.pem`;
    const keyTmp = `/tmp/certuary-key-${ts}.pem`;
    const backupCmd = `cp "${site.cert_path}" "${certBackup}" 2>/dev/null; cp "${site.key_path}" "${keyBackup}" 2>/dev/null; true`;
    try {
        await (isRoot ? execCommand(server, backupCmd) : execPrivileged(server, backupCmd));
        const fullChainPem = bundle.chainPem
            ? `${bundle.certPem.trim()}\n${bundle.chainPem.trim()}\n`
            : bundle.certPem;
        await withSftp(server, async (sftp) => {
            await sftp.put(Buffer.from(fullChainPem, "utf8"), isRoot ? site.cert_path : certTmp);
            await sftp.put(Buffer.from(bundle.keyPem, "utf8"), isRoot ? site.key_path : keyTmp);
        });
        if (isRoot) {
            await execCommand(server, `chmod 644 "${site.cert_path}"; chmod 600 "${site.key_path}"`);
        }
        else {
            await execPrivileged(server, `cp "${certTmp}" "${site.cert_path}" && cp "${keyTmp}" "${site.key_path}" && ` +
                `chmod 644 "${site.cert_path}" && chmod 600 "${site.key_path}" && ` +
                `rm -f "${certTmp}" "${keyTmp}"`);
        }
        const testResult = await testConfig(server);
        if (!testResult.ok) {
            // rollback
            const rollbackCmd = `cp "${certBackup}" "${site.cert_path}" 2>/dev/null; cp "${keyBackup}" "${site.key_path}" 2>/dev/null; true`;
            await (isRoot ? execCommand(server, rollbackCmd) : execPrivileged(server, rollbackCmd));
            logEvent(server.id, site.id, "upload", `nginx -t failed, rolled back: ${testResult.output}`, false);
            return {
                ok: false,
                message: `Проверка конфигурации nginx не пройдена, изменения откатены:\n${testResult.output}`,
            };
        }
        const reloadResult = await reload(server);
        if (!reloadResult.ok) {
            logEvent(server.id, site.id, "upload", `Cert deployed but reload failed: ${reloadResult.output}`, false);
            return {
                ok: false,
                message: `Сертификат загружен, но reload завершился с ошибкой:\n${reloadResult.output}`,
            };
        }
        logEvent(server.id, site.id, "upload", "Certificate deployed and nginx reloaded", true);
        return { ok: true, message: "Сертификат успешно установлен, nginx перезагружен" };
    }
    catch (err) {
        logEvent(server.id, site.id, "upload", `Upload failed: ${err?.message ?? err}`, false);
        return { ok: false, message: `Ошибка загрузки: ${err?.message ?? err}` };
    }
}
//# sourceMappingURL=certUploadService.js.map
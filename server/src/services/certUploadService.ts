import forge from "node-forge";
import { execCommand, execPrivileged, withSftp } from "../ssh/client.js";
import { testConfig, reload } from "./nginxControl.js";
import { logEvent } from "./eventService.js";
import type { CertBundle, ServerRow, SiteRow } from "../types.js";

// Files exported from Windows tools often carry a UTF-8 BOM or leading text
// before the PEM block. forge tolerates it but nginx doesn't
// (PEM_read_bio_X509_AUX: "no start line"). Keep only real PEM blocks.
export function sanitizePem(pem: string): string {
  const blocks =
    pem
      .replace(/^﻿/, "")
      .match(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g) ?? [];
  return blocks.map((b) => `${b.trim()}\n`).join("");
}

export function validateBundle(bundle: CertBundle):
  | { valid: false; reason: string }
  | {
      valid: true;
      info: {
        subjectCn: string | null;
        sans: string[];
        notBefore: string;
        notAfter: string;
        issuer: string | null;
      };
    } {
  bundle = {
    certPem: sanitizePem(bundle.certPem),
    keyPem: sanitizePem(bundle.keyPem),
    chainPem: bundle.chainPem ? sanitizePem(bundle.chainPem) : undefined,
  };
  if (!bundle.certPem) {
    return { valid: false, reason: "Не удалось прочитать сертификат (.crt/.pem)" };
  }
  if (!bundle.keyPem) {
    return { valid: false, reason: "Не удалось прочитать приватный ключ (.key)" };
  }
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(bundle.certPem);
  } catch {
    return { valid: false, reason: "Не удалось прочитать сертификат (.crt/.pem)" };
  }
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    privateKey = forge.pki.privateKeyFromPem(bundle.keyPem) as forge.pki.rsa.PrivateKey;
  } catch {
    return { valid: false, reason: "Не удалось прочитать приватный ключ (.key)" };
  }
  try {
    const pub = cert.publicKey as forge.pki.rsa.PublicKey;
    const priv = privateKey;
    if (pub.n.toString() !== priv.n.toString() || pub.e.toString() !== priv.e.toString()) {
      return { valid: false, reason: "Приватный ключ не соответствует сертификату" };
    }
  } catch {
    return { valid: false, reason: "Не удалось сверить ключ и сертификат (неподдерживаемый тип ключа)" };
  }
  const now = new Date();
  if (cert.validity.notAfter < now) {
    return { valid: false, reason: "Сертификат уже просрочен" };
  }
  const subjectCn = cert.subject.getField("CN")?.value ?? null;
  const sanExt = cert.getExtension("subjectAltName");
  const sans = (sanExt as { altNames?: { value: string }[] } | undefined)?.altNames?.map((a) => a.value) ?? [];
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

export async function deployBundle(
  server: ServerRow,
  site: SiteRow,
  bundle: CertBundle,
): Promise<{ ok: boolean; message: string }> {
  if (!site.cert_path || !site.key_path) {
    return { ok: false, message: "Для этого сайта не определены пути сертификата/ключа на сервере" };
  }
  bundle = {
    certPem: sanitizePem(bundle.certPem),
    keyPem: sanitizePem(bundle.keyPem),
    chainPem: bundle.chainPem ? sanitizePem(bundle.chainPem) : undefined,
  };
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
    const certBuf = Buffer.from(fullChainPem, "utf8");
    const keyBuf = Buffer.from(bundle.keyPem, "utf8");
    await withSftp(server, async (sftp) => {
      // put() truncates the destination before writing; when the remote FS is
      // full the write silently produces a 0-byte file — always verify size.
      await sftp.put(certBuf, isRoot ? site.cert_path! : certTmp);
      const certStat = await sftp.stat(isRoot ? site.cert_path! : certTmp);
      if (certStat.size !== certBuf.length) {
        throw new Error(
          `SFTP-запись неполная: записано ${certStat.size} из ${certBuf.length} байт. Проверьте свободное место на сервере.`,
        );
      }
      await sftp.put(keyBuf, isRoot ? site.key_path! : keyTmp);
      const keyStat = await sftp.stat(isRoot ? site.key_path! : keyTmp);
      if (keyStat.size !== keyBuf.length) {
        throw new Error(
          `SFTP-запись неполная: записано ${keyStat.size} из ${keyBuf.length} байт. Проверьте свободное место на сервере.`,
        );
      }
    });
    if (isRoot) {
      await execCommand(server, `chmod 644 "${site.cert_path}"; chmod 600 "${site.key_path}"`);
    } else {
      const res = await execPrivileged(
        server,
        `cp "${certTmp}" "${site.cert_path}" && cp "${keyTmp}" "${site.key_path}" && ` +
          `chmod 644 "${site.cert_path}" && chmod 600 "${site.key_path}" && ` +
          `test $(stat -c%s "${site.cert_path}") -eq ${certBuf.length} && ` +
          `rm -f "${certTmp}" "${keyTmp}"`,
      );
      if (res.code !== 0) {
        throw new Error(
          `Не удалось установить файлы на место (код ${res.code}): ${res.stderr || res.stdout}`,
        );
      }
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
  } catch (err) {
    logEvent(server.id, site.id, "upload", `Upload failed: ${(err as Error)?.message ?? err}`, false);
    return { ok: false, message: `Ошибка загрузки: ${(err as Error)?.message ?? err}` };
  }
}

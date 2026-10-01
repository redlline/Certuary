import { Client } from "ssh2";
import SftpClient from "ssh2-sftp-client";
import { decrypt } from "../crypto.js";
export function buildConnectConfig(server) {
    const secret = decrypt(server.secret_encrypted);
    const base = {
        host: server.host,
        port: server.port,
        username: server.ssh_user,
        readyTimeout: 10000,
    };
    if (server.auth_type === "key") {
        return { ...base, privateKey: secret };
    }
    return { ...base, password: secret };
}
export function execRaw(cfg, command, opts = {}) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let stdout = "";
        let stderr = "";
        conn
            .on("ready", () => {
            conn.exec(command, { pty: opts.pty ?? false }, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                stream
                    .on("close", (code) => {
                    conn.end();
                    resolve({ stdout, stderr, code: code ?? 0 });
                })
                    .on("data", (data) => {
                    stdout += data.toString();
                })
                    .stderr.on("data", (data) => {
                    stderr += data.toString();
                });
                if (opts.stdin !== undefined)
                    stream.end(opts.stdin);
            });
        })
            .on("error", (err) => reject(err))
            .connect(cfg);
    });
}
export function execCommand(server, command) {
    return execRaw(buildConnectConfig(server), command);
}
export async function withSftp(server, fn) {
    const sftp = new SftpClient();
    const cfg = buildConnectConfig(server);
    await sftp.connect(cfg);
    try {
        return await fn(sftp);
    }
    finally {
        await sftp.end();
    }
}
const sudoModeCache = new Map();
export function invalidateSudoCache(serverId) {
    sudoModeCache.delete(serverId);
}
function shellQuote(cmd) {
    return `'${cmd.replace(/'/g, `'\\''`)}'`;
}
// The password sudo asks for. An explicit per-server sudo password wins; for
// password-based SSH auth the SSH password doubles as the sudo password
// (sudo prompts for the calling user's password by default).
export function sudoPasswordFor(server) {
    if (server.sudo_password_encrypted)
        return decrypt(server.sudo_password_encrypted);
    if (server.auth_type === "password")
        return decrypt(server.secret_encrypted);
    return null;
}
export async function resolveSudoMode(server) {
    if (server.ssh_user === "root")
        return "root";
    const cached = sudoModeCache.get(server.id);
    if (cached)
        return cached;
    const probe = await execCommand(server, "sudo -n true");
    let mode;
    if (probe.code === 0)
        mode = "nopass";
    else if (sudoPasswordFor(server))
        mode = "password";
    else
        mode = "unavailable";
    sudoModeCache.set(server.id, mode);
    return mode;
}
export class SudoUnavailableError extends Error {
    constructor() {
        super("Команда требует прав root: у пользователя нет sudo без пароля (NOPASSWD) " +
            "и пароль sudo не задан. Укажите пароль sudo в настройках сервера или добавьте " +
            "пользователя в sudoers.");
    }
}
// Runs a command with root privileges on the remote host:
//   - root user            -> executes as-is
//   - non-root + NOPASSWD  -> sudo -n sh -c '...'
//   - non-root + password  -> sudo -S -p '' sh -c '...' (password via stdin)
// Throws SudoUnavailableError when escalation isn't possible.
export async function execPrivileged(server, command) {
    const mode = await resolveSudoMode(server);
    if (mode === "root")
        return execCommand(server, command);
    if (mode === "unavailable")
        throw new SudoUnavailableError();
    const quoted = shellQuote(command);
    if (mode === "nopass")
        return execCommand(server, `sudo -n sh -c ${quoted}`);
    const pw = sudoPasswordFor(server);
    let res = await execRaw(buildConnectConfig(server), `sudo -S -p '' sh -c ${quoted}`, {
        stdin: pw + "\n",
    });
    // some sudoers configs require a tty ("sorry, you must have a tty to run sudo")
    if (res.code !== 0 && /tty|terminal/i.test(res.stderr)) {
        res = await execRaw(buildConnectConfig(server), `sudo -S -p '' sh -c ${quoted}`, {
            stdin: pw + "\n",
            pty: true,
        });
    }
    if (res.code !== 0 && /incorrect password|authentication failure|Sorry, try again/i.test(res.stderr)) {
        sudoModeCache.delete(server.id);
        throw new Error("sudo отклонил пароль — проверьте пароль sudo у сервера");
    }
    return res;
}
//# sourceMappingURL=client.js.map
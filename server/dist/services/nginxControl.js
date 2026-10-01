import { execPrivileged } from "../ssh/client.js";
export async function testConfig(server) {
    try {
        const { stdout, stderr, code } = await execPrivileged(server, server.test_command);
        return { ok: code === 0, output: (stdout + stderr).trim() };
    }
    catch (err) {
        return { ok: false, output: err?.message ?? String(err) };
    }
}
export async function reload(server) {
    try {
        const { stdout, stderr, code } = await execPrivileged(server, server.reload_command);
        return { ok: code === 0, output: (stdout + stderr).trim() };
    }
    catch (err) {
        return { ok: false, output: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=nginxControl.js.map
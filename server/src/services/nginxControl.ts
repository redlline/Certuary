import { execPrivileged } from "../ssh/client.js";
import type { ServerRow } from "../types.js";

export async function testConfig(server: ServerRow): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr, code } = await execPrivileged(server, server.test_command);
    return { ok: code === 0, output: (stdout + stderr).trim() };
  } catch (err) {
    return { ok: false, output: (err as Error)?.message ?? String(err) };
  }
}

export async function reload(server: ServerRow): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr, code } = await execPrivileged(server, server.reload_command);
    return { ok: code === 0, output: (stdout + stderr).trim() };
  } catch (err) {
    return { ok: false, output: (err as Error)?.message ?? String(err) };
  }
}

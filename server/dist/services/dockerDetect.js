import { execRaw } from "../ssh/client.js";
// docker commands need access to the docker socket; when the SSH user isn't
// root and isn't in the docker group, retry through sudo (NOPASSWD first,
// then password via stdin).
async function execDocker(cfg, command, sudoPassword) {
    const plain = await execRaw(cfg, command);
    if (plain.code === 0 || cfg.username === "root")
        return plain;
    const nopass = await execRaw(cfg, `sudo -n ${command}`);
    if (nopass.code === 0)
        return nopass;
    const pw = sudoPassword ?? (typeof cfg.password === "string" ? cfg.password : undefined);
    if (!pw)
        return plain;
    let res = await execRaw(cfg, `sudo -S -p '' ${command}`, { stdin: pw + "\n" });
    if (res.code !== 0 && /tty|terminal/i.test(res.stderr)) {
        res = await execRaw(cfg, `sudo -S -p '' ${command}`, { stdin: pw + "\n", pty: true });
    }
    return res;
}
const KIND_IMAGE_PATTERN = {
    nginx: /nginx/i,
    apache: /(apache|httpd)/i,
    haproxy: /haproxy/i,
    npm: /(nginx-proxy-manager|^npm$)/i,
};
const KIND_CONTAINER_COMMANDS = {
    nginx: { reload: "nginx -s reload", test: "nginx -t", confDest: "/etc/nginx" },
    apache: { reload: "apachectl -k graceful", test: "apachectl configtest", confDest: "/etc/apache2" },
    haproxy: { reload: "kill -HUP 1", test: "haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg", confDest: "/usr/local/etc/haproxy" },
    npm: { reload: "nginx -s reload", test: "nginx -t", confDest: "/data/nginx" },
};
export async function detectDockerContainers(cfg, kind, sudoPassword) {
    const { stdout, code, stderr } = await execDocker(cfg, `docker ps --format '{{.Names}}|{{.Image}}'`, sudoPassword);
    if (code !== 0) {
        throw new Error(stderr.trim() || "Не удалось выполнить docker ps. Установлен ли Docker и есть ли права у пользователя на сокет?");
    }
    const pattern = KIND_IMAGE_PATTERN[kind];
    const commands = KIND_CONTAINER_COMMANDS[kind];
    const lines = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const allContainers = lines.map((line) => {
        const [name, image] = line.split("|");
        return { name: name ?? "", image: image ?? "" };
    });
    const candidates = [];
    for (const line of lines) {
        const [name, image] = line.split("|");
        if (!name || !pattern.test(image ?? ""))
            continue;
        let configPaths = [];
        let note = null;
        try {
            const { stdout: mountsJson } = await execDocker(cfg, `docker inspect ${name} --format '{{json .Mounts}}'`, sudoPassword);
            const mounts = JSON.parse(mountsJson);
            const confMount = mounts.find((m) => m.Destination === commands.confDest || m.Destination === `${commands.confDest}/conf.d`);
            if (confMount) {
                configPaths = confMount.Destination.endsWith("conf.d")
                    ? [`${confMount.Source}/*.conf`]
                    : [`${confMount.Source}/conf.d/*.conf`, `${confMount.Source}/sites-enabled/*`];
            }
            else {
                note =
                    "Не найден bind mount для конфигов контейнера на хосте — конфиги и сертификаты видны только внутри контейнера, сканирование их не найдёт. Примонтируйте директорию конфигов на хост (-v /путь/на/хосте:" +
                        commands.confDest +
                        ") или укажите путь вручную.";
            }
        }
        catch {
            note = "Не удалось определить точки монтирования контейнера — укажите пути к конфигам вручную.";
        }
        candidates.push({
            name,
            image,
            reloadCommand: `docker exec ${name} ${commands.reload}`,
            testCommand: `docker exec ${name} ${commands.test}`,
            configPaths,
            note,
        });
    }
    return { candidates, allContainers };
}
//# sourceMappingURL=dockerDetect.js.map
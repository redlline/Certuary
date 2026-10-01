# Certuary

Менеджер TLS-сертификатов для флота nginx/apache/haproxy/NPM-серверов по SSH.

## Структура

- `server/` — Express + better-sqlite3 + ssh2 API (TypeScript, ESM).
  - `src/` — исходники (восстановлены из dist; раньше были утеряны).
  - `dist/` — результат `tsc`. `dist.orig/` — бэкап оригинальной сборки.
  - `data/` — `fleet.db` (SQLite) и `secret.key` (ключ AES-256-GCM для секретов).
- `client/` — React 19 + Vite 6 + Tailwind 4 SPA. Исходники восстановлены
  из минифицированного бандла и лежат в `client/src` (`pages/`,
  `components/`, `api.ts`, `types.ts`, `hooks/`, `lib/`). Сборка:
  `npm run build` → `client/dist`. `client/dist.orig/` — бэкап
  оригинального бандла.

## Команды

```bash
cd server
npm install        # если install-скрипты заблокированы — см. ниже
npm run build      # tsc -p tsconfig.json → dist/
npm run dev        # tsx watch src/index.ts
npm start          # node dist/index.js (порт 4000 или CERTUARY_API_PORT)
```

### Windows / Node 24 и better-sqlite3

Prebuilt-бинарей `better-sqlite3@11` под Node 24 (ABI v137) нет, а MSVC
toolchain на машине не установлен. Для локального запуска:

```bash
npm install --no-save better-sqlite3@12.11.1
cd node_modules/better-sqlite3 && npx prebuild-install
```

(`--no-save`, чтобы не менять package.json — на проде зависимость ставится по
package.json и собирается штатно.)

## Sudo / не-root SSH

`servers.sudo_password_encrypted` — необязательный отдельный пароль sudo.
Эскалация реализована в `src/ssh/client.ts`:

- `execCommand` — обычный exec от имени SSH-пользователя;
- `execPrivileged(server, cmd)` — для root выполняет как есть; для остальных
  определяет режим (`sudo -n true` → NOPASSWD, иначе `sudo -S -p ''` с паролем
  из stdin; для `auth_type=password` пароль sudo = SSH-пароль, если не задан
  отдельный). Режим кэшируется per-server, сбрасывается при update/delete
  (`invalidateSudoCache`).
- `resolveSudoMode` используется в `testConnection` для предупреждения.
- `deployBundle` для не-root грузит файлы в `/tmp` по SFTP и перемещает на
  место через `execPrivileged` (cp/chmod).
- `dockerDetect` пробует `docker` → `sudo -n docker` → `sudo -S docker`.

API: `sudoPassword` в `POST/PUT /api/servers` и `POST /api/servers/detect-docker`.
Пустая строка в PUT очищает сохранённый пароль.

### Клиент

```bash
cd client
npm install
npm run dev     # vite (прокси /api → http://localhost:4000)
npm run build   # tsc -b && vite build → client/dist
```

## Деплой (VPS, Ubuntu 22.04, Node 20)

Код живёт в `/opt/certuary` (`server/` + `client/`), служба `certuary.service`
(`node dist/index.js`, рабочая папка `/opt/certuary/server`). БД и `secret.key`
в `server/data/` — при деплое не трогать. Процедура: загрузить tarball →
бэкап `server/dist` и `client/dist` → распаковать в `/opt/certuary` с учётом
структуры (`server/dist`, `client/dist`) → `systemctl restart certuary` →
проверить `curl localhost:4000/api/auth/status`. Зависимости не менялись —
`npm install` на сервере не нужен.

## Заметки

- Бэкап/восстановление: `GET/POST /api/backup` (zip: fleet.db + secret.key).
- Аутентификация: cookie `certuary_session` (HMAC, 14 дней), пароль админа в
  `settings.admin_password_hash` (scrypt). Если пароль не задан — API открыт.
- Клиент восстановлен из бандла в `client/src`; поле «Пароль sudo» в форме
  сервера — нативное (см. `components/ServerModal.tsx`).

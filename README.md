# Certuary

Менеджер TLS-сертификатов для флота nginx / Apache / HAProxy / Nginx Proxy Manager.

Подключается к серверам по SSH, сканирует конфиги, собирает сроки действия
сертификатов, умеет загружать и раскатывать новые сертификаты, перезагружать
веб-серверы и слать уведомления об истечении в Telegram.

## Возможности

- Мониторинг сроков действия сертификатов по всем серверам и сайтам
- Автосканирование конфигов nginx / Apache / HAProxy (server_name, ssl_certificate…)
- Загрузка сертификата + ключа (+ chain) с валидацией, бэкапом и откатом при
  неудачном `nginx -t`
- Массовая загрузка и сопоставление сертификатов по доменам
- Интеграция с Nginx Proxy Manager (API): сканирование proxy-хостов, загрузка и
  продление сертификатов
- Проверка «живого» сертификата по TLS и сверка с файлом
- Группировка серверов, события, журнал, экспорт CSV, бэкап/восстановление БД
- **Работа без root**: эскалация через `sudo` (`sudo -n` для NOPASSWD,
  `sudo -S` с паролем — отдельным или SSH-паролем)

## Стек

- **Backend:** Node.js 20+, Express, better-sqlite3, ssh2, ssh2-sftp-client,
  node-forge, zod, node-cron (TypeScript, ESM)
- **Frontend:** React 19 + Vite 6 + Tailwind 4 + react-router-dom + lucide-react
  (исходники в `client/src`, собранный бандл в `client/dist`)

## Запуск

```bash
cd server
npm install
npm run build   # tsc → dist/
npm start       # http://localhost:4000 (порт через CERTUARY_API_PORT)
```

Первый вход: задайте пароль администратора в веб-интерфейсе.

### Разработка

```bash
cd server
npm run dev     # tsx watch src/index.ts

cd client
npm install
npm run dev     # vite dev-сервер (прокси /api → :4000)
npm run build   # tsc -b && vite build → dist/
```

## Деплой

На сервере: `/opt/certuary/{server,client}`, systemd-юнит `certuary.service`
(`node dist/index.js` из `/opt/certuary/server`). При деплое заменяются
`server/dist` и `client/dist`; `server/data/` (БД + ключ шифрования) и
`node_modules` не трогаются. Подробности — в `AGENTS.md`.

## Безопасность

- SSH-секреты и пароли sudo хранятся в SQLite в зашифрованном виде
  (AES-256-GCM, ключ — `server/data/secret.key`, mode 600)
- Сессия — HMAC-подписанная cookie (14 дней), пароль админа — scrypt
- `CERTUARY_SESSION_SECRET` — секрет подписи сессий (задавать на проде!)
- `server/data/` в репозиторий не коммитится — там БД и ключ шифрования

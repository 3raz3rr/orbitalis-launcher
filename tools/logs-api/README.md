# Orbitalis Logs API (local)

Локальный JSON API для вкладки «логи» в лаунчере. На прод пока не выкладываем.

## Запуск

```bash
cd tools/logs-api
copy .env.example .env
npm start
```

По умолчанию `LOGS_DEV_BYPASS=1`: любой валидный Discord Bearer из лаунчера считается staff (роль Discord не проверяется).

Для реальной проверки ролей: `LOGS_DEV_BYPASS=0` и `DISCORD_BOT_TOKEN=...` в `.env`.

## Эндпоинты

- `GET /health`
- `GET /api/me` — Bearer
- `GET /api/tree?year&month&day&round` — staff
- `GET /api/round?year&month&day&round` — staff
- `POST /api/generate` `{ "files": ["rel/path.log"] }` — staff
- `GET /api/view?jobId&page` — staff

Логи по умолчанию: `fixtures/logs/` (структура `YYYY/MM/DD/round-N/`).

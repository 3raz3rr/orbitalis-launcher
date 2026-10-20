# Сайт серверов Orbitalis

Главная, общий список и кабинет владельца. Игрок скачивает лаунчер. Владелец входит через Discord, заводит сервер и скачивает `orbitalis_bridge.dm`.

Локальный адрес нужен только чтобы открыть сайт до выкладки на домен. На сервере задаётся `PUBLIC_URL` и `DISCORD_CLIENT_SECRET`, в приложении Discord — redirect `{PUBLIC_URL}/auth/discord/callback`.

## Запуск

```bash
cd tools/servers-api
copy .env.example .env
npm start
```

Кабинет: http://127.0.0.1:8791/

`SERVERS_DEV_BYPASS=1` включает кнопку «Войти локально». В проде выключить и заходить токеном сессии лаунчера: `Authorization: Bearer …`. Роли «дом» и «наш» задаёт `HOME_OWNER_IDS`.

Проверка: `npm run smoke` из `tools/servers-api` или `node tools/servers-api/scripts/smoke.js` из корня.

## Что ставится в билд

Скачанный файл добавить в `.dme`.

- `world/New()` вызывает `orbitalis_bridge_start()` — раз в 30 секунд шлёт онлайн.
- `client/New()` вызывает `orbitalis_bridge_login(src)` — забирает одноразовый Discord-билет.
- Свою карту, код тревоги и номер раунда отдаёт более поздний `/proc/orbitalis_collect_status()`.

Игра ходит на `PUBLIC_URL` через `world.Export`. Этот адрес должен открываться с машины сервера.

Лаунчер перед входом на Discord-сервер зовёт `POST /api/servers/:id/play` со своей сессией и подставляет билет в `byond://host:port?orbitalis_ticket=…`. Если параметр до клиента не доехал, пакет сверяет адрес игрока или единственный ожидающий билет.

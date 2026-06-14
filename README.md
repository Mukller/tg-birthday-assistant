<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](LICENSE.md)
[![maintained](https://img.shields.io/badge/maintained%3F-yes-green?style=flat-square)](https://github.com/Mukller/tg-birthday-assistant)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

### 🌐 Язык / Language

**Нажми, чтобы развернуть нужный язык · Click to expand your language**

</div>

<details open>
<summary><b>🇬🇧 English</b></summary>

<br>

# 🎂 Telegram Birthday Assistant

A Telegram bot that reminds you about birthdays and sends greetings
**on your behalf** via Telegram (MTProto/GramJS). Built to the **SPEC-1**
specification on a NestJS + Prisma + PostgreSQL + Redis + BullMQ + Telegraf + GramJS stack.

> ⚠️ The bot sends messages from your personal account. Automating a
> user account is a "grey area" of the Telegram ToS. That's why it includes
> randomized delays, an hourly limit, and FloodWait handling to
> minimize the risk of restrictions. Use it in moderation and at your own risk.

---

## What it can do

- 📱 Connect your Telegram account (phone → code → 2FA)
- 🔐 Store the MTProto session in the DB, encrypted with **AES-256-GCM**
- 📇 Import contacts and dialogs (no bots/channels/groups/deleted), with dedup and ranking
- 🎂 Full date of birth, inline calendar, send time
- ⏰ Multiple reminder rules (7/3/1/0 days before + custom), grouped reminders
- ✍️ Greeting drafts with history and preview
- 🚀 Send now or schedule for the birthday date (delayed BullMQ job)
- 🔁 Per-user queues, retry, FloodWait, random delays, hourly limit
- 📜 Delivery history, logs (kept indefinitely)
- 📤 Export/import (JSON/CSV/NDJSON), full backup
- 🗑 Soft-delete with an automatic backup before deletion + restore via /start
- ⏰ Reminder snooze ("remind later"), custom rules by entering a number
- ➕ Manual contact adding, multi-token search
- 💡 Greeting text suggestions (templates, no external APIs)
- 🔁 Auto-retry sending with backoff (up to 2 retries) on top of FloodWait/limits
- 🛠 Hidden admin panel (`ADMIN_TELEGRAM_ID`): stats, queues, sessions, errors
- 🩺 `/health` endpoint, unit tests, CI (GitHub Actions)

---

## Requirements

- Node.js 22+ (tested on 24)
- Docker + Docker Compose (for PostgreSQL and Redis)
- Telegram Bot token (from [@BotFather](https://t.me/BotFather))
- `api_id` / `api_hash` from https://my.telegram.org

---

## Quick start (local)

```powershell
# 1. Dependencies (already installed if you deployed via the assistant)
npm install

# 2. Bring up PostgreSQL + Redis
npm run db:up           # docker compose up -d postgres redis

# 3. Apply the DB schema
npm run prisma:migrate  # creates a migration and tables

# 4. Run the bot (watch mode)
npm run start:dev
```

Open the bot in Telegram and send **/start**.

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `BOT_TOKEN` | bot token from @BotFather |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | MTProto app (my.telegram.org) |
| `SESSION_ENCRYPTION_KEY` | 32-byte hex key for session encryption |
| `ADMIN_TELEGRAM_ID` | your numeric Telegram id for the admin panel |
| `DATABASE_URL` / `REDIS_URL` | connections (default matches docker-compose) |
| `SEND_DELAY_MIN_SEC` / `MAX` | random delay range before sending |
| `RATE_LIMIT_PER_HOUR` | per-user hourly message limit |
| `DEFAULT_TIMEZONE` | default timezone |

Generate an encryption key:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Running everything in Docker

```powershell
docker compose --profile full up -d --build
```
Brings up PostgreSQL, Redis, and the app itself (`app`), which runs
migrations on startup (`prisma migrate deploy`).

---

## Onboarding flow

```
/start → Welcome → Connect account (phone → code → 2FA)
       → Import contacts → Reminder rules → Main menu
```

Main menu: upcoming birthdays + buttons
`[✍️ Write greetings] [📅 Calendar] [📇 Contacts] [⚙️ Settings]`.

> 💡 When entering the login code, type it **with separators** (`1 2 3 4 5`), otherwise
> Telegram may invalidate the code after "seeing" it in the chat.

---

## Architecture

```
src/
  config/         config + env validation
  common/         prisma, redis, crypto (AES-256-GCM), date/labels/html utils
  fsm/            Redis FSM (user:{id}:state, TTL)
  users/          users, admin check
  mtproto/        GramJS: login, encrypted sessions, import, sending, FloodWait/SessionInvalid
  contacts/       import+dedup+ranking, search, birthdays
  reminders/      rules, idempotent reminders
  drafts/         drafts + history
  queue/          per-user BullMQ queues (queue:user:{id})
  sending/        job processor: limit, random delay, retry, FloodWait
  scheduler/      reminder cron + queue warm-up on startup
  logs/           message_logs, admin_logs, rate-limit count
  export/         export/import, full backup, soft-delete
  notifier/       sending messages to the user from background jobs
  bot/            Telegraf: onboarding, menu, cards, calendar, settings, admin
```

---

## Specification coverage (MVP)

| SPEC-1 section | Status |
|---|---|
| Telegram Bot (inline, FSM, RU) | ✅ |
| MTProto: login/2FA/sessions/sending/reconnect | ✅ |
| Contacts: import/dedup/ranking/search | ✅ |
| Birthdays: date/calendar/list/reminders | ✅ |
| Reminders: multiple rules, grouping | ✅ |
| Drafts: persistence, history, preview | ✅ |
| Scheduled/auto send, retry, FloodWait, random delays, limits | ✅ |
| History/logs, indefinite retention | ✅ |
| Export/Import (JSON/CSV/NDJSON), backup | ✅ |
| Admin panel (stats/queues/sessions/errors) | ✅ |
| Security: AES-256-GCM, queue isolation, soft-delete | ✅ |
| Per-user queues, session recovery | ✅ |

### Known simplifications
- Contact ranking is by dialog recency (no frequency/reciprocity analysis).
- Auto-detection of birthdays from Telegram is not done (a Could Have section).
- FloodWait reschedules the specific job; for heavy scenarios a global
  timer-based queue pause could be added.
- Sending by `telegram_user_id` uses an entity-cache "warm-up" via getDialogs;
  when a `@username` is present, the peer is resolved directly.
```

</details>

<details>
<summary><b>🇷🇺 Русский</b></summary>

<br>

# 🎂 Telegram Birthday Assistant

Telegram-бот, который напоминает о днях рождения и отправляет поздравления
**от вашего имени** через Telegram (MTProto/GramJS). Реализован по спецификации
**SPEC-1** на стеке NestJS + Prisma + PostgreSQL + Redis + BullMQ + Telegraf + GramJS.

> ⚠️ Бот отправляет сообщения от вашего личного аккаунта. Автоматизация
> пользовательского аккаунта — «серая зона» Telegram ToS. Поэтому встроены
> рандомизированные задержки, часовой лимит и обработка FloodWait, чтобы
> минимизировать риск ограничений. Используйте умеренно и на свой риск.

---

## Что умеет

- 📱 Подключение вашего Telegram-аккаунта (номер → код → 2FA)
- 🔐 Хранение MTProto-сессии в БД, зашифрованной **AES-256-GCM**
- 📇 Импорт контактов и диалогов (без ботов/каналов/групп/удалённых), дедупликация и ранжирование
- 🎂 Полная дата рождения, inline-календарь, время отправки
- ⏰ Несколько правил напоминаний (за 7/3/1/0 дней + свои), сгруппированные напоминания
- ✍️ Черновики поздравлений с историей, предпросмотр
- 🚀 Отправка сейчас или планирование на дату ДР (delayed BullMQ job)
- 🔁 Per-user очереди, retry, FloodWait, рандомные задержки, лимит в час
- 📜 История доставки, логи (бессрочно)
- 📤 Экспорт/импорт (JSON/CSV/NDJSON), полный бэкап
- 🗑 Soft-delete с автоматическим бэкапом перед удалением + восстановление через /start
- ⏰ Снуз напоминаний («напомнить позже»), кастомные правила вводом числа
- ➕ Ручное добавление контактов, мультитокенный поиск
- 💡 Подсказки текста поздравлений (шаблоны, без внешних API)
- 🔁 Авто-retry отправки с бэкоффом (до 2 повторов) поверх FloodWait/лимитов
- 🛠 Скрытая админ-панель (`ADMIN_TELEGRAM_ID`): статистика, очереди, сессии, ошибки
- 🩺 `/health` endpoint, юнит-тесты, CI (GitHub Actions)

---

## Требования

- Node.js 22+ (проверено на 24)
- Docker + Docker Compose (для PostgreSQL и Redis)
- Telegram Bot token (от [@BotFather](https://t.me/BotFather))
- `api_id` / `api_hash` с https://my.telegram.org

---

## Быстрый старт (локально)

```powershell
# 1. Зависимости (уже установлены, если разворачивали через ассистента)
npm install

# 2. Поднять PostgreSQL + Redis
npm run db:up           # docker compose up -d postgres redis

# 3. Применить схему БД
npm run prisma:migrate  # создаст миграцию и таблицы

# 4. Запустить бота (watch-режим)
npm run start:dev
```

Откройте бота в Telegram и отправьте **/start**.

### Переменные окружения (`.env`)

| Переменная | Назначение |
|---|---|
| `BOT_TOKEN` | токен бота от @BotFather |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | MTProto-приложение (my.telegram.org) |
| `SESSION_ENCRYPTION_KEY` | 32-байтный hex-ключ для шифрования сессий |
| `ADMIN_TELEGRAM_ID` | ваш числовой Telegram id для админ-панели |
| `DATABASE_URL` / `REDIS_URL` | подключения (по умолчанию совпадают с docker-compose) |
| `SEND_DELAY_MIN_SEC` / `MAX` | диапазон рандомной задержки перед отправкой |
| `RATE_LIMIT_PER_HOUR` | лимит сообщений в час на пользователя |
| `DEFAULT_TIMEZONE` | часовой пояс по умолчанию |

Сгенерировать ключ шифрования:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Запуск целиком в Docker

```powershell
docker compose --profile full up -d --build
```
Поднимет PostgreSQL, Redis и само приложение (`app`), которое при старте
накатывает миграции (`prisma migrate deploy`).

---

## Поток онбординга

```
/start → Welcome → Подключить аккаунт (телефон → код → 2FA)
       → Импорт контактов → Правила напоминаний → Главное меню
```

Главное меню: ближайшие ДР + кнопки
`[✍️ Написать поздравления] [📅 Календарь] [📇 Контакты] [⚙️ Настройки]`.

> 💡 При вводе кода логина вводите его **с разделителями** (`1 2 3 4 5`), иначе
> Telegram может аннулировать код, «увидев» его в переписке.

---

## Архитектура

```
src/
  config/         конфиг + валидация env
  common/         prisma, redis, crypto (AES-256-GCM), date/labels/html утилиты
  fsm/            Redis-FSM (user:{id}:state, TTL)
  users/          пользователи, проверка админа
  mtproto/        GramJS: логин, шифрованные сессии, импорт, отправка, FloodWait/SessionInvalid
  contacts/       импорт+дедуп+ранжирование, поиск, ДР
  reminders/      правила, идемпотентные напоминания
  drafts/         черновики + история
  queue/          per-user BullMQ очереди (queue:user:{id})
  sending/        обработчик задач: лимит, рандом-задержка, retry, FloodWait
  scheduler/      cron напоминаний + прогрев очередей при старте
  logs/           message_logs, admin_logs, rate-limit count
  export/         экспорт/импорт, полный бэкап, soft-delete
  notifier/       отправка сообщений пользователю из фоновых задач
  bot/            Telegraf: онбординг, меню, карточки, календарь, настройки, админка
```

---

## Покрытие спецификации (MVP)

| Раздел SPEC-1 | Статус |
|---|---|
| Telegram Bot (inline, FSM, RU) | ✅ |
| MTProto: логин/2FA/сессии/отправка/reconnect | ✅ |
| Contacts: импорт/дедуп/ранжирование/поиск | ✅ |
| Birthdays: дата/календарь/список/напоминания | ✅ |
| Reminders: несколько правил, группировка | ✅ |
| Drafts: персистентность, история, предпросмотр | ✅ |
| Scheduled/auto send, retry, FloodWait, рандом-задержки, лимиты | ✅ |
| History/logs, бессрочное хранение | ✅ |
| Export/Import (JSON/CSV/NDJSON), бэкап | ✅ |
| Admin panel (статистика/очереди/сессии/ошибки) | ✅ |
| Security: AES-256-GCM, изоляция очередей, soft-delete | ✅ |
| Per-user queues, session recovery | ✅ |

### Известные упрощения
- Ранжирование контактов — по свежести диалогов (без анализа частоты/взаимности).
- Автоопределение дат рождения из Telegram не делается (раздел Could Have).
- FloodWait перепланирует конкретную задачу; для тяжёлых сценариев можно добавить
  глобальную паузу очереди по таймеру.
- Отправка по `telegram_user_id` использует «прогрев» entity-кэша через getDialogs;
  при наличии `@username` peer резолвится напрямую.
```

</details>

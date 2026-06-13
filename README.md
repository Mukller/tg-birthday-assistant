<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](LICENSE.md)
[![maintained](https://img.shields.io/badge/maintained%3F-yes-green?style=flat-square)](https://github.com/Mukller/tg-birthday-assistant)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

---

## Language / Язык

</div>

| **📖 English** | **📖 Русский** |
|:---:|:---:|
| Scroll down / Листай вниз | Листай вниз / Scroll down |

---

## English Version




# 🎂 Telegram Birthday Assistant

[Русский](README.md) • English

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-Latest-red?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![maintained](https://img.shields.io/badge/maintained%3F-yes-green?style=flat-square)](https://github.com/Mukller/tg-birthday-assistant)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

A Telegram bot that reminds you of birthdays and sends congratulations **on your behalf** via Telegram (MTProto/GramJS). Built on NestJS + Prisma + PostgreSQL + Redis + BullMQ + Telegraf + GramJS.

> ⚠️ The bot sends messages from your personal account. Automating user accounts is a "grey area" in Telegram ToS. Randomized delays, hourly limits, and FloodWait handling are built in to minimize risks. Use moderately and at your own risk.

---

## Features

- 📱 Connect your Telegram account (phone → code → 2FA)
- 🔐 MTProto session stored in DB, encrypted with **AES-256-GCM**
- 📇 Import contacts and dialogs (no bots/channels/groups/deleted), deduplication and ranking
- 🎂 Full birthday date, inline calendar, send time
- ⏰ Multiple reminder rules (7/3/1/0 days before + custom), grouped reminders
- ✍️ Congratulation drafts with history, preview
- 🚀 Send now or schedule for birthday date (delayed BullMQ job)
- 🔁 Per-user queues, retry, FloodWait, random delays, hourly limit
- 📜 Delivery history, logs (permanent)
- 📤 Export/import (JSON/CSV/NDJSON), full backup
- 🗑 Soft-delete with automatic backup before deletion + restore via /start
- ⏰ Reminder snooze ("remind later"), custom rules by entering a number
- ➕ Manual contact addition, multi-token search
- 💡 Congratulation text hints (templates, no external APIs)
- 🔁 Auto-retry with backoff (up to 2 retries) on top of FloodWait/limits
- 🛠 Hidden admin panel (`ADMIN_TELEGRAM_ID`): stats, queues, sessions, errors
- 🩺 `/health` endpoint, unit tests, CI (GitHub Actions)

---

## Requirements

- Node.js 22+ (tested on 24)
- Docker + Docker Compose (for PostgreSQL and Redis)
- Telegram Bot token (from [@BotFather](https://t.me/BotFather))
- `api_id` / `api_hash` from https://my.telegram.org

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL + Redis
npm run db:up

# 3. Apply DB schema
npm run prisma:migrate

# 4. Start bot (watch mode)
npm run start:dev
```

Open the bot in Telegram and send **/start**.

## Environment Variables (`.env`)

| Variable | Purpose |
|---|---|
| `BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | MTProto app (my.telegram.org) |
| `SESSION_ENCRYPTION_KEY` | 32-byte hex key for session encryption |
| `ADMIN_TELEGRAM_ID` | Your numeric Telegram ID for admin panel |
| `DATABASE_URL` / `REDIS_URL` | Connections (default matches docker-compose) |
| `SEND_DELAY_MIN_SEC` / `MAX` | Random delay range before sending |
| `RATE_LIMIT_PER_HOUR` | Per-user hourly message limit |
| `DEFAULT_TIMEZONE` | Default timezone |

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## License

MIT © 2024-2026 [Anton Mukller](https://github.com/Mukller)

---

## Русская версия




# 🎂 Telegram Birthday Assistant

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-Latest-red?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![maintained](https://img.shields.io/badge/maintained%3F-yes-green?style=flat-square)](https://github.com/Mukller/tg-birthday-assistant)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

[English](README_EN.md) • Русский

</div>


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
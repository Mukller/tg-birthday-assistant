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

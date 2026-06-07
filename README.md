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
- 🗑 Soft-delete с автоматическим бэкапом перед удалением
- 🛠 Скрытая админ-панель (`ADMIN_TELEGRAM_ID`): статистика, очереди, сессии, ошибки

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

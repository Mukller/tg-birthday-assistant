# Contributing Guide / Руководство для контрибьютеров

[English](#english) • [Русский](#russian)

---

<a name="russian"></a>
## 🇷🇺 Русский

Спасибо за интерес к проекту!

## 🚀 Как начать

```bash
git clone https://github.com/YOUR_USERNAME/tg-birthday-assistant.git
cd tg-birthday-assistant
git remote add upstream https://github.com/Mukller/tg-birthday-assistant.git
git checkout -b feature/description upstream/main
```

## 🔧 Установка зависимостей

```bash
npm install
npm run db:up       # PostgreSQL + Redis через Docker
npm run prisma:migrate
npm run start:dev
```

## 📝 Коммиты
```bash
git commit -m "feat: новая функция"
git commit -m "fix: исправление ошибки"
git commit -m "docs: обновление документации"
```

## 🔄 Pull Requests
1. ✅ Убедись что код работает
2. ✅ Запусти тесты: `npm run test`
3. ✅ Обновись с `upstream/main`
4. ✅ Создай PR с описанием

## ❓ Вопросы?
Создай [Issue](https://github.com/Mukller/tg-birthday-assistant/issues).

---

<a name="english"></a>
## 🇬🇧 English

Thank you for your interest in contributing!

## 🚀 Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/tg-birthday-assistant.git
cd tg-birthday-assistant
git remote add upstream https://github.com/Mukller/tg-birthday-assistant.git
git checkout -b feature/description upstream/main
```

## 🔧 Install Dependencies

```bash
npm install
npm run db:up       # PostgreSQL + Redis via Docker
npm run prisma:migrate
npm run start:dev
```

## 📝 Commit Messages
```bash
git commit -m "feat: new feature"
git commit -m "fix: bug fix"
git commit -m "docs: documentation update"
```

## 🔄 Pull Requests
1. ✅ Ensure code works correctly
2. ✅ Run tests: `npm run test`
3. ✅ Sync with `upstream/main`
4. ✅ Create PR with clear description

## ❓ Questions?
Open an [Issue](https://github.com/Mukller/tg-birthday-assistant/issues).

---

**Happy Coding!** 💻

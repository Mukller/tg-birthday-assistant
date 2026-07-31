import { Markup } from 'telegraf';
import { Contact } from '@prisma/client';
import { formatBirthDate } from '../common/date.util';

export const mainMenuKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✍️ Написать поздравления', 'menu:congrats')],
    [Markup.button.callback('📋 Мои поздравления', 'menu:mycongrats')],
    [
      Markup.button.callback('📅 Календарь', 'menu:calendar'),
      Markup.button.callback('📇 Контакты', 'menu:contacts'),
    ],
    [
      Markup.button.callback('📊 Статистика', 'menu:stats'),
      Markup.button.callback('⚙️ Настройки', 'menu:settings'),
    ],
  ]);

export const backToMenu = () =>
  Markup.inlineKeyboard([[Markup.button.callback('« Главное меню', 'menu:main')]]);

export const contactCardKeyboard = (c: Contact) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🎉 Поздравить', `c:congrat:${c.id}`)],
    [
      Markup.button.callback('📅 Дата', `c:date:${c.id}`),
      Markup.button.callback('🕐 Время', `c:time:${c.id}`),
    ],
    [
      Markup.button.callback('📜 История', `c:hist:${c.id}`),
      Markup.button.callback('❌ Удалить', `c:del:${c.id}`),
    ],
    [Markup.button.callback('« Контакты', 'menu:contacts')],
  ]);

export const contactsListKeyboard = (contacts: Contact[], page: number, hasNext: boolean) => {
  const rows = contacts.map((c) => {
    const bd = c.birthDate ? ` — ${formatBirthDate(c.birthDate)}` : '';
    return [Markup.button.callback(`👤 ${c.fullName}${bd}`, `c:view:${c.id}`)];
  });
  const nav: any[] = [];
  if (page > 0) nav.push(Markup.button.callback('« Назад', `contacts:page:${page - 1}`));
  if (hasNext) nav.push(Markup.button.callback('Вперёд »', `contacts:page:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([
    Markup.button.callback('🔍 Поиск', 'contacts:search'),
    Markup.button.callback('➕ Добавить', 'contacts:add'),
  ]);
  rows.push([Markup.button.callback('« Главное меню', 'menu:main')]);
  return Markup.inlineKeyboard(rows);
};

export const congratPreviewKeyboard = (contactId: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Отправить сейчас', `cg:now:${contactId}`)],
    [Markup.button.callback('🕐 Запланировать на ДР', `cg:sched:${contactId}`)],
    [Markup.button.callback('🎁 Подарить с поздравлением', `gift:pick:${contactId}`)],
    [Markup.button.callback('✏️ Переписать', `c:congrat:${contactId}`)],
    [Markup.button.callback('« Отмена', `c:view:${contactId}`)],
  ]);

export const remindersKeyboard = (
  rules: { id: number; daysBefore: number; isActive: boolean }[],
  inOnboarding = false,
) => {
  const rows = rules.map((r) => [
    Markup.button.callback(
      `${r.isActive ? '✅' : '⬜️'} за ${r.daysBefore} дн.`,
      `rule:toggle:${r.id}`,
    ),
    Markup.button.callback('🗑', `rule:remove:${r.id}`),
  ]);
  rows.push([
    Markup.button.callback('+1', 'rule:add:1'),
    Markup.button.callback('+3', 'rule:add:3'),
    Markup.button.callback('+7', 'rule:add:7'),
    Markup.button.callback('+30', 'rule:add:30'),
  ]);
  rows.push([Markup.button.callback('✏️ Своё (кол-во дней)', 'rule:custom')]);
  rows.push([
    inOnboarding
      ? Markup.button.callback('➡️ Завершить настройку', 'onb:finish')
      : Markup.button.callback('« Настройки', 'menu:settings'),
  ]);
  return Markup.inlineKeyboard(rows);
};

export const settingsKeyboard = (connected: boolean) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('⏰ Правила напоминаний', 'set:reminders')],
    [
      Markup.button.callback(
        connected ? '🔌 Переподключить аккаунт' : '🔗 Подключить аккаунт',
        'set:reconnect',
      ),
    ],
    [Markup.button.callback('🔄 Импорт контактов из Telegram', 'set:synccontacts')],
    [
      Markup.button.callback('📤 Экспорт', 'set:export'),
      Markup.button.callback('📥 Импорт из бэкапа', 'set:import'),
    ],
    [Markup.button.callback('🗑 Удалить мои данные', 'set:delete')],
    [Markup.button.callback('« Главное меню', 'menu:main')],
  ]);

export const exportKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📇 Контакты (CSV)', 'export:contacts:csv')],
    [Markup.button.callback('📅 Календарь (CSV)', 'export:calendar:csv')],
    [Markup.button.callback('📜 История (JSON)', 'export:history:json')],
    [Markup.button.callback('🗄 Полный бэкап (JSON)', 'export:full:json')],
    [Markup.button.callback('« Настройки', 'menu:settings')],
  ]);

export const confirmDeleteKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('⚠️ Да, удалить и прислать бэкап', 'set:delete_confirm')],
    [Markup.button.callback('« Отмена', 'menu:settings')],
  ]);

export const connectKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('🔗 Подключить Telegram-аккаунт', 'set:reconnect')]]);

export const adminKeyboard = () =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 Статистика', 'admin:stats'),
      Markup.button.callback('📦 Очереди', 'admin:queues'),
    ],
    [
      Markup.button.callback('🔐 Сессии', 'admin:sessions'),
      Markup.button.callback('🐞 Ошибки', 'admin:errors'),
    ],
  ]);

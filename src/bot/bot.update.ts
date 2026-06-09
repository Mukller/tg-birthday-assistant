import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Update, Start, Command, Action, On, Ctx } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { DateTime } from 'luxon';
import { User } from '@prisma/client';

import { UsersService } from '../users/users.service';
import { MtprotoService } from '../mtproto/mtproto.service';
import { SessionStoreService } from '../mtproto/session-store.service';
import { PasswordNeededSignal } from '../mtproto/errors';
import { ContactsService } from '../contacts/contacts.service';
import { RemindersService } from '../reminders/reminders.service';
import { DraftsService } from '../drafts/drafts.service';
import { SendingService } from '../sending/sending.service';
import { LogsService } from '../logs/logs.service';
import { ExportService, ExportType, ExportFormat } from '../export/export.service';
import { FsmService } from '../fsm/fsm.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

import { esc } from '../common/html.util';
import { dayLabel } from '../common/labels';
import { formatBirthDate, nextBirthdayInfo, toBirthDate } from '../common/date.util';
import { buildCalendar, buildBirthdayCalendar } from './bot.calendar';
import { generateSuggestions } from './suggestions';
import * as kb from './bot.keyboards';

const STEP = {
  AUTH_PHONE: 'AUTH_PHONE',
  AUTH_CODE: 'AUTH_CODE',
  AUTH_PASSWORD: 'AUTH_PASSWORD',
  CONTACT_TEXT: 'CONTACT_TEXT',
  CONTACT_TIME: 'CONTACT_TIME',
  SEARCH: 'SEARCH',
  IMPORT_WAIT: 'IMPORT_WAIT',
  CUSTOM_RULE: 'CUSTOM_RULE',
  ADD_CONTACT: 'ADD_CONTACT',
  GIFT_NOTE: 'GIFT_NOTE',
} as const;

const PAGE_SIZE = 8;

@Update()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    private readonly users: UsersService,
    private readonly mtproto: MtprotoService,
    private readonly sessions: SessionStoreService,
    private readonly contacts: ContactsService,
    private readonly reminders: RemindersService,
    private readonly drafts: DraftsService,
    private readonly sending: SendingService,
    private readonly logs: LogsService,
    private readonly exporter: ExportService,
    private readonly fsm: FsmService,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────

  private async me(ctx: Context): Promise<User> {
    const from = ctx.from!;
    return this.users.getOrCreate({
      id: from.id,
      username: from.username,
      first_name: from.first_name,
    });
  }

  private async safeEdit(ctx: Context, text: string, markup?: any): Promise<void> {
    const extra: any = { parse_mode: 'HTML' };
    if (markup) extra.reply_markup = markup.reply_markup;
    try {
      await ctx.editMessageText(text, extra);
    } catch {
      try {
        await ctx.reply(text, extra);
      } catch (e: any) {
        this.logger.warn(`reply failed: ${e?.message}`);
      }
    }
  }

  private async reply(ctx: Context, text: string, markup?: any): Promise<void> {
    const extra: any = { parse_mode: 'HTML' };
    if (markup) extra.reply_markup = markup.reply_markup;
    await ctx.reply(text, extra);
  }

  // ── Entry points ──────────────────────────────────────────────────

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    const existing = await this.users.getByTelegramId(ctx.from!.id);
    const wasDeleted = existing?.deletedAt != null;
    const user = await this.me(ctx);
    await this.fsm.clear(ctx.from!.id);
    if (wasDeleted) {
      await this.users.restore(user.id);
      await this.queue.resumeUser(user.id);
      await this.reply(ctx, '♻️ С возвращением! Аккаунт восстановлен, данные на месте.');
    }
    const onboarding = await this.prisma.onboardingState.findUnique({ where: { userId: user.id } });
    if (onboarding?.completed) {
      await this.showMain(ctx, user, false);
      return;
    }
    await this.showWelcome(ctx);
  }

  @Command('menu')
  async onMenu(@Ctx() ctx: Context): Promise<void> {
    await this.showMain(ctx, await this.me(ctx), false);
  }

  @Command('help')
  async onHelp(@Ctx() ctx: Context): Promise<void> {
    await this.reply(
      ctx,
      '🎂 <b>Birthday Assistant — помощь</b>\n\n' +
        'Я напоминаю о днях рождения и отправляю поздравления <b>от вашего имени</b>.\n\n' +
        '<b>Команды:</b>\n' +
        '/start — запуск / восстановление аккаунта\n' +
        '/menu — главное меню\n' +
        '/help — эта справка\n\n' +
        '<b>Как пользоваться:</b>\n' +
        '1) Подключите Telegram-аккаунт (⚙️ Настройки)\n' +
        '2) Импортируйте контакты и задайте даты рождения (📇 Контакты)\n' +
        '3) Настройте напоминания (⚙️ → Правила)\n' +
        '4) Пишите поздравления и отправляйте сейчас или планируйте на ДР (✍️)\n\n' +
        '💡 Текст можно сгенерировать кнопкой «Подсказать текст».',
      kb.mainMenuKeyboard(),
    );
  }

  @Command('admin')
  async onAdmin(@Ctx() ctx: Context): Promise<void> {
    if (!this.users.isAdmin(ctx.from!.id)) return;
    await this.reply(
      ctx,
      '🛠 <b>Админ-панель</b>\nВыберите раздел мониторинга:',
      kb.adminKeyboard(),
    );
  }

  private async showWelcome(ctx: Context): Promise<void> {
    const text =
      '👋 <b>Добро пожаловать в Birthday Assistant!</b>\n\n' +
      'Я помогу не забывать о днях рождения и отправлять поздравления ' +
      '<b>от вашего имени</b> в Telegram.\n\n' +
      'Что я умею:\n' +
      '• 📇 импортировать контакты из вашего Telegram\n' +
      '• 🎂 хранить даты рождения и напоминать о них\n' +
      '• ✍️ готовить и отправлять поздравления автоматически\n\n' +
      'Для начала подключите ваш Telegram-аккаунт.';
    await this.reply(ctx, text, kb.connectKeyboard());
  }

  // ── Main screen ───────────────────────────────────────────────────

  @Action('menu:main')
  async actMain(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.showMain(ctx, await this.me(ctx), true);
  }

  private async showMain(ctx: Context, user: User, edit: boolean): Promise<void> {
    const upcoming = await this.contacts.listUpcoming(user.id, 30, user.timezone);
    const lines: string[] = ['🎂 <b>Ближайшие дни рождения</b>', ''];
    if (upcoming.length === 0) {
      lines.push('Пока нет ближайших дат.');
      lines.push('Добавьте дни рождения в разделе 📇 Контакты.');
    } else {
      const groups = new Map<number, typeof upcoming>();
      for (const u of upcoming) {
        const arr = groups.get(u.daysUntil) ?? [];
        arr.push(u);
        groups.set(u.daysUntil, arr);
      }
      for (const days of [...groups.keys()].sort((a, b) => a - b)) {
        lines.push(`<b>${dayLabel(days)}:</b>`);
        for (const u of groups.get(days)!) {
          const age = u.turning != null ? ` (${u.turning})` : '';
          lines.push(`• ${esc(u.contact.fullName)}${age}`);
        }
        lines.push('');
      }
    }
    const text = lines.join('\n').trim();
    if (edit) await this.safeEdit(ctx, text, kb.mainMenuKeyboard());
    else await this.reply(ctx, text, kb.mainMenuKeyboard());
  }

  // ── Calendar ──────────────────────────────────────────────────────

  @Action('menu:calendar')
  async actCalendar(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const now = DateTime.now();
    await this.showBirthdayCalendar(ctx, await this.me(ctx), now.year, now.month);
  }

  @Action(/^bcal:nav:(\d+):(\d+)$/)
  async actBcalNav(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const m = (ctx as any).match;
    await this.showBirthdayCalendar(ctx, await this.me(ctx), parseInt(m[1], 10), parseInt(m[2], 10));
  }

  private async showBirthdayCalendar(
    ctx: Context,
    user: User,
    year: number,
    month: number,
  ): Promise<void> {
    const contacts = await this.prisma.contact.findMany({
      where: { ownerUserId: user.id, birthDate: { not: null } },
    });
    const byDay = new Set<number>();
    for (const c of contacts) {
      const dt = DateTime.fromJSDate(c.birthDate!, { zone: 'utc' });
      if (dt.month === month) byDay.add(dt.day);
    }
    const monthName = DateTime.fromObject({ year, month, day: 1 }).setLocale('ru').toFormat('LLLL yyyy');
    const cap = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    let header: string;
    if (contacts.length === 0) {
      const total = await this.contacts.count(user.id);
      header =
        `📅 <b>Календарь дней рождения</b> — ${cap}\n\n` +
        `Пока нет ни одной даты (из ${total} контактов). Листай месяцы стрелками; ` +
        `или найди дни рождения автоматически 👇`;
    } else {
      header = `📅 <b>${cap}</b>\nДни с 🎂 — есть день рождения. Нажми на день, чтобы увидеть кто.`;
    }
    await this.safeEdit(
      ctx,
      header,
      buildBirthdayCalendar(year, month, [...byDay], contacts.length === 0),
    );
  }

  @Action(/^bcal:day:(\d+):(\d+):(\d+)$/)
  async actBcalDay(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const m = (ctx as any).match;
    const user = await this.me(ctx);
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const contacts = await this.prisma.contact.findMany({
      where: { ownerUserId: user.id, birthDate: { not: null } },
    });
    const matches = contacts.filter((c) => {
      const dt = DateTime.fromJSDate(c.birthDate!, { zone: 'utc' });
      return dt.month === month && dt.day === day;
    });
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    const lines = [`🎂 <b>${dd}.${mm}</b> — дни рождения`, ''];
    if (matches.length === 0) lines.push('Никого.');
    for (const c of matches) {
      const info = nextBirthdayInfo(c.birthDate!, user.timezone);
      const when = info.daysUntil === 0 ? 'сегодня' : `через ${info.daysUntil} дн.`;
      const age = info.turning != null ? `, исполнится ${info.turning}` : '';
      lines.push(`• ${esc(c.fullName)} (${when}${age})`);
    }
    await this.safeEdit(
      ctx,
      lines.join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('« Назад к календарю', `bcal:nav:${year}:${month}`)],
        [Markup.button.callback('« Главное меню', 'menu:main')],
      ]),
    );
  }

  @Action(/^bcal:list:(\d+):(\d+)$/)
  async actBcalList(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const m = (ctx as any).match;
    const user = await this.me(ctx);
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const contacts = await this.prisma.contact.findMany({
      where: { ownerUserId: user.id, birthDate: { not: null } },
    });
    const items = contacts
      .map((c) => ({ c, dt: DateTime.fromJSDate(c.birthDate!, { zone: 'utc' }) }))
      .filter((x) => x.dt.month === month)
      .sort((a, b) => a.dt.day - b.dt.day);
    const monthName = DateTime.fromObject({ year, month, day: 1 }).setLocale('ru').toFormat('LLLL');
    const cap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const lines = [`📜 <b>Дни рождения — ${cap}</b>`, ''];
    if (items.length === 0) lines.push('В этом месяце нет дней рождения.');
    for (const { c, dt } of items) {
      const info = nextBirthdayInfo(c.birthDate!, user.timezone);
      const age = info.turning != null ? `, ${info.turning}` : '';
      const mm = String(month).padStart(2, '0');
      lines.push(
        `• ${String(dt.day).padStart(2, '0')}.${mm} — ${esc(c.fullName)} (через ${info.daysUntil} дн.${age})`,
      );
    }
    await this.safeEdit(
      ctx,
      lines.join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('« Назад к календарю', `bcal:nav:${year}:${month}`)],
        [Markup.button.callback('« Главное меню', 'menu:main')],
      ]),
    );
  }

  @Action('bd:detect')
  async actDetectBirthdays(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Запускаю поиск…');
    const user = await this.me(ctx);
    if (!(await this.sessions.hasActive(user.id))) {
      await this.safeEdit(ctx, '⚠️ Сначала подключите аккаунт (⚙️ Настройки).', kb.backToMenu());
      return;
    }
    await this.safeEdit(
      ctx,
      '🔍 Ищу дни рождения в Telegram (до ~150 контактов). Это займёт 1–2 минуты — ' +
        'дождитесь сообщения с результатом…',
    );
    try {
      const res = await this.contacts.detectBirthdays(user.id, 150);
      const note = res.floodWait
        ? '\n⏳ Telegram попросил паузу — часть контактов не проверена, запустите ещё раз позже.'
        : '';
      await this.reply(
        ctx,
        `✅ Готово. Проверено: ${res.scanned}, найдено дат: <b>${res.found}</b>.${note}\n\n` +
          (res.found > 0
            ? 'Открой 📅 Календарь — даты уже там.'
            : 'Ни у кого из проверенных контактов не указан день рождения в Telegram. ' +
              'Можно проставить вручную в 📇 Контакты.'),
        Markup.inlineKeyboard([
          [Markup.button.callback('📅 Календарь', 'menu:calendar')],
          [Markup.button.callback('« Главное меню', 'menu:main')],
        ]),
      );
    } catch (e: any) {
      await this.reply(ctx, `❌ Ошибка поиска: ${esc(e?.message)}`, kb.backToMenu());
    }
  }

  // ── Account connection / login ────────────────────────────────────

  @Action('set:reconnect')
  async actReconnect(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    if (!this.mtproto.credentialsConfigured) {
      await this.safeEdit(
        ctx,
        '⚙️ MTProto не настроен на сервере.\nАдминистратору нужно заполнить ' +
          '<code>TELEGRAM_API_ID</code> и <code>TELEGRAM_API_HASH</code> в .env.',
        kb.backToMenu(),
      );
      return;
    }
    await this.fsm.setState(ctx.from!.id, STEP.AUTH_PHONE);
    await this.safeEdit(
      ctx,
      '📱 Отправьте номер телефона вашего Telegram-аккаунта в международном ' +
        'формате, например <code>+79991234567</code>.',
    );
  }

  private async handlePhone(ctx: Context, user: User, phone: string): Promise<void> {
    const normalized = this.mtproto.normalizePhone(phone);
    try {
      const phoneCodeHash = await this.mtproto.startLogin(user.id, normalized);
      await this.fsm.setState(ctx.from!.id, STEP.AUTH_CODE, { phone: normalized, phoneCodeHash });
      await this.reply(
        ctx,
        '✉️ Код отправлен в Telegram.\n\n' +
          '⚠️ Чтобы Telegram не аннулировал код, введите его <b>с разделителями</b>, ' +
          'например <code>1 2 3 4 5</code> или <code>1-2-3-4-5</code>.',
      );
    } catch (e: any) {
      await this.reply(ctx, `❌ Не удалось отправить код: ${esc(e?.message)}`, kb.connectKeyboard());
      await this.fsm.clear(ctx.from!.id);
    }
  }

  private async handleCode(ctx: Context, user: User, raw: string): Promise<void> {
    const state = await this.fsm.getState<{ phone: string; phoneCodeHash: string }>(ctx.from!.id);
    if (!state) return;
    const code = raw.replace(/\D/g, '');
    try {
      await this.mtproto.submitCode(user.id, state.data.phone, state.data.phoneCodeHash, code);
      await this.onConnected(ctx, user);
    } catch (e: any) {
      if (e instanceof PasswordNeededSignal) {
        await this.fsm.setState(ctx.from!.id, STEP.AUTH_PASSWORD, { phone: state.data.phone });
        await this.reply(ctx, '🔐 Включена двухфакторная защита. Отправьте пароль (2FA).');
        return;
      }
      await this.reply(ctx, `❌ Неверный код: ${esc(e?.message)}\nПопробуйте ещё раз или /start.`);
    }
  }

  private async handlePassword(ctx: Context, user: User, password: string): Promise<void> {
    const state = await this.fsm.getState<{ phone: string }>(ctx.from!.id);
    if (!state) return;
    try {
      await this.mtproto.submitPassword(user.id, state.data.phone, password.trim());
      await this.onConnected(ctx, user);
    } catch (e: any) {
      await this.reply(ctx, `❌ Неверный пароль: ${esc(e?.message)}\nПопробуйте ещё раз.`);
    }
  }

  private async onConnected(ctx: Context, user: User): Promise<void> {
    await this.fsm.clear(ctx.from!.id);
    await this.reminders.ensureDefaultRules(user.id);
    await this.prisma.onboardingState.update({
      where: { userId: user.id },
      data: { currentStep: 'IMPORT_CONTACTS' },
    });
    await this.reply(
      ctx,
      '✅ <b>Аккаунт подключён!</b>\n\nТеперь импортируем ваши контакты, чтобы вы могли ' +
        'добавить им дни рождения.',
      Markup.inlineKeyboard([
        [Markup.button.callback('📥 Импортировать контакты', 'onb:import')],
        [Markup.button.callback('Пропустить', 'onb:finish')],
      ]),
    );
  }

  // ── Onboarding: import & finish ───────────────────────────────────

  @Action('onb:import')
  async actImport(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    await this.safeEdit(ctx, '⏳ Импортирую контакты, это может занять до минуты…');
    try {
      const res = await this.contacts.importForUser(user.id);
      await this.reminders.ensureDefaultRules(user.id);
      const rules = await this.reminders.listRules(user.id);
      await this.safeEdit(
        ctx,
        `✅ Импортировано: <b>${res.imported}</b> новых, обновлено ${res.updated}.\n\n` +
          '⏰ Настройте, за сколько дней напоминать о днях рождения:',
        kb.remindersKeyboard(rules, true),
      );
    } catch (e: any) {
      await this.safeEdit(ctx, `❌ Импорт не удался: ${esc(e?.message)}`, kb.backToMenu());
    }
  }

  @Action('onb:finish')
  async actFinish(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    await this.reminders.ensureDefaultRules(user.id);
    await this.prisma.onboardingState.update({
      where: { userId: user.id },
      data: { currentStep: 'COMPLETED', completed: true },
    });
    await this.showMain(ctx, user, true);
  }

  // ── Contacts ──────────────────────────────────────────────────────

  @Action('menu:contacts')
  async actContacts(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.showContacts(ctx, await this.me(ctx), 0);
  }

  @Action(/^contacts:page:(\d+)$/)
  async actContactsPage(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const page = parseInt((ctx as any).match[1], 10);
    await this.showContacts(ctx, await this.me(ctx), page);
  }

  private async showContacts(ctx: Context, user: User, page: number): Promise<void> {
    const total = await this.contacts.count(user.id);
    const list = await this.contacts.listTop(user.id, PAGE_SIZE, page * PAGE_SIZE);
    const hasNext = (page + 1) * PAGE_SIZE < total;
    const text =
      total === 0
        ? '📇 Контактов пока нет. Импортируйте их в ⚙️ Настройки → Переподключить аккаунт.'
        : `📇 <b>Контакты</b> (${total}). Выберите, чтобы открыть карточку:`;
    await this.safeEdit(ctx, text, kb.contactsListKeyboard(list, page, hasNext));
  }

  @Action('contacts:search')
  async actSearch(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.fsm.setState(ctx.from!.id, STEP.SEARCH);
    await this.safeEdit(ctx, '🔍 Введите имя, @username или телефон для поиска:');
  }

  @Action(/^c:view:(\d+)$/)
  async actContactView(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.showContactCard(ctx, await this.me(ctx), parseInt((ctx as any).match[1], 10));
  }

  private async showContactCard(ctx: Context, user: User, contactId: number): Promise<void> {
    const c = await this.contacts.getById(user.id, contactId);
    if (!c) {
      await this.safeEdit(ctx, 'Контакт не найден.', kb.backToMenu());
      return;
    }
    const lines = [`👤 <b>${esc(c.fullName)}</b>`];
    if (c.username) lines.push(`@${esc(c.username)}`);
    lines.push('');
    if (c.birthDate) {
      const info = nextBirthdayInfo(c.birthDate, user.timezone);
      lines.push(`🎂 ${formatBirthDate(c.birthDate)}  •  через ${info.daysUntil} дн.`);
      if (info.turning != null) lines.push(`🎈 исполнится: ${info.turning}`);
    } else {
      lines.push('🎂 дата рождения не указана');
    }
    lines.push(`🕐 время отправки: ${c.birthTime}`);
    await this.safeEdit(ctx, lines.join('\n'), kb.contactCardKeyboard(c));
  }

  @Action(/^c:date:(\d+)$/)
  async actContactDate(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const contactId = parseInt((ctx as any).match[1], 10);
    const now = DateTime.now();
    await this.safeEdit(ctx, '📅 Выберите дату рождения:', buildCalendar(contactId, now.year, now.month));
  }

  @Action(/^cal:nav:(\d+):(\d+):(\d+)$/)
  async actCalNav(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const m = (ctx as any).match;
    await this.safeEdit(
      ctx,
      '📅 Выберите дату рождения:',
      buildCalendar(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)),
    );
  }

  @Action(/^cal:pick:(\d+):(\d+):(\d+):(\d+)$/)
  async actCalPick(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Дата сохранена');
    const m = (ctx as any).match;
    const user = await this.me(ctx);
    const contactId = parseInt(m[1], 10);
    const date = toBirthDate(parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10));
    await this.contacts.setBirthday(user.id, contactId, date);
    await this.showContactCard(ctx, user, contactId);
  }

  @Action('cal:ignore')
  async actCalIgnore(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
  }

  @Action(/^c:time:(\d+)$/)
  async actContactTime(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const contactId = parseInt((ctx as any).match[1], 10);
    await this.fsm.setState(ctx.from!.id, STEP.CONTACT_TIME, { contactId });
    await this.safeEdit(ctx, '🕐 Во сколько отправлять поздравление? Формат <code>ЧЧ:ММ</code>, например 09:00.');
  }

  @Action(/^c:hist:(\d+)$/)
  async actContactHistory(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    const contactId = parseInt((ctx as any).match[1], 10);
    const c = await this.contacts.getById(user.id, contactId);
    const history = await this.logs.contactHistory(user.id, contactId, 10);
    const lines = [`📜 <b>История — ${esc(c?.fullName ?? '')}</b>`, ''];
    if (history.length === 0) lines.push('Пока пусто.');
    for (const h of history) {
      const when = DateTime.fromJSDate(h.createdAt).toFormat('dd.MM.yyyy HH:mm');
      const icon = h.status === 'sent' ? '✅' : h.status === 'failed' ? '❌' : '⏳';
      lines.push(`${icon} ${when} — ${esc(h.messageText.slice(0, 60))}`);
    }
    await this.safeEdit(
      ctx,
      lines.join('\n'),
      Markup.inlineKeyboard([[Markup.button.callback('« Назад', `c:view:${contactId}`)]]),
    );
  }

  @Action(/^c:del:(\d+)$/)
  async actContactDelete(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Удалено');
    const user = await this.me(ctx);
    await this.contacts.delete(user.id, parseInt((ctx as any).match[1], 10));
    await this.showContacts(ctx, user, 0);
  }

  // ── Congratulations ───────────────────────────────────────────────

  @Action('menu:congrats')
  async actCongrats(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    const upcoming = await this.contacts.listUpcoming(user.id, 30, user.timezone);
    if (upcoming.length === 0) {
      await this.safeEdit(
        ctx,
        '✍️ Нет ближайших дней рождения (30 дней). Добавьте даты в 📇 Контакты.',
        kb.backToMenu(),
      );
      return;
    }
    const rows = upcoming.map((u) => [
      Markup.button.callback(
        `${dayLabel(u.daysUntil)} — ${u.contact.fullName}`,
        `c:congrat:${u.contact.id}`,
      ),
    ]);
    rows.push([Markup.button.callback('« Главное меню', 'menu:main')]);
    await this.safeEdit(ctx, '✍️ Кого поздравляем?', Markup.inlineKeyboard(rows));
  }

  @Action(/^c:congrat:(\d+)$/)
  async actCongratWrite(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    const contactId = parseInt((ctx as any).match[1], 10);
    const c = await this.contacts.getById(user.id, contactId);
    if (!c) return;
    await this.fsm.setState(ctx.from!.id, STEP.CONTACT_TEXT, { contactId });
    const draft = await this.drafts.getActiveDraft(user.id, contactId);
    const hint = draft ? `\n\nТекущий черновик:\n<i>${esc(draft.draftText)}</i>` : '';
    await this.safeEdit(
      ctx,
      `✍️ Напишите текст поздравления для <b>${esc(c.fullName)}</b>.${hint}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('💡 Подсказать текст', `cg:suggest:${contactId}`)],
        [Markup.button.callback('« Отмена', `c:view:${contactId}`)],
      ]),
    );
  }

  private async handleCongratText(ctx: Context, user: User, text: string): Promise<void> {
    const state = await this.fsm.getState<{ contactId: number }>(ctx.from!.id);
    if (!state) return;
    const contactId = state.data.contactId;
    await this.drafts.createDraft(user.id, contactId, text);
    await this.fsm.clear(ctx.from!.id);
    await this.showCongratPreview(ctx, user, contactId, false);
  }

  private async showCongratPreview(ctx: Context, user: User, contactId: number, edit: boolean): Promise<void> {
    const c = await this.contacts.getById(user.id, contactId);
    const draft = await this.drafts.getActiveDraft(user.id, contactId);
    if (!c || !draft) return;
    const lines = [`📋 <b>Поздравление для ${esc(c.fullName)}</b>`, ''];
    if (c.birthDate) {
      const info = nextBirthdayInfo(c.birthDate, user.timezone);
      lines.push(`📅 ${info.next.toFormat('dd.MM.yyyy')}  🕐 ${c.birthTime}`);
    } else {
      lines.push('⚠️ Дата рождения не указана — доступна только отправка сейчас.');
    }
    lines.push('', `<i>${esc(draft.draftText)}</i>`);
    const markup = kb.congratPreviewKeyboard(contactId);
    if (edit) await this.safeEdit(ctx, lines.join('\n'), markup);
    else await this.reply(ctx, lines.join('\n'), markup);
  }

  @Action(/^cg:now:(\d+)$/)
  async actCongratNow(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    const contactId = parseInt((ctx as any).match[1], 10);
    const draft = await this.drafts.getActiveDraft(user.id, contactId);
    if (!draft) return;
    if (!(await this.sessions.hasActive(user.id))) {
      await this.safeEdit(ctx, '⚠️ Сначала подключите аккаунт (⚙️ Настройки).', kb.backToMenu());
      return;
    }
    await this.sending.sendNow(user.id, contactId, draft.draftText);
    await this.safeEdit(
      ctx,
      '🚀 Поздравление поставлено в очередь на отправку. Я сообщу о результате.',
      kb.backToMenu(),
    );
  }

  @Action(/^cg:sched:(\d+)$/)
  async actCongratSchedule(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    const contactId = parseInt((ctx as any).match[1], 10);
    const c = await this.contacts.getById(user.id, contactId);
    const draft = await this.drafts.getActiveDraft(user.id, contactId);
    if (!c || !draft) return;
    if (!c.birthDate) {
      await this.safeEdit(ctx, '⚠️ Укажите дату рождения, чтобы запланировать отправку.', kb.backToMenu());
      return;
    }
    const info = nextBirthdayInfo(c.birthDate, user.timezone);
    const [hh, mm] = c.birthTime.split(':').map((x) => parseInt(x, 10));
    const scheduledFor = info.next.set({ hour: hh || 0, minute: mm || 0, second: 0 }).toJSDate();
    await this.sending.schedule(user.id, contactId, draft.draftText, scheduledFor);
    await this.drafts.markScheduled(draft.id, scheduledFor);
    await this.safeEdit(
      ctx,
      `🗓 Запланировано на <b>${info.next.toFormat('dd.MM.yyyy')} ${c.birthTime}</b>. ` +
        'Отправлю автоматически от вашего имени.',
      kb.backToMenu(),
    );
  }

  // ── Gifts (Telegram Stars) ────────────────────────────────────────

  @Action(/^gift:pick:(\d+)$/)
  async actGiftPick(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    const contactId = parseInt((ctx as any).match[1], 10);
    if (!(await this.sessions.hasActive(user.id))) {
      await this.safeEdit(ctx, '⚠️ Сначала подключите аккаунт (⚙️ Настройки).', kb.backToMenu());
      return;
    }
    try {
      const [balance, gifts] = await Promise.all([
        this.mtproto.getStarBalance(user.id),
        this.mtproto.listGifts(user.id),
      ]);
      const rows: any[] = [];
      let row: any[] = [];
      for (const g of gifts.slice(0, 18)) {
        row.push(
          Markup.button.callback(`${g.emoji} ${g.stars}⭐`, `gift:note:${contactId}:${g.id}`),
        );
        if (row.length === 3) {
          rows.push(row);
          row = [];
        }
      }
      if (row.length) rows.push(row);
      rows.push([Markup.button.callback('« Отмена', `c:view:${contactId}`)]);
      await this.safeEdit(
        ctx,
        `🎁 <b>Подарок</b>\nВаш баланс: <b>${balance}⭐</b>\nВыберите подарок (спишется со звёздного баланса):`,
        Markup.inlineKeyboard(rows),
      );
    } catch (e: any) {
      await this.safeEdit(ctx, `❌ Не удалось получить подарки: ${esc(e?.message)}`, kb.backToMenu());
    }
  }

  @Action(/^gift:note:(\d+):(\d+)$/)
  async actGiftNote(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const m = (ctx as any).match;
    const contactId = parseInt(m[1], 10);
    const giftId = m[2];
    await this.fsm.setState(ctx.from!.id, STEP.GIFT_NOTE, { contactId, giftId });
    await this.safeEdit(
      ctx,
      '✍️ Напишите короткий текст, который пойдёт <b>вместе с подарком</b> (до 255 символов).\n' +
        'Или отправьте «<code>-</code>» — подарок без подписи.\n\n' +
        '<i>Само поздравление уйдёт отдельным сообщением в чат.</i>',
    );
  }

  private async handleGiftNote(ctx: Context, user: User, text: string): Promise<void> {
    const state = await this.fsm.getState<{ contactId: number; giftId: string }>(ctx.from!.id);
    if (!state) return;
    const note = text.trim() === '-' ? '' : text.trim();
    await this.fsm.setState(ctx.from!.id, STEP.GIFT_NOTE, { ...state.data, note });

    const { contactId, giftId } = state.data;
    const c = await this.contacts.getById(user.id, contactId);
    if (!c) {
      await this.fsm.clear(ctx.from!.id);
      return;
    }
    const [balance, gifts] = await Promise.all([
      this.mtproto.getStarBalance(user.id),
      this.mtproto.listGifts(user.id),
    ]);
    const gift = gifts.find((g) => g.id === giftId);
    if (!gift) {
      await this.fsm.clear(ctx.from!.id);
      await this.reply(ctx, 'Подарок недоступен.', kb.backToMenu());
      return;
    }
    const draft = await this.drafts.getActiveDraft(user.id, contactId);
    const enough = balance >= gift.stars;
    const lines = [
      '🎁 <b>Подтверждение</b>',
      '',
      `Кому: <b>${esc(c.fullName)}</b>`,
      `Подарок: <b>${gift.emoji} ${gift.stars}⭐</b>  (баланс ${balance}⭐${enough ? '' : ' ⚠️ мало'})`,
      draft
        ? `\n💬 В чат: <i>${esc(draft.draftText.slice(0, 150))}</i>`
        : '\n💬 В чат: <i>(нет текста — напишите поздравление заранее)</i>',
      note ? `🎁 К подарку: <i>${esc(note)}</i>` : '🎁 К подарку: <i>(без подписи)</i>',
    ];
    const rows: any[] = [];
    if (enough) {
      rows.push([
        Markup.button.callback(`✅ Подарить за ${gift.stars}⭐`, `gift:do:${contactId}:${giftId}`),
      ]);
    }
    rows.push([Markup.button.callback('« Выбрать другой', `gift:pick:${contactId}`)]);
    await this.reply(ctx, lines.join('\n'), Markup.inlineKeyboard(rows));
  }

  @Action(/^gift:do:(\d+):(\d+)$/)
  async actGiftDo(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Отправляю…');
    const user = await this.me(ctx);
    const m = (ctx as any).match;
    const contactId = parseInt(m[1], 10);
    const giftId = m[2];
    const c = await this.contacts.getById(user.id, contactId);
    if (!c) return;

    const state = await this.fsm.getState<{ giftId: string; note?: string }>(ctx.from!.id);
    const note = state && state.data.giftId === giftId ? state.data.note ?? '' : '';
    await this.fsm.clear(ctx.from!.id);

    const draft = await this.drafts.getActiveDraft(user.id, contactId);
    const peer = {
      telegramUserId: c.telegramUserId,
      username: c.username,
      phone: c.normalizedPhone,
    };
    await this.safeEdit(ctx, '⏳ Отправляю поздравление и подарок…');

    // 1) congratulation as a normal chat message
    let chatOk = false;
    if (draft?.draftText) {
      try {
        const res = await this.mtproto.sendMessage(user.id, peer, draft.draftText);
        await this.logs.log({
          userId: user.id,
          contactId,
          messageText: draft.draftText,
          status: 'sent',
          telegramMessageId: res.telegramMessageId,
          sentAt: new Date(),
        });
        chatOk = true;
      } catch (e: any) {
        await this.logs.log({
          userId: user.id,
          contactId,
          messageText: draft.draftText,
          status: 'failed',
          errorMessage: String(e?.message ?? e).slice(0, 200),
        });
      }
    }

    // 2) the gift with its own separate note
    try {
      await this.mtproto.sendGift(user.id, peer, giftId, note || undefined);
      const chatNote = draft?.draftText
        ? chatOk
          ? '\n💬 Поздравление отправлено в чат.'
          : '\n⚠️ Подарок ушёл, но текст в чат отправить не удалось.'
        : '';
      await this.reply(ctx, `✅ <b>${esc(c.fullName)}</b>: подарок отправлен! 🎉${chatNote}`, kb.backToMenu());
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const human = /BALANCE|STARS|insufficient|FORM/i.test(msg)
        ? 'возможно, недостаточно звёзд или подарок недоступен'
        : msg;
      await this.reply(
        ctx,
        `❌ Подарок не отправлен: ${esc(human)}${chatOk ? '\n(поздравление в чат уже ушло)' : ''}`,
        kb.backToMenu(),
      );
    }
  }

  // ── Reminders ─────────────────────────────────────────────────────

  @Action('set:reminders')
  async actReminders(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.showReminders(ctx, await this.me(ctx));
  }

  private async showReminders(ctx: Context, user: User): Promise<void> {
    await this.reminders.ensureDefaultRules(user.id);
    const rules = await this.reminders.listRules(user.id);
    await this.safeEdit(
      ctx,
      '⏰ <b>Правила напоминаний</b>\nЗа сколько дней до ДР напоминать. Нажмите, чтобы вкл/выкл.',
      kb.remindersKeyboard(rules, false),
    );
  }

  @Action(/^rule:add:(\d+)$/)
  async actRuleAdd(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Добавлено');
    const user = await this.me(ctx);
    await this.reminders.addRule(user.id, parseInt((ctx as any).match[1], 10));
    await this.refreshReminders(ctx, user);
  }

  @Action(/^rule:toggle:(\d+)$/)
  async actRuleToggle(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    await this.reminders.toggleRule(user.id, parseInt((ctx as any).match[1], 10));
    await this.refreshReminders(ctx, user);
  }

  @Action(/^rule:remove:(\d+)$/)
  async actRuleRemove(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Удалено');
    const user = await this.me(ctx);
    await this.reminders.removeRule(user.id, parseInt((ctx as any).match[1], 10));
    await this.refreshReminders(ctx, user);
  }

  private async refreshReminders(ctx: Context, user: User): Promise<void> {
    const onboarding = await this.prisma.onboardingState.findUnique({ where: { userId: user.id } });
    const rules = await this.reminders.listRules(user.id);
    await this.safeEdit(
      ctx,
      '⏰ <b>Правила напоминаний</b>\nЗа сколько дней до ДР напоминать. Нажмите, чтобы вкл/выкл.',
      kb.remindersKeyboard(rules, !onboarding?.completed),
    );
  }

  // ── Settings ──────────────────────────────────────────────────────

  @Action('menu:settings')
  async actSettings(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.showSettings(ctx, await this.me(ctx));
  }

  private async showSettings(ctx: Context, user: User): Promise<void> {
    const connected = await this.sessions.hasActive(user.id);
    const status = connected ? '🟢 подключён' : '🔴 не подключён';
    await this.safeEdit(
      ctx,
      `⚙️ <b>Настройки</b>\n\nTelegram-аккаунт: ${status}\nЧасовой пояс: ${user.timezone}`,
      kb.settingsKeyboard(connected),
    );
  }

  @Action('set:export')
  async actExportMenu(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.safeEdit(ctx, '📤 Что экспортировать?', kb.exportKeyboard());
  }

  @Action(/^export:(contacts|calendar|drafts|history|full):(json|csv|ndjson)$/)
  async actExport(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Готовлю файл…');
    const user = await this.me(ctx);
    const m = (ctx as any).match;
    const file = await this.exporter.export(user.id, m[1] as ExportType, m[2] as ExportFormat);
    await ctx.replyWithDocument({ source: file.buffer, filename: file.filename } as any);
  }

  @Action('set:import')
  async actImportMenu(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.fsm.setState(ctx.from!.id, STEP.IMPORT_WAIT);
    await this.safeEdit(
      ctx,
      '📥 Пришлите файл бэкапа (.json), который ранее экспортировали. Я добавлю недостающие контакты.',
      kb.backToMenu(),
    );
  }

  @Action('set:delete')
  async actDelete(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.safeEdit(
      ctx,
      '🗑 <b>Удаление данных</b>\n\nПеред удалением я пришлю вам полный бэкап, ' +
        'отключу сессию Telegram и поставлю очередь на паузу. Аккаунт можно восстановить через /start.',
      kb.confirmDeleteKeyboard(),
    );
  }

  @Action('set:delete_confirm')
  async actDeleteConfirm(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    await this.safeEdit(ctx, '⏳ Готовлю бэкап и удаляю данные…');
    await this.exporter.deleteAccount(user.id, user.telegramId);
    await this.reply(ctx, '✅ Готово. Данные деактивированы. Чтобы вернуться — отправьте /start.');
  }

  // ── Admin actions ─────────────────────────────────────────────────

  @Action('admin:stats')
  async actAdminStats(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    if (!this.users.isAdmin(ctx.from!.id)) return;
    const [users, active, contacts, sent, pending] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.contact.count(),
      this.prisma.messageLog.count({ where: { status: 'sent' } }),
      this.prisma.scheduledMessage.count({ where: { status: 'pending' } }),
    ]);
    await this.logs.adminLog(BigInt(ctx.from!.id), 'view_stats');
    await this.safeEdit(
      ctx,
      `📊 <b>Статистика</b>\n\n👤 Пользователей: ${users} (активных ${active})\n` +
        `📇 Контактов: ${contacts}\n✅ Отправлено: ${sent}\n⏳ В очереди: ${pending}`,
      kb.adminKeyboard(),
    );
  }

  @Action('admin:sessions')
  async actAdminSessions(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    if (!this.users.isAdmin(ctx.from!.id)) return;
    const grouped = await this.prisma.telegramSession.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const lines = ['🔐 <b>Сессии</b>', ''];
    for (const g of grouped) lines.push(`${g.status}: ${g._count._all}`);
    if (grouped.length === 0) lines.push('Нет сессий.');
    await this.safeEdit(ctx, lines.join('\n'), kb.adminKeyboard());
  }

  @Action('admin:errors')
  async actAdminErrors(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    if (!this.users.isAdmin(ctx.from!.id)) return;
    const errors = await this.prisma.messageLog.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const lines = ['🐞 <b>Последние ошибки отправки</b>', ''];
    if (errors.length === 0) lines.push('Ошибок нет.');
    for (const e of errors) {
      const when = DateTime.fromJSDate(e.createdAt).toFormat('dd.MM HH:mm');
      lines.push(`❌ ${when} — ${esc(e.errorMessage ?? 'unknown')}`);
    }
    await this.safeEdit(ctx, lines.join('\n'), kb.adminKeyboard());
  }

  @Action('admin:queues')
  async actAdminQueues(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    if (!this.users.isAdmin(ctx.from!.id)) return;
    const grouped = await this.prisma.scheduledMessage.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const lines = ['📦 <b>Очереди (scheduled_messages)</b>', ''];
    for (const g of grouped) lines.push(`${g.status}: ${g._count._all}`);
    if (grouped.length === 0) lines.push('Очереди пусты.');
    await this.safeEdit(ctx, lines.join('\n'), kb.adminKeyboard());
  }

  // ── Snooze reminders ──────────────────────────────────────────────

  @Action('rem:snooze')
  async actSnooze(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Напомню через 3 часа');
    const user = await this.me(ctx);
    await this.reminders.snoozeUntil(user.id, new Date(Date.now() + 3 * 3_600_000));
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {
      /* ignore */
    }
    await this.reply(ctx, '⏰ Хорошо, напомню об этих днях рождения через 3 часа.');
  }

  // ── Custom reminder rule ──────────────────────────────────────────

  @Action('rule:custom')
  async actRuleCustom(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.fsm.setState(ctx.from!.id, STEP.CUSTOM_RULE);
    await this.safeEdit(ctx, '✏️ За сколько дней до ДР напоминать? Отправьте число (0–365).');
  }

  private async handleCustomRule(ctx: Context, user: User, text: string): Promise<void> {
    const n = parseInt(text.trim(), 10);
    if (Number.isNaN(n) || n < 0 || n > 365) {
      await this.reply(ctx, '⚠️ Нужно число от 0 до 365.');
      return;
    }
    await this.reminders.addRule(user.id, n);
    await this.fsm.clear(ctx.from!.id);
    const rules = await this.reminders.listRules(user.id);
    await this.reply(ctx, `✅ Добавлено правило: за ${n} дн.`, kb.remindersKeyboard(rules, false));
  }

  // ── Manual contact add ────────────────────────────────────────────

  @Action('contacts:add')
  async actContactsAdd(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await this.fsm.setState(ctx.from!.id, STEP.ADD_CONTACT);
    await this.safeEdit(
      ctx,
      '➕ Введите имя контакта (можно с @username), например:\n<code>Анна Сергеева @anna</code>',
    );
  }

  private async handleAddContact(ctx: Context, user: User, text: string): Promise<void> {
    const raw = text.trim();
    if (!raw) {
      await this.reply(ctx, '⚠️ Введите имя.');
      return;
    }
    const usernameMatch = raw.match(/@(\w{3,})/);
    const username = usernameMatch ? usernameMatch[1] : undefined;
    const fullName = raw.replace(/@\w+/g, '').trim() || username || 'Контакт';
    const c = await this.contacts.create(user.id, { fullName, username });
    await this.fsm.clear(ctx.from!.id);
    await this.reply(ctx, `✅ Контакт добавлен: <b>${esc(c.fullName)}</b>. Укажите дату рождения 👇`);
    await this.showContactCard(ctx, user, c.id);
  }

  // ── Suggested congratulation text ─────────────────────────────────

  @Action(/^cg:suggest:(\d+)$/)
  async actCongratSuggest(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    const user = await this.me(ctx);
    const contactId = parseInt((ctx as any).match[1], 10);
    const c = await this.contacts.getById(user.id, contactId);
    if (!c) return;
    const suggestions = generateSuggestions(c.fullName);
    const rows = suggestions.map((_, i) => [
      Markup.button.callback(`Взять вариант ${i + 1}`, `cg:use:${contactId}:${i}`),
    ]);
    rows.push([Markup.button.callback('« Назад', `c:congrat:${contactId}`)]);
    const preview = suggestions.map((s, i) => `<b>${i + 1}.</b> ${esc(s)}`).join('\n\n');
    await this.safeEdit(ctx, `💡 Варианты поздравления:\n\n${preview}`, Markup.inlineKeyboard(rows));
  }

  @Action(/^cg:use:(\d+):(\d+)$/)
  async actCongratUse(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Текст выбран');
    const user = await this.me(ctx);
    const m = (ctx as any).match;
    const contactId = parseInt(m[1], 10);
    const idx = parseInt(m[2], 10);
    const c = await this.contacts.getById(user.id, contactId);
    if (!c) return;
    const suggestions = generateSuggestions(c.fullName);
    await this.drafts.createDraft(user.id, contactId, suggestions[idx] ?? suggestions[0]);
    await this.fsm.clear(ctx.from!.id);
    await this.showCongratPreview(ctx, user, contactId, true);
  }

  // ── Free-text & document routing (must stay last) ─────────────────

  @On('text')
  async onText(@Ctx() ctx: Context): Promise<void> {
    const text = (ctx.message as any)?.text as string;
    if (!text || text.startsWith('/')) return;
    const user = await this.me(ctx);
    const state = await this.fsm.getState(ctx.from!.id);
    if (!state) {
      await this.reply(ctx, 'Не понял. Откройте меню: /menu');
      return;
    }
    switch (state.step) {
      case STEP.AUTH_PHONE:
        return this.handlePhone(ctx, user, text);
      case STEP.AUTH_CODE:
        return this.handleCode(ctx, user, text);
      case STEP.AUTH_PASSWORD:
        return this.handlePassword(ctx, user, text);
      case STEP.CONTACT_TEXT:
        return this.handleCongratText(ctx, user, text);
      case STEP.CONTACT_TIME:
        return this.handleTime(ctx, user, text);
      case STEP.SEARCH:
        return this.handleSearch(ctx, user, text);
      case STEP.CUSTOM_RULE:
        return this.handleCustomRule(ctx, user, text);
      case STEP.ADD_CONTACT:
        return this.handleAddContact(ctx, user, text);
      case STEP.GIFT_NOTE:
        return this.handleGiftNote(ctx, user, text);
      default:
        await this.reply(ctx, 'Откройте меню: /menu');
    }
  }

  private async handleTime(ctx: Context, user: User, text: string): Promise<void> {
    const state = await this.fsm.getState<{ contactId: number }>(ctx.from!.id);
    if (!state) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
    if (!m || +m[1] > 23 || +m[2] > 59) {
      await this.reply(ctx, '⚠️ Формат времени: ЧЧ:ММ, например 09:00.');
      return;
    }
    const time = `${m[1].padStart(2, '0')}:${m[2]}`;
    await this.contacts.setBirthTime(user.id, state.data.contactId, time);
    await this.fsm.clear(ctx.from!.id);
    await this.showContactCard(ctx, user, state.data.contactId);
  }

  private async handleSearch(ctx: Context, user: User, text: string): Promise<void> {
    await this.fsm.clear(ctx.from!.id);
    const results = await this.contacts.search(user.id, text, 8);
    if (results.length === 0) {
      await this.reply(ctx, 'Ничего не найдено.', kb.backToMenu());
      return;
    }
    const rows = results.map((c) => [Markup.button.callback(`👤 ${c.fullName}`, `c:view:${c.id}`)]);
    rows.push([Markup.button.callback('« Главное меню', 'menu:main')]);
    await this.reply(ctx, `Найдено: ${results.length}`, Markup.inlineKeyboard(rows));
  }

  @On('document')
  async onDocument(@Ctx() ctx: Context): Promise<void> {
    const state = await this.fsm.getState(ctx.from!.id);
    if (state?.step !== STEP.IMPORT_WAIT) return;
    const user = await this.me(ctx);
    await this.fsm.clear(ctx.from!.id);
    try {
      const doc = (ctx.message as any).document;
      const link = await ctx.telegram.getFileLink(doc.file_id);
      const res = await fetch(link.href);
      const raw = await res.text();
      const result = await this.exporter.importBackup(user.id, raw);
      await this.reply(
        ctx,
        `✅ Импорт завершён: добавлено ${result.contacts} контактов, пропущено ${result.skipped}.`,
        kb.backToMenu(),
      );
    } catch (e: any) {
      await this.reply(ctx, `❌ Импорт не удался: ${esc(e?.message)}`, kb.backToMenu());
    }
  }
}

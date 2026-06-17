import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Markup } from 'telegraf';
import { PrismaService } from '../common/prisma/prisma.service';
import { ContactsService, UpcomingContact } from '../contacts/contacts.service';
import { RemindersService } from '../reminders/reminders.service';
import { NotifierService } from '../notifier/notifier.service';
import { QueueService } from '../queue/queue.service';
import { dayLabel } from '../common/labels';
import { esc } from '../common/html.util';
import { phoneToTimezone } from '../common/phone-timezone';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly reminders: RemindersService,
    private readonly notifier: NotifierService,
    private readonly queue: QueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Recreate per-user workers so delayed jobs survive a restart, and resume
    // any queue that a prior invalid session left paused.
    const [pending, sessions] = await Promise.all([
      this.prisma.scheduledMessage.findMany({
        where: { status: 'pending' },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.telegramSession.findMany({
        where: { isActive: true, status: 'active' },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);
    const ids = new Set<number>([...pending.map((r) => r.userId), ...sessions.map((r) => r.userId)]);
    for (const id of ids) {
      this.queue.getQueue(id);
      await this.queue.resumeUser(id);
    }
    if (ids.size) this.logger.log(`Warmed & resumed ${ids.size} user queue(s)`);

    // Best-effort timezone backfill from each connected user's login phone.
    const withPhone = await this.prisma.telegramSession.findMany({
      where: { isActive: true, status: 'active' },
      select: { userId: true, phoneNumber: true },
      orderBy: { id: 'desc' },
    });
    const done = new Set<number>();
    for (const s of withPhone) {
      if (done.has(s.userId)) continue;
      done.add(s.userId);
      const tz = phoneToTimezone(s.phoneNumber);
      if (tz) {
        await this.prisma.user
          .update({ where: { id: s.userId }, data: { timezone: tz } })
          .catch(() => undefined);
      }
    }
  }

  /** Daily birthday reminder sweep (09:00 server time). */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async dailyReminders(): Promise<void> {
    await this.runReminders();
  }

  /** Re-deliver reminders that the user snoozed once their snooze is due. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async snoozeSweep(): Promise<void> {
    const due = await this.reminders.popDueSnoozes();
    for (const userId of due) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.isActive) continue;
      try {
        await this.remindUser(user.id, user.telegramId, user.timezone, true);
      } catch (e: any) {
        this.logger.warn(`Snooze re-send failed for user ${user.id}: ${e?.message}`);
      }
    }
  }

  async runReminders(): Promise<void> {
    const users = await this.prisma.user.findMany({ where: { isActive: true } });
    for (const user of users) {
      try {
        await this.remindUser(user.id, user.telegramId, user.timezone);
      } catch (e: any) {
        this.logger.warn(`Reminder sweep failed for user ${user.id}: ${e?.message}`);
      }
    }
  }

  private async remindUser(
    userId: number,
    telegramId: bigint,
    tz: string,
    force = false,
  ): Promise<void> {
    const daysBeforeList = await this.reminders.listActiveDaysBefore(userId);
    if (daysBeforeList.length === 0) return;

    const horizon = Math.max(...daysBeforeList);
    const upcoming = await this.contacts.listUpcoming(userId, horizon, tz);
    const due = upcoming.filter((u) => daysBeforeList.includes(u.daysUntil));
    if (due.length === 0) return;

    const groups = new Map<number, UpcomingContact[]>();
    for (const u of due) {
      // On a forced (snooze) re-send, skip the once-per-day idempotency guard.
      if (!force) {
        const isNew = await this.reminders.recordReminderJob(userId, u.contact.id, null, new Date());
        if (!isNew) continue;
      }
      const arr = groups.get(u.daysUntil) ?? [];
      arr.push(u);
      groups.set(u.daysUntil, arr);
    }
    if (groups.size === 0) return;

    await this.notifier.notify(telegramId, this.formatGrouped(groups), {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('✍️ Написать поздравления', 'menu:congrats')],
        [Markup.button.callback('⏰ Напомнить позже (3 ч)', 'rem:snooze')],
        [Markup.button.callback('🎂 Главное меню', 'menu:main')],
      ]).reply_markup,
    });
  }

  private formatGrouped(groups: Map<number, UpcomingContact[]>): string {
    const lines: string[] = ['🎂 <b>Ближайшие дни рождения</b>', ''];
    for (const days of [...groups.keys()].sort((a, b) => a - b)) {
      lines.push(`<b>${dayLabel(days)}:</b>`);
      for (const u of groups.get(days)!) {
        const age = u.turning != null ? ` (${u.turning})` : '';
        lines.push(`• ${esc(u.contact.fullName)}${age}`);
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  }
}

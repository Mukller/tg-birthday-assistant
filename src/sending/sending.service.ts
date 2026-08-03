import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduledMessage } from '@prisma/client';
import { Redis } from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { REDIS_CLIENT } from '../common/redis/redis.constants';
import { MtprotoService } from '../mtproto/mtproto.service';
import { FloodWaitSignal, SessionInvalidSignal } from '../mtproto/errors';
import { LogsService } from '../logs/logs.service';
import { NotifierService } from '../notifier/notifier.service';
import { QueueService, SendJobData } from '../queue/queue.service';
import { esc, sleep } from '../common/html.util';

@Injectable()
export class SendingService implements OnModuleInit {
  private readonly logger = new Logger(SendingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mtproto: MtprotoService,
    private readonly logs: LogsService,
    private readonly notifier: NotifierService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.queue.setHandler((data) => this.handleJob(data));
  }

  // ── Public API ────────────────────────────────────────────────────

  async schedule(
    userId: number,
    contactId: number,
    text: string,
    scheduledFor: Date,
  ): Promise<ScheduledMessage> {
    const sm = await this.prisma.scheduledMessage.create({
      data: { userId, contactId, messageText: text, scheduledFor, status: 'pending' },
    });
    const jobId = await this.queue.enqueueSend(userId, sm.id, scheduledFor.getTime() - Date.now());
    await this.prisma.scheduledMessage.update({
      where: { id: sm.id },
      data: { bullmqJobId: jobId },
    });
    return sm;
  }

  /** Queue an immediate send (still goes through delay + rate-limit safety). */
  async sendNow(userId: number, contactId: number, text: string): Promise<ScheduledMessage> {
    return this.schedule(userId, contactId, text, new Date());
  }

  async cancel(userId: number, scheduledMessageId: number): Promise<void> {
    const sm = await this.prisma.scheduledMessage.findFirst({
      where: { id: scheduledMessageId, userId },
    });
    if (!sm) return;
    await this.queue.cancelJob(userId, sm.bullmqJobId);
    await this.prisma.scheduledMessage.update({
      where: { id: sm.id },
      data: { status: 'cancelled' },
    });
  }

  async listPending(userId: number): Promise<ScheduledMessage[]> {
    return this.prisma.scheduledMessage.findMany({
      where: { userId, status: 'pending' },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  // ── Job handler ───────────────────────────────────────────────────

  private async handleJob({ userId, scheduledMessageId }: SendJobData): Promise<void> {
    const sm = await this.prisma.scheduledMessage.findUnique({ where: { id: scheduledMessageId } });
    if (!sm || sm.status !== 'pending') return; // cancelled / already handled

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return;

    const contact = await this.prisma.contact.findUnique({ where: { id: sm.contactId } });
    if (!contact) {
      await this.prisma.scheduledMessage.update({ where: { id: sm.id }, data: { status: 'failed' } });
      return;
    }

    // ── Hourly rate limit ──
    const rateLimit = this.config.get<number>('send.rateLimitPerHour')!;
    const sentLastHour = await this.logs.countSentSince(userId, new Date(Date.now() - 3_600_000));
    if (sentLastHour >= rateLimit) {
      const retryAt = new Date(Date.now() + 10 * 60_000);
      const jobId = await this.queue.enqueueSend(userId, sm.id, 10 * 60_000);
      await this.prisma.scheduledMessage.update({ where: { id: sm.id }, data: { bullmqJobId: jobId } });
      await this.logs.log({
        userId,
        contactId: contact.id,
        messageText: sm.messageText,
        status: 'retry_scheduled',
        errorMessage: 'rate_limit',
        retryAt,
      });
      return;
    }

    // ── Randomized human-like delay ──
    const min = this.config.get<number>('send.delayMinSec')!;
    const max = this.config.get<number>('send.delayMaxSec')!;
    await sleep((min + Math.random() * Math.max(0, max - min)) * 1000);

    try {
      const res = await this.mtproto.sendMessage(
        userId,
        {
          telegramUserId: contact.telegramUserId,
          username: contact.username,
          phone: contact.normalizedPhone,
        },
        sm.messageText,
      );
      await this.prisma.scheduledMessage.update({ where: { id: sm.id }, data: { status: 'sent' } });
      await this.redis.del(`send:retries:${sm.id}`);
      await this.logs.log({
        userId,
        contactId: contact.id,
        messageText: sm.messageText,
        status: 'sent',
        telegramMessageId: res.telegramMessageId,
        sentAt: new Date(),
      });
      await this.notifier.notify(
        user.telegramId,
        `✅ Поздравление отправлено: <b>${esc(contact.fullName)}</b>`,
      );
    } catch (e: any) {
      await this.handleSendError(e, userId, sm, contact.id, contact.fullName, user.telegramId);
    }
  }

  private async handleSendError(
    e: any,
    userId: number,
    sm: ScheduledMessage,
    contactId: number,
    contactName: string,
    telegramId: bigint,
  ): Promise<void> {
    if (e instanceof FloodWaitSignal) {
      const waitMs = (e.seconds + 2) * 1000;
      const jobId = await this.queue.enqueueSend(userId, sm.id, waitMs);
      await this.prisma.scheduledMessage.update({ where: { id: sm.id }, data: { bullmqJobId: jobId } });
      await this.logs.log({
        userId,
        contactId,
        messageText: sm.messageText,
        status: 'flood_wait',
        errorMessage: `flood_wait_${e.seconds}s`,
        retryAt: new Date(Date.now() + waitMs),
      });
      await this.notifier.notify(
        telegramId,
        `⏳ Telegram попросил подождать ${e.seconds} c. Отправлю поздравление для <b>${esc(
          contactName,
        )}</b> позже.`,
      );
      return;
    }

    if (e instanceof SessionInvalidSignal) {
      await this.queue.pauseUser(userId); // pause user's queue until reconnect
      await this.logs.log({
        userId,
        contactId,
        messageText: sm.messageText,
        status: 'failed',
        errorMessage: 'session_invalid',
      });
      await this.notifier.notify(
        telegramId,
        '⚠️ Сессия Telegram недействительна. Очередь поставлена на паузу.\n' +
          'Переподключите аккаунт: ⚙️ Настройки → 🔌 Переподключить аккаунт.',
      );
      throw e; // mark job failed; queue stays paused
    }

    // Transient error: retry with backoff up to maxRetries before giving up.
    const retryKey = `send:retries:${sm.id}`;
    const maxRetries = 2;
    const attempt = await this.redis.incr(retryKey);
    await this.redis.expire(retryKey, 6 * 3600);
    if (attempt <= maxRetries) {
      const backoffMs = attempt * 60_000;
      const jobId = await this.queue.enqueueSend(userId, sm.id, backoffMs);
      await this.prisma.scheduledMessage.update({ where: { id: sm.id }, data: { bullmqJobId: jobId } });
      await this.logs.log({
        userId,
        contactId,
        messageText: sm.messageText,
        status: 'retry_scheduled',
        errorMessage: `retry ${attempt}/${maxRetries}: ${String(e?.message ?? e).slice(0, 200)}`,
        retryAt: new Date(Date.now() + backoffMs),
      });
      this.logger.warn(`Send retry ${attempt}/${maxRetries} for user ${userId}: ${e?.message}`);
      return;
    }

    await this.redis.del(retryKey);
    this.logger.error(`Send failed permanently for user ${userId}: ${e?.message}`);
    await this.prisma.scheduledMessage.update({ where: { id: sm.id }, data: { status: 'failed' } });
    await this.logs.log({
      userId,
      contactId,
      messageText: sm.messageText,
      status: 'failed',
      errorMessage: String(e?.message ?? e).slice(0, 300),
    });
    await this.notifier.notify(
      telegramId,
      `❌ Не удалось отправить поздравление для <b>${esc(contactName)}</b> (после ${maxRetries} повторов).`,
    );
  }
}

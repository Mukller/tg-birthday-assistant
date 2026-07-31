import { Injectable } from '@nestjs/common';
import { MessageLog, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export type SendStatus = 'sent' | 'failed' | 'retry_scheduled' | 'flood_wait';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    userId: number;
    contactId: number;
    messageText: string;
    status: SendStatus;
    telegramMessageId?: bigint | null;
    errorMessage?: string | null;
    sentAt?: Date | null;
    retryAt?: Date | null;
  }): Promise<MessageLog> {
    return this.prisma.messageLog.create({
      data: {
        userId: data.userId,
        contactId: data.contactId,
        messageText: data.messageText,
        status: data.status,
        telegramMessageId: data.telegramMessageId ?? null,
        errorMessage: data.errorMessage ?? null,
        sentAt: data.sentAt ?? null,
        retryAt: data.retryAt ?? null,
      },
    });
  }

  async history(userId: number, limit = 10, offset = 0): Promise<MessageLog[]> {
    return this.prisma.messageLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async contactHistory(userId: number, contactId: number, limit = 10): Promise<MessageLog[]> {
    return this.prisma.messageLog.findMany({
      where: { userId, contactId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Used for the per-user hourly rate limit. */
  async countSentSince(userId: number, since: Date): Promise<number> {
    return this.prisma.messageLog.count({
      where: { userId, status: 'sent', sentAt: { gte: since } },
    });
  }

  async adminLog(adminId: bigint, action: string, metadata?: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.adminLog.create({
      data: { adminId, action, metadata: metadata ?? undefined },
    });
  }
}

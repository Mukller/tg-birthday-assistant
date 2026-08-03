import { Injectable } from '@nestjs/common';
import { MessageDraft } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Save a new draft; previous active drafts for the contact become history. */
  async createDraft(userId: number, contactId: number, text: string): Promise<MessageDraft> {
    await this.prisma.messageDraft.updateMany({
      where: { userId, contactId, status: 'active' },
      data: { status: 'archived' },
    });
    return this.prisma.messageDraft.create({
      data: { userId, contactId, draftText: text, status: 'active' },
    });
  }

  async getActiveDraft(userId: number, contactId: number): Promise<MessageDraft | null> {
    return this.prisma.messageDraft.findFirst({
      where: { userId, contactId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listActive(userId: number): Promise<MessageDraft[]> {
    return this.prisma.messageDraft.findMany({
      where: { userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async history(userId: number, contactId: number, limit = 10): Promise<MessageDraft[]> {
    return this.prisma.messageDraft.findMany({
      where: { userId, contactId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markScheduled(draftId: number, scheduledTime: Date): Promise<void> {
    await this.prisma.messageDraft.update({
      where: { id: draftId },
      data: { status: 'scheduled', scheduledTime },
    });
  }
}

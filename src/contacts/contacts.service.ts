import { Injectable, Logger } from '@nestjs/common';
import { Contact } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { MtprotoService, ContactCandidate } from '../mtproto/mtproto.service';
import { nextBirthdayInfo } from '../common/date.util';

export interface ImportResult {
  imported: number;
  updated: number;
  total: number;
}

export interface UpcomingContact {
  contact: Contact;
  daysUntil: number;
  turning: number | null;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mtproto: MtprotoService,
  ) {}

  // ── Import ────────────────────────────────────────────────────────

  async importForUser(userId: number): Promise<ImportResult> {
    const candidates = await this.mtproto.importContacts(userId);
    let imported = 0;
    let updated = 0;

    for (const c of candidates) {
      const existing = await this.findDuplicate(userId, c);
      if (existing) {
        await this.prisma.contact.update({
          where: { id: existing.id },
          data: {
            fullName: existing.fullName || c.fullName,
            username: c.username ?? existing.username,
            telegramUserId: existing.telegramUserId ?? c.telegramUserId,
            phone: c.phone ?? existing.phone,
            normalizedPhone: c.phone ?? existing.normalizedPhone,
            rankingScore: Math.max(existing.rankingScore, c.rankingScore),
          },
        });
        updated++;
      } else {
        await this.prisma.contact.create({
          data: {
            ownerUserId: userId,
            telegramUserId: c.telegramUserId,
            fullName: c.fullName,
            username: c.username,
            phone: c.phone,
            normalizedPhone: c.phone,
            rankingScore: c.rankingScore,
          },
        });
        imported++;
      }
    }
    this.logger.log(`Import for user ${userId}: +${imported} new, ${updated} updated`);
    return { imported, updated, total: candidates.length };
  }

  /** Deduplication priority: telegram_user_id → normalized_phone → username. */
  private async findDuplicate(
    userId: number,
    c: ContactCandidate,
  ): Promise<Contact | null> {
    if (c.telegramUserId != null) {
      const byId = await this.prisma.contact.findFirst({
        where: { ownerUserId: userId, telegramUserId: c.telegramUserId },
      });
      if (byId) return byId;
    }
    if (c.phone) {
      const byPhone = await this.prisma.contact.findFirst({
        where: { ownerUserId: userId, normalizedPhone: c.phone },
      });
      if (byPhone) return byPhone;
    }
    if (c.username) {
      const byUsername = await this.prisma.contact.findFirst({
        where: { ownerUserId: userId, username: c.username },
      });
      if (byUsername) return byUsername;
    }
    return null;
  }

  // ── Queries ───────────────────────────────────────────────────────

  async count(userId: number): Promise<number> {
    return this.prisma.contact.count({ where: { ownerUserId: userId } });
  }

  async countWithBirthday(userId: number): Promise<number> {
    return this.prisma.contact.count({
      where: { ownerUserId: userId, birthDate: { not: null } },
    });
  }

  async getById(userId: number, contactId: number): Promise<Contact | null> {
    return this.prisma.contact.findFirst({
      where: { id: contactId, ownerUserId: userId },
    });
  }

  async search(userId: number, query: string, limit = 8): Promise<Contact[]> {
    const q = query.trim();
    return this.prisma.contact.findMany({
      where: {
        ownerUserId: userId,
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      },
      orderBy: [{ rankingScore: 'desc' }, { fullName: 'asc' }],
      take: limit,
    });
  }

  async listTop(userId: number, limit = 10, offset = 0): Promise<Contact[]> {
    return this.prisma.contact.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ rankingScore: 'desc' }, { fullName: 'asc' }],
      take: limit,
      skip: offset,
    });
  }

  /** Contacts whose birthday falls within `withinDays`, sorted by proximity. */
  async listUpcoming(userId: number, withinDays: number, tz: string): Promise<UpcomingContact[]> {
    const contacts = await this.prisma.contact.findMany({
      where: { ownerUserId: userId, birthDate: { not: null } },
    });
    const result: UpcomingContact[] = [];
    for (const contact of contacts) {
      const info = nextBirthdayInfo(contact.birthDate!, tz);
      if (info.daysUntil <= withinDays) {
        result.push({ contact, daysUntil: info.daysUntil, turning: info.turning });
      }
    }
    result.sort((a, b) => a.daysUntil - b.daysUntil);
    return result;
  }

  // ── Mutations ─────────────────────────────────────────────────────

  async create(
    userId: number,
    data: { fullName: string; username?: string; phone?: string },
  ): Promise<Contact> {
    return this.prisma.contact.create({
      data: {
        ownerUserId: userId,
        fullName: data.fullName,
        username: data.username ?? null,
        phone: data.phone ?? null,
        normalizedPhone: data.phone ? this.mtproto.normalizePhone(data.phone) : null,
      },
    });
  }

  async setBirthday(userId: number, contactId: number, birthDate: Date): Promise<void> {
    await this.prisma.contact.updateMany({
      where: { id: contactId, ownerUserId: userId },
      data: { birthDate },
    });
  }

  async setBirthTime(userId: number, contactId: number, time: string): Promise<void> {
    await this.prisma.contact.updateMany({
      where: { id: contactId, ownerUserId: userId },
      data: { birthTime: time },
    });
  }

  async delete(userId: number, contactId: number): Promise<void> {
    await this.prisma.contact.deleteMany({
      where: { id: contactId, ownerUserId: userId },
    });
  }
}

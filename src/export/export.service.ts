import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';
import { MtprotoService } from '../mtproto/mtproto.service';
import { QueueService } from '../queue/queue.service';
import { UsersService } from '../users/users.service';
import { NotifierService } from '../notifier/notifier.service';
import { formatBirthDate } from '../common/date.util';

export type ExportType = 'contacts' | 'calendar' | 'drafts' | 'history' | 'full';
export type ExportFormat = 'json' | 'csv' | 'ndjson';

const BACKUP_VERSION = 1;
const bigintReplacer = (_key: string, value: any) =>
  typeof value === 'bigint' ? value.toString() : value;

export interface ExportFile {
  filename: string;
  buffer: Buffer;
}

export interface ImportResult {
  contacts: number;
  drafts: number;
  skipped: number;
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly exportDir = join(process.cwd(), 'exports');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mtproto: MtprotoService,
    private readonly queue: QueueService,
    private readonly users: UsersService,
    private readonly notifier: NotifierService,
  ) {}

  // ── Export ────────────────────────────────────────────────────────

  private async collect(userId: number, type: ExportType): Promise<any> {
    const contacts = () =>
      this.prisma.contact.findMany({ where: { ownerUserId: userId }, orderBy: { fullName: 'asc' } });
    const drafts = () =>
      this.prisma.messageDraft.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const history = () =>
      this.prisma.messageLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });

    switch (type) {
      case 'contacts':
        return contacts();
      case 'calendar': {
        const rows = await this.prisma.contact.findMany({
          where: { ownerUserId: userId, birthDate: { not: null } },
          orderBy: { fullName: 'asc' },
        });
        return rows.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          username: c.username,
          birthDate: c.birthDate ? formatBirthDate(c.birthDate) : null,
          birthTime: c.birthTime,
        }));
      }
      case 'drafts':
        return drafts();
      case 'history':
        return history();
      case 'full':
        return {
          version: BACKUP_VERSION,
          created_at: new Date().toISOString(),
          contacts: await contacts(),
          calendar: await this.collect(userId, 'calendar'),
          drafts: await drafts(),
          history: await history(),
        };
    }
  }

  async export(userId: number, type: ExportType, format: ExportFormat = 'json'): Promise<ExportFile> {
    const data = await this.collect(userId, type);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    let buffer: Buffer;
    let ext: string;

    if (format === 'json' || type === 'full') {
      buffer = Buffer.from(JSON.stringify(data, bigintReplacer, 2), 'utf8');
      ext = 'json';
    } else if (format === 'ndjson') {
      const rows = Array.isArray(data) ? data : [data];
      buffer = Buffer.from(rows.map((r) => JSON.stringify(r, bigintReplacer)).join('\n'), 'utf8');
      ext = 'ndjson';
    } else {
      buffer = Buffer.from(this.toCsv(Array.isArray(data) ? data : [data]), 'utf8');
      ext = 'csv';
    }

    const filename = `${type}-${ts}.${ext}`;
    await this.persistAndLog(userId, type, filename, buffer);
    return { filename, buffer };
  }

  private toCsv(rows: any[]): string {
    if (rows.length === 0) return '';
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const escapeCell = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'bigint' ? v.toString() : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const row of rows) lines.push(headers.map((h) => escapeCell(row[h])).join(','));
    return lines.join('\n');
  }

  private async persistAndLog(userId: number, type: ExportType, filename: string, buffer: Buffer) {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
      await fs.writeFile(join(this.exportDir, filename), buffer);
    } catch (e: any) {
      this.logger.warn(`Could not write export to disk: ${e?.message}`);
    }
    await this.prisma.exportLog.create({ data: { userId, exportType: type, fileName: filename } });
  }

  // ── Import ────────────────────────────────────────────────────────

  async importBackup(userId: number, raw: string): Promise<ImportResult> {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Файл не является корректным JSON.');
    }
    if (parsed.version !== BACKUP_VERSION) {
      throw new Error(`Неподдерживаемая версия бэкапа: ${parsed.version}`);
    }

    let contacts = 0;
    let drafts = 0;
    let skipped = 0;

    for (const c of parsed.contacts ?? []) {
      const where: any = { ownerUserId: userId };
      if (c.telegramUserId) where.telegramUserId = BigInt(c.telegramUserId);
      else if (c.normalizedPhone) where.normalizedPhone = c.normalizedPhone;
      else if (c.username) where.username = c.username;
      else where.fullName = c.fullName;

      const existing = await this.prisma.contact.findFirst({ where });
      if (existing) {
        skipped++;
        continue;
      }
      await this.prisma.contact.create({
        data: {
          ownerUserId: userId,
          telegramUserId: c.telegramUserId ? BigInt(c.telegramUserId) : null,
          fullName: c.fullName ?? 'Без имени',
          username: c.username ?? null,
          phone: c.phone ?? null,
          normalizedPhone: c.normalizedPhone ?? null,
          birthDate: c.birthDate ? new Date(c.birthDate) : null,
          birthTime: c.birthTime ?? '00:00',
          rankingScore: c.rankingScore ?? 0,
        },
      });
      contacts++;
    }
    this.logger.log(`Import for user ${userId}: ${contacts} contacts, ${skipped} skipped`);
    return { contacts, drafts, skipped };
  }

  // ── Soft delete ───────────────────────────────────────────────────

  /** Backup → deliver archive → revoke session → pause queue → mark inactive. */
  async deleteAccount(userId: number, telegramId: bigint): Promise<void> {
    const { filename, buffer } = await this.export(userId, 'full', 'json');
    await this.notifier.sendDocument(
      telegramId,
      buffer,
      filename,
      '🗄 Резервная копия ваших данных перед удалением. Сохраните её — она понадобится для восстановления.',
    );
    await this.mtproto.logout(userId);
    await this.queue.pauseUser(userId);
    await this.users.softDelete(userId);
    this.logger.log(`Soft-deleted user ${userId}`);
  }
}

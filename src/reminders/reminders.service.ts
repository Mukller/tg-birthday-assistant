import { Injectable } from '@nestjs/common';
import { ReminderRule } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const DEFAULT_REMINDER_DAYS = [7, 3, 1, 0];

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultRules(userId: number): Promise<void> {
    const count = await this.prisma.reminderRule.count({ where: { userId } });
    if (count > 0) return;
    await this.prisma.reminderRule.createMany({
      data: DEFAULT_REMINDER_DAYS.map((daysBefore) => ({ userId, daysBefore })),
    });
  }

  async listRules(userId: number): Promise<ReminderRule[]> {
    return this.prisma.reminderRule.findMany({
      where: { userId },
      orderBy: { daysBefore: 'desc' },
    });
  }

  async listActiveDaysBefore(userId: number): Promise<number[]> {
    const rules = await this.prisma.reminderRule.findMany({
      where: { userId, isActive: true },
    });
    return rules.map((r) => r.daysBefore);
  }

  async addRule(userId: number, daysBefore: number): Promise<void> {
    const existing = await this.prisma.reminderRule.findFirst({
      where: { userId, daysBefore },
    });
    if (existing) {
      await this.prisma.reminderRule.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
      return;
    }
    await this.prisma.reminderRule.create({ data: { userId, daysBefore } });
  }

  async removeRule(userId: number, ruleId: number): Promise<void> {
    await this.prisma.reminderRule.deleteMany({ where: { id: ruleId, userId } });
  }

  async toggleRule(userId: number, ruleId: number): Promise<void> {
    const rule = await this.prisma.reminderRule.findFirst({
      where: { id: ruleId, userId },
    });
    if (!rule) return;
    await this.prisma.reminderRule.update({
      where: { id: rule.id },
      data: { isActive: !rule.isActive },
    });
  }

  async recordReminderJob(
    userId: number,
    contactId: number,
    reminderRuleId: number | null,
    remindAt: Date,
  ): Promise<boolean> {
    // idempotency: one reminder per (contact, rule, calendar day)
    const dayStart = new Date(remindAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const existing = await this.prisma.reminderJob.findFirst({
      where: {
        userId,
        contactId,
        reminderRuleId,
        remindAt: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existing) return false;
    await this.prisma.reminderJob.create({
      data: { userId, contactId, reminderRuleId, remindAt, status: 'sent' },
    });
    return true;
  }
}

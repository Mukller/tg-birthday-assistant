import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface TelegramFrom {
  id: number;
  username?: string;
  first_name?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getByTelegramId(telegramId: number | bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  }

  /** Create the user on first contact, or refresh their profile fields. */
  async getOrCreate(from: TelegramFrom): Promise<User> {
    const telegramId = BigInt(from.id);
    return this.prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        timezone: this.config.get<string>('defaultTimezone')!,
        onboardingState: { create: { currentStep: 'WELCOME', completed: false } },
      },
      update: {
        username: from.username ?? undefined,
        firstName: from.first_name ?? undefined,
        // a returning user that was soft-deleted is implicitly reactivated on /start
      },
    });
  }

  async setTimezone(userId: number, timezone: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { timezone } });
  }

  async softDelete(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async restore(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true, deletedAt: null },
    });
  }

  isAdmin(telegramId: number | bigint): boolean {
    const adminId = this.config.get<bigint | null>('adminTelegramId');
    return adminId != null && BigInt(telegramId) === adminId;
  }
}

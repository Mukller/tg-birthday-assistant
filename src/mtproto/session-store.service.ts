import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';

@Injectable()
export class SessionStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Encrypt and persist a session string, deactivating any previous one. */
  async save(userId: number, phoneNumber: string, sessionString: string): Promise<void> {
    const enc = this.crypto.encrypt(sessionString);
    await this.prisma.$transaction([
      this.prisma.telegramSession.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false, status: 'replaced' },
      }),
      this.prisma.telegramSession.create({
        data: {
          userId,
          phoneNumber,
          encryptedSession: enc.encrypted,
          sessionIv: enc.iv,
          sessionAuthTag: enc.authTag,
          status: 'active',
          isActive: true,
        },
      }),
    ]);
  }

  async load(userId: number): Promise<string | null> {
    const s = await this.prisma.telegramSession.findFirst({
      where: { userId, isActive: true, status: 'active' },
      orderBy: { id: 'desc' },
    });
    if (!s) return null;
    return this.crypto.decrypt({
      encrypted: s.encryptedSession,
      iv: s.sessionIv,
      authTag: s.sessionAuthTag,
    });
  }

  async hasActive(userId: number): Promise<boolean> {
    const count = await this.prisma.telegramSession.count({
      where: { userId, isActive: true, status: 'active' },
    });
    return count > 0;
  }

  async markInvalid(userId: number, reason: string): Promise<void> {
    await this.prisma.telegramSession.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false, status: `invalid:${reason}`.slice(0, 60) },
    });
  }

  async getPhone(userId: number): Promise<string | null> {
    const s = await this.prisma.telegramSession.findFirst({
      where: { userId },
      orderBy: { id: 'desc' },
    });
    return s?.phoneNumber ?? null;
  }
}

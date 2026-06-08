import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient, Api } from 'telegram';
import bigInt from 'big-integer';
import { StringSession } from 'telegram/sessions';
import { computeCheck } from 'telegram/Password';
import { FloodWaitError } from 'telegram/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { SessionStoreService } from './session-store.service';
import {
  FloodWaitSignal,
  PasswordNeededSignal,
  SessionInvalidSignal,
  SESSION_INVALID_CODES,
} from './errors';

export interface ContactCandidate {
  telegramUserId: bigint;
  fullName: string;
  username: string | null;
  phone: string | null;
  rankingScore: number;
}

export interface SendResult {
  telegramMessageId: bigint | null;
}

export interface StarGiftInfo {
  id: string; // long as string
  stars: number;
  limited: boolean;
  birthday: boolean;
}

/**
 * Manages GramJS clients: login flow, persistent sessions, contact import,
 * and message sending. Live clients are cached per user so the in-memory
 * entity cache (needed to resolve peers by id) survives between sends.
 */
@Injectable()
export class MtprotoService {
  private readonly logger = new Logger(MtprotoService.name);
  private readonly apiId: number;
  private readonly apiHash: string;

  private readonly pendingLogins = new Map<number, TelegramClient>();
  private readonly activeClients = new Map<number, TelegramClient>();
  private readonly warmed = new Set<number>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionStoreService,
  ) {
    this.apiId = this.config.get<number>('telegram.apiId')!;
    this.apiHash = this.config.get<string>('telegram.apiHash')!;
  }

  get credentialsConfigured(): boolean {
    return this.apiId > 0 && this.apiHash.length > 0;
  }

  private assertCredentials() {
    if (!this.credentialsConfigured) {
      throw new Error(
        'MTProto is not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env (from my.telegram.org).',
      );
    }
  }

  private buildClient(sessionString = ''): TelegramClient {
    return new TelegramClient(
      new StringSession(sessionString),
      this.apiId,
      this.apiHash,
      { connectionRetries: 5, autoReconnect: true, useWSS: false },
    );
  }

  // ── Login flow ────────────────────────────────────────────────────

  /** Step 1: send the login code to the user's phone. Returns phoneCodeHash. */
  async startLogin(userId: number, phoneNumber: string): Promise<string> {
    this.assertCredentials();
    await this.endLogin(userId);
    const client = this.buildClient();
    await client.connect();
    const { phoneCodeHash } = await client.sendCode(
      { apiId: this.apiId, apiHash: this.apiHash },
      phoneNumber,
    );
    this.pendingLogins.set(userId, client);
    await this.prisma.authAttempt.create({
      data: {
        userId,
        phoneNumber,
        phoneCodeHash,
        status: 'code_sent',
        expiresAt: new Date(Date.now() + 1000 * 60 * 15),
      },
    });
    return phoneCodeHash;
  }

  /** Step 2: submit the code. Throws PasswordNeededSignal if 2FA is required. */
  async submitCode(
    userId: number,
    phoneNumber: string,
    phoneCodeHash: string,
    code: string,
  ): Promise<void> {
    const client = this.pendingLogins.get(userId);
    if (!client) throw new Error('Login session expired. Start over.');
    try {
      await client.invoke(
        new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode: code }),
      );
    } catch (e: any) {
      if (e?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        throw new PasswordNeededSignal();
      }
      throw e;
    }
    await this.finishLogin(userId, phoneNumber, client);
  }

  /** Step 3 (optional): submit the 2FA password. */
  async submitPassword(userId: number, phoneNumber: string, password: string): Promise<void> {
    const client = this.pendingLogins.get(userId);
    if (!client) throw new Error('Login session expired. Start over.');
    const pwd = await client.invoke(new Api.account.GetPassword());
    const check = await computeCheck(pwd, password);
    await client.invoke(new Api.auth.CheckPassword({ password: check }));
    await this.finishLogin(userId, phoneNumber, client);
  }

  private async finishLogin(userId: number, phoneNumber: string, client: TelegramClient) {
    const sessionString = client.session.save() as unknown as string;
    await this.sessions.save(userId, phoneNumber, sessionString);
    await this.prisma.authAttempt.updateMany({
      where: { userId, status: { in: ['code_sent', 'pending'] } },
      data: { status: 'completed' },
    });
    this.pendingLogins.delete(userId);
    this.activeClients.set(userId, client);
    this.logger.log(`MTProto login completed for user ${userId}`);
  }

  private async endLogin(userId: number) {
    const c = this.pendingLogins.get(userId);
    if (c) {
      try {
        await c.disconnect();
      } catch {
        /* ignore */
      }
      this.pendingLogins.delete(userId);
    }
  }

  // ── Client lifecycle ──────────────────────────────────────────────

  private async getClient(userId: number): Promise<TelegramClient> {
    this.assertCredentials();
    const existing = this.activeClients.get(userId);
    if (existing && existing.connected) return existing;

    const sessionString = await this.sessions.load(userId);
    if (!sessionString) {
      throw new SessionInvalidSignal('NO_SESSION');
    }
    const client = this.buildClient(sessionString);
    await client.connect();
    const authorized = await client.checkAuthorization();
    if (!authorized) {
      await this.sessions.markInvalid(userId, 'UNAUTHORIZED');
      throw new SessionInvalidSignal('UNAUTHORIZED');
    }
    this.activeClients.set(userId, client);
    return client;
  }

  async isConnected(userId: number): Promise<boolean> {
    try {
      const c = await this.getClient(userId);
      return c.connected ?? false;
    } catch {
      return false;
    }
  }

  async disconnect(userId: number): Promise<void> {
    const c = this.activeClients.get(userId);
    if (c) {
      try {
        await c.disconnect();
      } catch {
        /* ignore */
      }
      this.activeClients.delete(userId);
      this.warmed.delete(userId);
    }
  }

  /** Revoke the current session on Telegram's side and locally. */
  async logout(userId: number): Promise<void> {
    try {
      const c = await this.getClient(userId);
      await c.invoke(new Api.auth.LogOut());
    } catch {
      /* best effort */
    }
    await this.disconnect(userId);
    await this.sessions.markInvalid(userId, 'LOGGED_OUT');
  }

  // ── Contact import ────────────────────────────────────────────────

  async importContacts(userId: number): Promise<ContactCandidate[]> {
    const client = await this.getClient(userId);
    const candidates = new Map<string, ContactCandidate>();

    const me = await client.getMe();
    const myId = (me as any)?.id?.toString();

    const dialogs = await client.getDialogs({ limit: 500 });
    let index = 0;
    const total = dialogs.length;
    for (const dialog of dialogs) {
      const entity: any = dialog.entity;
      index++;
      if (!entity || entity.className !== 'User') continue; // excludes channels/groups
      if (entity.bot || entity.deleted || entity.support) continue; // excludes bots/deleted
      if (myId && entity.id?.toString() === myId) continue; // excludes self

      const tgId = BigInt(entity.id.toString());
      const fullName =
        [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim() ||
        entity.username ||
        `id${tgId}`;
      candidates.set(tgId.toString(), {
        telegramUserId: tgId,
        fullName,
        username: entity.username ?? null,
        phone: entity.phone ? this.normalizePhone(entity.phone) : null,
        rankingScore: Math.max(1, total - index + 1), // recency-weighted
      });
    }

    // Address-book contacts (may include people without a recent dialog)
    try {
      const result: any = await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) as any }));
      for (const u of result.users ?? []) {
        if (u.className !== 'User' || u.bot || u.deleted) continue;
        if (myId && u.id?.toString() === myId) continue;
        const tgId = BigInt(u.id.toString());
        const key = tgId.toString();
        if (candidates.has(key)) {
          if (u.phone && !candidates.get(key)!.phone) {
            candidates.get(key)!.phone = this.normalizePhone(u.phone);
          }
          continue;
        }
        const fullName =
          [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
          u.username ||
          `id${tgId}`;
        candidates.set(key, {
          telegramUserId: tgId,
          fullName,
          username: u.username ?? null,
          phone: u.phone ? this.normalizePhone(u.phone) : null,
          rankingScore: 1,
        });
      }
    } catch (e: any) {
      this.logger.warn(`GetContacts failed (non-fatal): ${e?.message}`);
    }

    return [...candidates.values()];
  }

  // ── Sending ───────────────────────────────────────────────────────

  async sendMessage(
    userId: number,
    peer: { telegramUserId: bigint | null; username: string | null; phone: string | null },
    text: string,
  ): Promise<SendResult> {
    try {
      const client = await this.getClient(userId);
      const entity = await this.resolvePeer(userId, client, peer);
      const result: any = await client.sendMessage(entity, { message: text });
      const messageId = result?.id != null ? BigInt(result.id) : null;
      return { telegramMessageId: messageId };
    } catch (e: any) {
      throw this.translateError(userId, e);
    }
  }

  /** Read a contact's birthday from their full profile (if set & visible). */
  async getBirthday(
    userId: number,
    peer: { telegramUserId: bigint | null; username: string | null; phone: string | null },
  ): Promise<{ day: number; month: number; year: number | null } | null> {
    try {
      const client = await this.getClient(userId);
      const entity = await this.resolvePeer(userId, client, peer);
      const full: any = await client.invoke(new Api.users.GetFullUser({ id: entity }));
      const b = full?.fullUser?.birthday;
      if (!b || !b.day || !b.month) return null;
      return { day: b.day, month: b.month, year: b.year ?? null };
    } catch (e: any) {
      throw this.translateError(userId, e);
    }
  }

  // ── Gifts (Telegram Stars) ────────────────────────────────────────

  async getStarBalance(userId: number): Promise<number> {
    const client = await this.getClient(userId);
    const status: any = await client.invoke(new Api.payments.GetStarsStatus({ peer: 'me' }));
    const bal = status?.balance;
    if (bal == null) return 0;
    return typeof bal === 'object' ? Number(bal.amount ?? bal.stars ?? 0) : Number(bal);
  }

  async listGifts(userId: number): Promise<StarGiftInfo[]> {
    const client = await this.getClient(userId);
    const res: any = await client.invoke(new Api.payments.GetStarGifts({ hash: 0 }));
    const gifts = res?.gifts ?? [];
    return gifts
      .filter((g: any) => g.className === 'StarGift' && !g.soldOut)
      .map((g: any) => ({
        id: g.id.toString(),
        stars: Number(g.stars),
        limited: !!g.limited,
        birthday: !!g.birthday,
      }))
      .sort((a: StarGiftInfo, b: StarGiftInfo) => a.stars - b.stars);
  }

  /** Send a star gift (paid from the user's Stars balance) with a message. */
  async sendGift(
    userId: number,
    peer: { telegramUserId: bigint | null; username: string | null; phone: string | null },
    giftId: string,
    message?: string,
  ): Promise<void> {
    try {
      const client = await this.getClient(userId);
      const resolved = await this.resolvePeer(userId, client, peer);
      const inputPeer = await client.getInputEntity(resolved);
      const invoice = new Api.InputInvoiceStarGift({
        peer: inputPeer,
        giftId: bigInt(giftId) as any,
        message: message
          ? new Api.TextWithEntities({ text: message.slice(0, 255), entities: [] })
          : undefined,
      });
      const form: any = await client.invoke(new Api.payments.GetPaymentForm({ invoice }));
      await client.invoke(new Api.payments.SendStarsForm({ formId: form.formId, invoice }));
    } catch (e: any) {
      throw this.translateError(userId, e);
    }
  }

  private async resolvePeer(
    userId: number,
    client: TelegramClient,
    peer: { telegramUserId: bigint | null; username: string | null; phone: string | null },
  ): Promise<any> {
    if (peer.username) {
      return client.getEntity(peer.username.startsWith('@') ? peer.username : `@${peer.username}`);
    }
    if (peer.telegramUserId != null) {
      if (!this.warmed.has(userId)) {
        // warm the entity cache so id-only peers resolve
        await client.getDialogs({ limit: 500 });
        this.warmed.add(userId);
      }
      return client.getInputEntity(Number(peer.telegramUserId));
    }
    if (peer.phone) {
      const imported: any = await client.invoke(
        new Api.contacts.ImportContacts({
          contacts: [
            new Api.InputPhoneContact({
              clientId: BigInt(Date.now()) as any,
              phone: peer.phone,
              firstName: 'Contact',
              lastName: '',
            }),
          ],
        }),
      );
      const u = imported.users?.[0];
      if (u) return u;
    }
    throw new Error('Unable to resolve contact peer (no username/id/phone).');
  }

  private translateError(userId: number, e: any): Error {
    if (e instanceof FloodWaitSignal || e instanceof SessionInvalidSignal) return e;
    if (e instanceof FloodWaitError) {
      return new FloodWaitSignal(e.seconds);
    }
    const msg: string = e?.errorMessage ?? e?.message ?? '';
    const floodMatch = /FLOOD_WAIT_(\d+)/.exec(msg);
    if (floodMatch) return new FloodWaitSignal(parseInt(floodMatch[1], 10));
    if (SESSION_INVALID_CODES.some((c) => msg.includes(c))) {
      void this.sessions.markInvalid(userId, msg.slice(0, 40));
      void this.disconnect(userId);
      return new SessionInvalidSignal(msg);
    }
    return e instanceof Error ? e : new Error(String(e));
  }

  // ── Helpers ───────────────────────────────────────────────────────

  normalizePhone(phone: string): string {
    const digits = phone.replace(/[^\d]/g, '');
    return digits ? `+${digits}` : phone;
  }
}

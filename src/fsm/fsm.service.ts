import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.constants';

export interface FsmState<T = Record<string, any>> {
  step: string;
  data: T;
}

/**
 * Redis-backed FSM. State key format: user:{telegramId}:state
 * TTL-based expiration so abandoned wizards clean themselves up.
 */
@Injectable()
export class FsmService {
  private static readonly DEFAULT_TTL = 60 * 30; // 30 minutes

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(telegramId: number | bigint): string {
    return `user:${telegramId}:state`;
  }

  async setState(
    telegramId: number | bigint,
    step: string,
    data: Record<string, any> = {},
    ttl = FsmService.DEFAULT_TTL,
  ): Promise<void> {
    await this.redis.set(
      this.key(telegramId),
      JSON.stringify({ step, data } satisfies FsmState),
      'EX',
      ttl,
    );
  }

  async getState<T = Record<string, any>>(
    telegramId: number | bigint,
  ): Promise<FsmState<T> | null> {
    const raw = await this.redis.get(this.key(telegramId));
    return raw ? (JSON.parse(raw) as FsmState<T>) : null;
  }

  async patchData(
    telegramId: number | bigint,
    patch: Record<string, any>,
  ): Promise<void> {
    const current = (await this.getState(telegramId)) ?? { step: 'unknown', data: {} };
    await this.setState(telegramId, current.step, { ...current.data, ...patch });
  }

  async clear(telegramId: number | bigint): Promise<void> {
    await this.redis.del(this.key(telegramId));
  }
}

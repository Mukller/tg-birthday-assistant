export interface AppConfig {
  nodeEnv: string;
  port: number;
  botToken: string;
  telegram: {
    apiId: number;
    apiHash: string;
  };
  sessionEncryptionKey: string;
  adminTelegramId: bigint | null;
  databaseUrl: string;
  redisUrl: string;
  send: {
    delayMinSec: number;
    delayMaxSec: number;
    rateLimitPerHour: number;
  };
  defaultTimezone: string;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  botToken: process.env.BOT_TOKEN ?? '',
  telegram: {
    apiId: parseInt(process.env.TELEGRAM_API_ID ?? '0', 10),
    apiHash: process.env.TELEGRAM_API_HASH ?? '',
  },
  sessionEncryptionKey: process.env.SESSION_ENCRYPTION_KEY ?? '',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID
    ? BigInt(process.env.ADMIN_TELEGRAM_ID)
    : null,
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  send: {
    delayMinSec: parseInt(process.env.SEND_DELAY_MIN_SEC ?? '5', 10),
    delayMaxSec: parseInt(process.env.SEND_DELAY_MAX_SEC ?? '20', 10),
    rateLimitPerHour: parseInt(process.env.RATE_LIMIT_PER_HOUR ?? '25', 10),
  },
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Warsaw',
});

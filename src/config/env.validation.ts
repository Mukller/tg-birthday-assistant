import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, validateSync } from 'class-validator';

/**
 * Light validation: the bot cannot start without a token, an encryption key,
 * and database/redis URLs. MTProto credentials are validated lazily (only the
 * userbot half needs them) so the bot UI can run before they are filled in.
 */
class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  BOT_TOKEN: string;

  @IsString()
  @IsNotEmpty()
  SESSION_ENCRYPTION_KEY: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsOptional()
  @IsString()
  TELEGRAM_API_ID?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_API_HASH?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      'Invalid environment configuration:\n' +
        errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n'),
    );
  }

  const key = config.SESSION_ENCRYPTION_KEY as string;
  if (Buffer.from(key, 'hex').length !== 32) {
    throw new Error(
      'SESSION_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return config;
}

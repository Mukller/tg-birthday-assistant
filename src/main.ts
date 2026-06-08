import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { AppModule } from './app.module';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Launch long polling with retry-on-409. Telegram keeps a previous getUpdates
 * connection alive server-side for up to ~50s, so a quick restart can hit
 * "409 Conflict: terminated by other getUpdates request". Telegraf rejects
 * (it does not retry), which would silently kill polling — so we retry here.
 */
function launchWithRetry(bot: Telegraf, logger: Logger, attempt = 1): void {
  bot
    .launch({ dropPendingUpdates: true })
    .then(() => logger.log('Telegram bot polling stopped'))
    .catch(async (err: any) => {
      const msg = err?.message ?? String(err);
      const isConflict = /409|Conflict/i.test(msg);
      logger.error(`Telegram launch failed (attempt ${attempt}): ${msg}`);
      if (attempt < 15) {
        // 409 needs a longer wait for the stale server-side poll to expire;
        // network blips can retry faster.
        await sleep(isConflict ? 8000 : 5000);
        logger.warn(`Retrying Telegram launch (attempt ${attempt + 1})…`);
        launchWithRetry(bot, logger, attempt + 1);
      } else {
        logger.error('Giving up on Telegram polling after repeated failures. Restart the bot.');
      }
    });
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  const bot = app.get<Telegraf>(getBotToken());
  launchWithRetry(bot, logger);
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  logger.log(`🎂 Birthday Assistant is running (HTTP health on :${port}, bot via long polling)`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});

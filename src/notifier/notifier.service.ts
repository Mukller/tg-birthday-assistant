import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';

/**
 * Lets background workers (queue, scheduler) push messages to a user through
 * the bot, without depending on the bot's handler graph (avoids DI cycles).
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

  async notify(
    telegramId: number | bigint,
    text: string,
    extra?: ExtraReplyMessage,
  ): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(Number(telegramId), text, {
        parse_mode: 'HTML',
        ...extra,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to notify ${telegramId}: ${e?.message}`);
    }
  }

  async sendDocument(
    telegramId: number | bigint,
    buffer: Buffer,
    filename: string,
    caption?: string,
  ): Promise<void> {
    try {
      await this.bot.telegram.sendDocument(
        Number(telegramId),
        { source: buffer, filename } as any,
        caption ? { caption, parse_mode: 'HTML' } : undefined,
      );
    } catch (e: any) {
      this.logger.warn(`Failed to send document to ${telegramId}: ${e?.message}`);
    }
  }
}

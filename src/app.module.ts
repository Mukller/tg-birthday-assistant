import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TelegrafModule } from 'nestjs-telegraf';

import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';

import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { FsmModule } from './fsm/fsm.module';
import { UsersModule } from './users/users.module';
import { LogsModule } from './logs/logs.module';
import { NotifierModule } from './notifier/notifier.module';
import { MtprotoModule } from './mtproto/mtproto.module';
import { QueueModule } from './queue/queue.module';
import { ContactsModule } from './contacts/contacts.module';
import { RemindersModule } from './reminders/reminders.module';
import { DraftsModule } from './drafts/drafts.module';
import { SendingModule } from './sending/sending.module';
import { ExportModule } from './export/export.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { BotModule } from './bot/bot.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('botToken')!,
        // We launch the bot manually in main.ts so we can catch launch errors
        // (nestjs-telegraf's auto-launch is fire-and-forget without a .catch,
        // which silently kills polling on a transient 409).
        launchOptions: false,
      }),
    }),

    // Global infrastructure
    PrismaModule,
    RedisModule,
    CryptoModule,
    FsmModule,
    UsersModule,
    LogsModule,
    NotifierModule,
    MtprotoModule,
    QueueModule,

    // Features
    ContactsModule,
    RemindersModule,
    DraftsModule,
    SendingModule,
    ExportModule,
    SchedulerModule,
    BotModule,
    HealthModule,
  ],
})
export class AppModule {}

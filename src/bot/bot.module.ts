import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { RemindersModule } from '../reminders/reminders.module';
import { DraftsModule } from '../drafts/drafts.module';
import { SendingModule } from '../sending/sending.module';
import { ExportModule } from '../export/export.module';
import { BotUpdate } from './bot.update';

@Module({
  imports: [ContactsModule, RemindersModule, DraftsModule, SendingModule, ExportModule],
  providers: [BotUpdate],
})
export class BotModule {}

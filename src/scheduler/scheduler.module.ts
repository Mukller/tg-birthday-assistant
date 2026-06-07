import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { RemindersModule } from '../reminders/reminders.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ContactsModule, RemindersModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

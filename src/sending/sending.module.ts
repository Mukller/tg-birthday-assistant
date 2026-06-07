import { Module } from '@nestjs/common';
import { SendingService } from './sending.service';

@Module({
  providers: [SendingService],
  exports: [SendingService],
})
export class SendingModule {}

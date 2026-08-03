import { Global, Module } from '@nestjs/common';
import { FsmService } from './fsm.service';

@Global()
@Module({
  providers: [FsmService],
  exports: [FsmService],
})
export class FsmModule {}

import { Global, Module } from '@nestjs/common';
import { MtprotoService } from './mtproto.service';
import { SessionStoreService } from './session-store.service';

@Global()
@Module({
  providers: [MtprotoService, SessionStoreService],
  exports: [MtprotoService, SessionStoreService],
})
export class MtprotoModule {}

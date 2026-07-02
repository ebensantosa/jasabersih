import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module';
import { CallController } from './call.controller';

@Module({
  imports: [ChatModule],
  controllers: [CallController],
})
export class CallModule {}

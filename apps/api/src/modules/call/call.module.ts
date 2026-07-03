import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module';
import { JobsModule } from '../jobs/jobs.module';
import { CallController } from './call.controller';

@Module({
  imports: [ChatModule, JobsModule],
  controllers: [CallController],
})
export class CallModule {}

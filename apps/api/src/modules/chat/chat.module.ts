import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';

import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatRetentionService } from './chat-retention.service';

@Module({
  imports: [AuthModule, JwtModule.register({})],
  controllers: [ChatController],
  providers: [ChatGateway, ChatRetentionService],
})
export class ChatModule {}

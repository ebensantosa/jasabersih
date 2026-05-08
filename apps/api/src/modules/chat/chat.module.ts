import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';

import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [AuthModule, JwtModule.register({})],
  controllers: [ChatController],
  providers: [ChatGateway],
})
export class ChatModule {}

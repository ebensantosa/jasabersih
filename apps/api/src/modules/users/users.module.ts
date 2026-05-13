import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { PresenceController } from './presence.controller';

@Module({
  controllers: [PresenceController],
  providers: [PrismaService],
})
export class UsersModule {}

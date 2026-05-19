import { Global, Module } from '@nestjs/common';

import { AbuseLimitsService } from './abuse-limits.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, AbuseLimitsService],
  exports: [PrismaService, AbuseLimitsService],
})
export class PrismaModule {}

import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { CustomerNotesController } from './customer-notes.controller';

@Module({
  controllers: [CustomerNotesController],
  providers: [PrismaService],
})
export class CustomerNotesModule {}

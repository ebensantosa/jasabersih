import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { CustomerWalletController } from './customer-wallet.controller';

@Module({
  controllers: [CustomerWalletController],
  providers: [PrismaService],
})
export class CustomerWalletModule {}

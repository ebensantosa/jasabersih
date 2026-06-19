import { Module } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { PaymentsModule } from '../payments/payments.module';
import { CustomerBankAccountsController } from './customer-bank-accounts.controller';
import { CustomerWalletController } from './customer-wallet.controller';

@Module({
  imports: [PaymentsModule],
  controllers: [CustomerWalletController, CustomerBankAccountsController],
  providers: [PrismaService],
})
export class CustomerWalletModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CleanerKycController } from './cleaner-kyc.controller';
import { CleanerWalletController } from './cleaner-wallet.controller';

@Module({
  imports: [AuthModule],
  controllers: [CleanerKycController, CleanerWalletController],
})
export class CleanerModule {}

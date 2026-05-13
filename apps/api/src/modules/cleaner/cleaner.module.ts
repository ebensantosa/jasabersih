import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { CleanerJobsController } from './cleaner-jobs.controller';
import { CleanerKycController } from './cleaner-kyc.controller';
import { CleanerProfileController } from './cleaner-profile.controller';
import { CleanerPublicController } from './cleaner-public.controller';
import { CleanerWalletController } from './cleaner-wallet.controller';
import { WalletClearService } from './wallet-clear.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [CleanerKycController, CleanerWalletController, CleanerProfileController, CleanerPublicController, CleanerJobsController],
  providers: [WalletClearService],
})
export class CleanerModule {}

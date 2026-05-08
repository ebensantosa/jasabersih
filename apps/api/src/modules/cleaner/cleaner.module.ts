import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CleanerJobsController } from './cleaner-jobs.controller';
import { CleanerKycController } from './cleaner-kyc.controller';
import { CleanerProfileController } from './cleaner-profile.controller';
import { CleanerPublicController } from './cleaner-public.controller';
import { CleanerWalletController } from './cleaner-wallet.controller';

@Module({
  imports: [AuthModule],
  controllers: [CleanerKycController, CleanerWalletController, CleanerProfileController, CleanerPublicController, CleanerJobsController],
})
export class CleanerModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReferralModule } from '../referral/referral.module';
import { StorageModule } from '../storage/storage.module';
import { CleanerBankAccountsController } from './cleaner-bank-accounts.controller';
import { CleanerJobsController } from './cleaner-jobs.controller';
import { CleanerKycController } from './cleaner-kyc.controller';
import { CleanerProfileController } from './cleaner-profile.controller';
import { CleanerPublicController } from './cleaner-public.controller';
import { CleanerWalletController } from './cleaner-wallet.controller';
import { CleanerInactivityService } from './cleaner-inactivity.service';
import { CleanerScheduleController } from './cleaner-schedule.controller';
import { WalletClearService } from './wallet-clear.service';
import { WithdrawalSyncService } from './withdrawal-sync.service';

@Module({
  imports: [AuthModule, StorageModule, NotificationsModule, PaymentsModule, ReferralModule],
  controllers: [CleanerKycController, CleanerWalletController, CleanerProfileController, CleanerPublicController, CleanerJobsController, CleanerScheduleController, CleanerBankAccountsController],
  providers: [WalletClearService, CleanerInactivityService, WithdrawalSyncService],
})
export class CleanerModule {}

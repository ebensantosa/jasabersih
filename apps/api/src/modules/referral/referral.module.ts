import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReferralController } from './referral.controller';
import { ReferralRedirectController } from './referral-redirect.controller';
import { ReferralPayoutService } from './referral-payout.service';

@Module({
  imports: [AuthModule],
  controllers: [ReferralController, ReferralRedirectController],
  providers: [ReferralPayoutService],
  exports: [ReferralPayoutService],
})
export class ReferralModule {}

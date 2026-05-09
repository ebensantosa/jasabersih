import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReferralController } from './referral.controller';
import { ReferralRedirectController } from './referral-redirect.controller';

@Module({
  imports: [AuthModule],
  controllers: [ReferralController, ReferralRedirectController],
})
export class ReferralModule {}

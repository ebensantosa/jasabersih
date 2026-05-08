import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReferralController } from './referral.controller';

@Module({
  imports: [AuthModule],
  controllers: [ReferralController],
})
export class ReferralModule {}

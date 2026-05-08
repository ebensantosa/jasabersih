import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard } from '../../common/admin-auth';
import { AuthModule } from '../auth/auth.module';
import { FraudDetectionService } from './fraud-detection.service';
import { RetentionService } from './retention.service';

import { AdminController } from './admin.controller';
import { AdminAnalyticsController } from './analytics.controller';
import { AdminBroadcastController } from './push-broadcast.controller';
import { AdminReferralsController } from './referrals-admin.controller';
import { AdminAppCmsController } from './app-cms.controller';
import { AdminBookingsController } from './bookings-admin.controller';
import { AdminChatController } from './chat-admin.controller';
import { AdminCmsController } from './cms.controller';
import { AdminDisputesController } from './disputes-admin.controller';
import { AdminFraudController } from './fraud-admin.controller';
import { AdminKycController } from './kyc.controller';
import { AdminManagementController } from './admin-management.controller';
import { AdminUsersController } from './users-admin.controller';
import { AdminWithdrawalsController } from './withdrawals-admin.controller';
import { SystemConfigController } from './system-config.controller';

@Module({
  imports: [AuthModule, JwtModule.register({}), ScheduleModule.forRoot()],
  controllers: [
    AdminController,
    AdminKycController,
    AdminUsersController,
    AdminBookingsController,
    AdminWithdrawalsController,
    AdminDisputesController,
    AdminFraudController,
    AdminCmsController,
    AdminAppCmsController,
    AdminChatController,
    AdminManagementController,
    SystemConfigController,
    AdminAnalyticsController,
    AdminBroadcastController,
    AdminReferralsController,
  ],
  providers: [AdminAuditService, AdminJwtGuard, AdminRbacGuard, FraudDetectionService, RetentionService],
})
export class AdminModule {}

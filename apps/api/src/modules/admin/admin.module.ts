import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard } from '../../common/admin-auth';
import { AuthModule } from '../auth/auth.module';

import { AdminController } from './admin.controller';
import { AdminKycController } from './kyc.controller';
import { AdminUsersController } from './users-admin.controller';

@Module({
  imports: [AuthModule, JwtModule.register({})],
  controllers: [AdminController, AdminKycController, AdminUsersController],
  providers: [AdminAuditService, AdminJwtGuard, AdminRbacGuard],
})
export class AdminModule {}

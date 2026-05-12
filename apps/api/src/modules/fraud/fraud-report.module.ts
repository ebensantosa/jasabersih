import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard } from '../../common/admin-auth';
import { AuthModule } from '../auth/auth.module';
import { FraudReportController } from './fraud-report.controller';

@Module({
  imports: [AuthModule, JwtModule.register({})],
  controllers: [FraudReportController],
  providers: [AdminAuditService, AdminJwtGuard, AdminRbacGuard],
})
export class FraudReportModule {}

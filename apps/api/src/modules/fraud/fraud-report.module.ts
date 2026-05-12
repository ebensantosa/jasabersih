import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FraudReportController } from './fraud-report.controller';

@Module({
  imports: [AuthModule],
  controllers: [FraudReportController],
})
export class FraudReportModule {}

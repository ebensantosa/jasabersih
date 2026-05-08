import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CleanerKycController } from './cleaner-kyc.controller';

@Module({
  imports: [AuthModule],
  controllers: [CleanerKycController],
})
export class CleanerModule {}

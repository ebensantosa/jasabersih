import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VouchersController } from './vouchers.controller';

@Module({
  imports: [AuthModule],
  controllers: [VouchersController],
})
export class VouchersModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { TripayService } from './tripay.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [TripayService],
  exports: [TripayService],
})
export class PaymentsModule {}

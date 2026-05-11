import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { TripayService } from './tripay.service';
import { FlipService } from './flip.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [TripayService, FlipService],
  exports: [TripayService, FlipService],
})
export class PaymentsModule {}

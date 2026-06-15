import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { TripayService } from './tripay.service';
import { FlipService } from './flip.service';
import { PaymentSyncService } from './payment-sync.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [TripayService, FlipService, PaymentSyncService],
  exports: [TripayService, FlipService],
})
export class PaymentsModule {}

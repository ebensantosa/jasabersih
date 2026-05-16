import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';

import { BookingsController } from './bookings.controller';
import { AutoCompleteService } from './auto-complete.service';
import { BookingReminderService } from './booking-reminder.service';
import { PaymentTimeoutService } from './payment-timeout.service';
import { RatingReminderService } from './rating-reminder.service';
import { SearchTimeoutService } from './search-timeout.service';
import { TravelFeeService } from './travel-fee.service';

@Module({
  imports: [AuthModule, NotificationsModule, StorageModule],
  controllers: [BookingsController],
  providers: [
    SearchTimeoutService,
    PaymentTimeoutService,
    AutoCompleteService,
    BookingReminderService,
    RatingReminderService,
    TravelFeeService,
  ],
  exports: [TravelFeeService],
})
export class BookingsModule {}

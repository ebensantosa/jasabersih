import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { BookingsController } from './bookings.controller';
import { SearchTimeoutService } from './search-timeout.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BookingsController],
  providers: [SearchTimeoutService],
})
export class BookingsModule {}

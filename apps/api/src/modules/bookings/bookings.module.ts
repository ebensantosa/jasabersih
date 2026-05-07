import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { BookingsController } from './bookings.controller';

@Module({
  imports: [AuthModule],
  controllers: [BookingsController],
})
export class BookingsModule {}

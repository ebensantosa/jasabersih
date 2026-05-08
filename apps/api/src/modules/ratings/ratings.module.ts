import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingsController } from './ratings.controller';

@Module({
  imports: [AuthModule],
  controllers: [RatingsController],
})
export class RatingsModule {}

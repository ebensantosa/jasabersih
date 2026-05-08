import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './common/health.controller';
import { PrismaModule } from './common/prisma.module';
import { RedisModule } from './common/redis.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ChatModule } from './modules/chat/chat.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    RedisModule,
    StorageModule,
    AuthModule,
    AdminModule,
    BookingsModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

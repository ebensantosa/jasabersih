import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [PushService],
  exports: [PushService],
})
export class NotificationsModule {}

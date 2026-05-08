import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DisputesController } from './disputes.controller';

@Module({
  imports: [AuthModule],
  controllers: [DisputesController],
})
export class DisputesModule {}

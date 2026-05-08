import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppContentController } from './app-content.controller';

@Module({
  imports: [AuthModule],
  controllers: [AppContentController],
})
export class AppContentModule {}

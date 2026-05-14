import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { StorageModule } from '../storage/storage.module';
import { AdminAuthService } from './admin-login';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({}), StorageModule],
  controllers: [AuthController],
  providers: [AuthService, AdminAuthService, OtpService, TokenService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}

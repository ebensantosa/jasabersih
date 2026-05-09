import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ZodValidationPipe } from '../../common/zod.pipe';

import { AdminAuthService, AdminLoginRequestSchema, type AdminLoginRequest } from './admin-login';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  VerifyOtpRequestSchema,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
  type VerifyOtpRequest,
} from './dto';
import { JwtAuthGuard } from './jwt.guard';
import type { AuthenticatedUser } from './jwt.strategy';

type RequestMeta = { ipAddress?: string; userAgent?: string; deviceId?: string };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly adminAuth: AdminAuthService,
  ) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Mulai registrasi: kirim OTP ke nomor HP' })
  register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) body: RegisterRequest,
  ): Promise<{ phone: string; expiresInSeconds: number }> {
    return this.auth.register(body);
  }

  @Post('verify-otp')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifikasi OTP & set password → terima JWT pair' })
  async verifyOtp(
    @Body(new ZodValidationPipe(VerifyOtpRequestSchema)) body: VerifyOtpRequest,
    @Body('mode') mode: 'customer' | 'freelancer' = 'customer',
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-device-id') deviceId?: string,
  ): Promise<ReturnType<AuthService['verifyOtp']>> {
    return this.auth.verifyOtp(body, mode, this.meta(ip, userAgent, deviceId));
  }

  @Post('admin-login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login dengan email + password' })
  adminLogin(
    @Body(new ZodValidationPipe(AdminLoginRequestSchema)) body: AdminLoginRequest,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.adminAuth.login(body, { ipAddress: ip, userAgent });
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login dengan nomor HP + password' })
  login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-device-id') deviceId?: string,
  ): ReturnType<AuthService['login']> {
    return this.auth.login(body, this.meta(ip, userAgent, deviceId));
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token: revoke lama, issue baru' })
  refresh(
    @Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-device-id') deviceId?: string,
  ): ReturnType<AuthService['refresh']> {
    return this.auth.refresh(body.refreshToken, this.meta(ip, userAgent, deviceId));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getProfile(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke refresh token' })
  async logout(
    @Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest,
    @CurrentUser() _user: AuthenticatedUser,
  ): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  private meta(ip?: string, ua?: string, deviceId?: string): RequestMeta {
    return { ipAddress: ip, userAgent: ua, deviceId };
  }
}

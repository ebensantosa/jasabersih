import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { normalizePhone } from '@jasabersih/shared-types';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../common/prisma.service';

import { OtpService } from './otp.service';
import { TokenService, type IssuedTokens } from './token.service';
import type { LoginRequest, RegisterRequest, VerifyOtpRequest } from './dto';

const PENDING_TTL_MIN = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterRequest): Promise<{ phone: string; expiresInSeconds: number }> {
    const phone = normalizePhone(input.phone);

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing && existing.phoneVerifiedAt) {
      throw new ConflictException({
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'Nomor HP sudah terdaftar. Silakan login.',
      });
    }

    await this.otp.generateAndSend(phone);
    return { phone, expiresInSeconds: PENDING_TTL_MIN * 60 };
  }

  async verifyOtp(
    input: VerifyOtpRequest,
    mode: 'customer' | 'freelancer',
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<IssuedTokens> {
    const phone = normalizePhone(input.phone);
    await this.otp.verify(phone, input.otp);

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.prisma.user.upsert({
      where: { phone },
      update: {
        name: input.fullName,
        passwordHash,
        phoneVerifiedAt: new Date(),
        isCustomer: mode === 'customer' ? true : undefined,
        isFreelancer: mode === 'freelancer' ? true : undefined,
      },
      create: {
        phone,
        name: input.fullName,
        passwordHash,
        phoneVerifiedAt: new Date(),
        isCustomer: mode === 'customer',
        isFreelancer: mode === 'freelancer',
      },
    });

    return this.tokens.issueForUser(user.id, user.phone, meta);
  }

  async login(
    input: LoginRequest,
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<IssuedTokens> {
    const phone = normalizePhone(input.phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || !user.phoneVerifiedAt) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Nomor HP atau password salah.',
      });
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Nomor HP atau password salah.',
      });
    }
    if (user.deletedAt) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Akun dinonaktifkan.' });
    }
    return this.tokens.issueForUser(user.id, user.phone, meta);
  }

  async refresh(
    refreshToken: string,
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<IssuedTokens> {
    try {
      return await this.tokens.rotate(refreshToken, meta);
    } catch {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INVALID',
        message: 'Refresh token tidak valid atau sudah dipakai.',
      });
    }
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new BadRequestException({ code: 'MISSING_REFRESH_TOKEN', message: 'refreshToken wajib.' });
    }
    await this.tokens.revoke(refreshToken);
  }
}

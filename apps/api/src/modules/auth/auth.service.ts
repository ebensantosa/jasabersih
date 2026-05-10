import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../common/prisma.service';

import {
  isLikelyEmail,
  normalizePhone,
  type LoginRequest,
  type RegisterRequest,
  type VerifyOtpRequest,
} from './dto';
import { OtpService } from './otp.service';
import { TokenService, type IssuedTokens } from './token.service';

const PENDING_TTL_MIN = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterRequest): Promise<{ phone: string; expiresInSeconds: number; emailSent?: boolean; devOtp?: string }> {
    const phone = normalizePhone(input.phone);
    const email = input.email?.trim().toLowerCase();

    // Cek email sudah dipakai akun lain (verified) — cegah duplikat
    if (email) {
      const taken = await this.prisma.user.findFirst({ where: { email, phoneVerifiedAt: { not: null } } });
      if (taken) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'Email sudah terdaftar. Silakan login.',
        });
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing && existing.phoneVerifiedAt) {
      throw new ConflictException({
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'Nomor HP sudah terdaftar. Silakan login.',
      });
    }

    // Per-email rate limit: max 3 OTP request / 15 menit (cegah abuse Resend quota)
    if (email) await this.otp.assertEmailRateOk(email);

    const otp = await this.otp.generateAndSend(phone);
    // Kalau email disediakan & Resend aktif, kirim OTP via email
    let emailSent = false;
    if (email) {
      const result = await this.otp.sendViaEmail(email, otp);
      emailSent = result.ok;
    }
    // Sampai SMS gateway aktif: expose devOtp di response saat AUTH_DEV_MODE=true ATAU kalau email gagal terkirim
    const devMode = process.env.AUTH_DEV_MODE === 'true';
    return {
      phone,
      expiresInSeconds: PENDING_TTL_MIN * 60,
      emailSent,
      ...(devMode && otp ? { devOtp: otp } : {}),
    };
  }

  async verifyOtp(
    input: VerifyOtpRequest,
    mode: 'customer' | 'freelancer',
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<IssuedTokens> {
    const phone = normalizePhone(input.phone);
    await this.otp.verify(phone, input.otp);

    const passwordHash = await bcrypt.hash(input.password, 12);

    const email = input.email?.trim().toLowerCase() || undefined;
    const user = await this.prisma.user.upsert({
      where: { phone },
      update: {
        name: input.fullName,
        passwordHash,
        phoneVerifiedAt: new Date(),
        isCustomer: mode === 'customer' ? true : undefined,
        isFreelancer: mode === 'freelancer' ? true : undefined,
        ...(email ? { email } : {}),
      },
      create: {
        phone,
        name: input.fullName,
        passwordHash,
        phoneVerifiedAt: new Date(),
        isCustomer: mode === 'customer',
        isFreelancer: mode === 'freelancer',
        ...(email ? { email } : {}),
      },
    });

    // Auto-apply referral code (best-effort, ignore errors)
    if (input.referralCode) {
      const code = input.referralCode.trim().toUpperCase();
      try {
        const ref = await this.prisma.$queryRaw<{ user_id: string }[]>`
          SELECT user_id FROM referral_codes WHERE code = ${code} LIMIT 1
        `;
        const referrerId = ref[0]?.user_id;
        if (referrerId && referrerId !== user.id) {
          // Cek belum pernah punya referral entry
          const exists = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM referrals WHERE referred_id = ${user.id}::uuid LIMIT 1
          `;
          if (exists.length === 0) {
            await this.prisma.$executeRaw`
              INSERT INTO referrals (referrer_id, referred_id, referrer_role, referred_role, status)
              VALUES (${referrerId}::uuid, ${user.id}::uuid, 'customer', ${mode}, 'pending')
            `;
          }
        }
      } catch {
        // Diam aja — referral gagal jangan halangin signup
      }
    }

    return this.tokens.issueForUser(user.id, user.phone, meta);
  }

  async login(
    input: LoginRequest,
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<IssuedTokens> {
    const raw = input.phone.trim();
    const user = isLikelyEmail(raw)
      ? await this.prisma.user.findUnique({ where: { email: raw.toLowerCase() } })
      : await this.prisma.user.findUnique({ where: { phone: normalizePhone(raw) } });
    if (!user || !user.phoneVerifiedAt) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email/No. HP atau password salah.',
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

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, phone: true, email: true, photoUrl: true,
        isCustomer: true, isFreelancer: true,
        phoneVerifiedAt: true, createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      photoUrl: user.photoUrl,
      mode: user.isFreelancer ? 'freelancer' : 'customer',
      memberSince: user.createdAt,
      verified: !!user.phoneVerifiedAt,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new BadRequestException({ code: 'WEAK_PASSWORD', message: 'Password baru min 8 karakter.' });
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException({ code: 'WRONG_PASSWORD', message: 'Password lama salah.' });
    const newHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    // Revoke semua sesi lain biar device lain auto-logout (kecuali current — caller bisa re-login)
    await this.prisma.$executeRaw`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`;
  }

  async forgotPassword(identifier: string): Promise<{ ok: boolean; emailSent?: boolean; devOtp?: string }> {
    const raw = identifier.trim();
    const user = isLikelyEmail(raw)
      ? await this.prisma.user.findUnique({ where: { email: raw.toLowerCase() } })
      : await this.prisma.user.findUnique({ where: { phone: normalizePhone(raw) } });
    // Always return ok (no enumeration leak — gak kasih tau email/phone exists atau gak)
    if (!user || !user.email) return { ok: true };
    await this.otp.assertEmailRateOk(user.email);
    const otp = await this.otp.generateAndSend(user.phone);
    let emailSent = false;
    const result = await this.otp.sendViaEmail(user.email, otp);
    emailSent = result.ok;
    const devMode = process.env.AUTH_DEV_MODE === 'true';
    return { ok: true, emailSent, ...(devMode ? { devOtp: otp } : {}) };
  }

  async resetPassword(identifier: string, otp: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new BadRequestException({ code: 'WEAK_PASSWORD', message: 'Password baru min 8 karakter.' });
    }
    const raw = identifier.trim();
    const user = isLikelyEmail(raw)
      ? await this.prisma.user.findUnique({ where: { email: raw.toLowerCase() } })
      : await this.prisma.user.findUnique({ where: { phone: normalizePhone(raw) } });
    if (!user) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email/HP atau OTP tidak valid.' });
    await this.otp.verify(user.phone, otp);
    const newHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
    // Revoke semua sesi lama (force re-login di semua device)
    await this.prisma.$executeRaw`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ${user.id}::uuid AND revoked_at IS NULL`;
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new BadRequestException({ code: 'MISSING_REFRESH_TOKEN', message: 'refreshToken wajib.' });
    }
    await this.tokens.revoke(refreshToken);
  }
}

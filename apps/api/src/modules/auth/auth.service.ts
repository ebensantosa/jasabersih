import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../storage/storage.service';

import {
  isLikelyEmail,
  normalizePhone,
  type LoginRequest,
  type RegisterRequest,
  type VerifyOtpRequest,
} from './dto';
import { LoginProtectionService } from './login-protection.service';
import { OtpService } from './otp.service';
import { TokenService, type IssuedTokens } from './token.service';

const PENDING_TTL_MIN = 5;
const PUBLIC_AUTH_WINDOW_SEC = 10 * 60;
const PUBLIC_AUTH_LIMIT_PER_IP = 10;
const PUBLIC_AUTH_LIMIT_PER_IDENTIFIER = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly storage: StorageService,
    private readonly loginProtection: LoginProtectionService,
  ) {}

  async register(
    input: RegisterRequest,
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<{ phone: string; expiresInSeconds: number; emailSent?: boolean; devOtp?: string }> {
    const phone = normalizePhone(input.phone);
    const email = input.email?.trim().toLowerCase();
    await this.assertPublicAuthRate('register', email || phone, meta);

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
    // Sampai SMS gateway aktif: expose devOtp di response saat AUTH_DEV_MODE=true.
    // HARD GUARD: gak boleh aktif di production walau env flag accidentally set TRUE.
    const devMode = process.env.AUTH_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production';
    return {
      phone,
      expiresInSeconds: PENDING_TTL_MIN * 60,
      emailSent,
      ...(devMode && otp ? { devOtp: otp } : {}),
    };
  }

  private async assertPublicAuthRate(
    action: 'register' | 'verify_otp' | 'forgot_password' | 'reset_password',
    identifier: string,
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<void> {
    await this.otp.assertScopedRateOk({
      key: `auth:${action}:id:${identifier.toLowerCase()}`,
      limit: PUBLIC_AUTH_LIMIT_PER_IDENTIFIER,
      windowSec: PUBLIC_AUTH_WINDOW_SEC,
      code: 'AUTH_RATE_LIMIT_IDENTIFIER',
      message: 'Terlalu banyak percobaan untuk akun ini. Coba lagi beberapa menit lagi.',
    });
    if (meta.ipAddress) {
      await this.otp.assertScopedRateOk({
        key: `auth:${action}:ip:${meta.ipAddress}`,
        limit: PUBLIC_AUTH_LIMIT_PER_IP,
        windowSec: PUBLIC_AUTH_WINDOW_SEC,
        code: 'AUTH_RATE_LIMIT_IP',
        message: 'Terlalu banyak percobaan dari jaringan ini. Coba lagi beberapa menit lagi.',
      });
    }
  }

  async verifyOtp(
    input: VerifyOtpRequest,
    mode: 'customer' | 'freelancer',
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<IssuedTokens> {
    const phone = normalizePhone(input.phone);
    await this.assertPublicAuthRate('verify_otp', phone, meta);
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

    // Referral hanya relevan untuk customer baru.
    // Cleaner tidak melakukan order customer, jadi kode referral diabaikan.
    if (mode === 'customer' && input.referralCode) {
      const code = input.referralCode.trim().toUpperCase();
      try {
        const ref = await this.prisma.$queryRaw<{ user_id: string; is_customer: boolean; is_freelancer: boolean }[]>`
          SELECT rc.user_id, u.is_customer, u.is_freelancer
            FROM referral_codes rc
            JOIN users u ON u.id = rc.user_id
           WHERE rc.code = ${code}
           LIMIT 1
        `;
        const referrerId = ref[0]?.user_id;
        if (referrerId && referrerId !== user.id) {
          const referrerRole = ref[0]?.is_freelancer ? 'freelancer' : 'customer';
          // Cek belum pernah punya referral entry
          const exists = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM referrals WHERE referred_id = ${user.id}::uuid LIMIT 1
          `;
          if (exists.length === 0) {
            await this.prisma.$executeRaw`
              INSERT INTO referrals (referrer_id, referred_id, referrer_role, referred_role, status)
              VALUES (${referrerId}::uuid, ${user.id}::uuid, ${referrerRole}, ${mode}, 'pending')
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
    const identifier = isLikelyEmail(raw) ? raw.toLowerCase() : normalizePhone(raw);
    await this.loginProtection.assertAllowed(identifier, meta);
    const user = isLikelyEmail(raw)
      ? await this.prisma.user.findUnique({ where: { email: raw.toLowerCase() } })
      : await this.prisma.user.findUnique({ where: { phone: identifier } });
    if (!user || !user.phoneVerifiedAt) {
      await this.loginProtection.recordFailure(identifier, meta);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email/No. HP atau password salah.',
      });
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      await this.loginProtection.recordFailure(identifier, meta);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Nomor HP atau password salah.',
      });
    }
    if (user.deletedAt) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Akun dinonaktifkan.' });
    }
    await this.loginProtection.clearFailures(identifier, meta);
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
      isCustomer: user.isCustomer,
      isFreelancer: user.isFreelancer,
      memberSince: user.createdAt,
      verified: !!user.phoneVerifiedAt,
    };
  }

  async updateProfile(userId: string, body: { name?: string; email?: string; photoUrl?: string }) {
    const data: any = {};
    if (body.name !== undefined) {
      const n = body.name.trim();
      if (n.length < 2) throw new BadRequestException({ code: 'INVALID_NAME', message: 'Nama min 2 karakter' });
      data.name = n;
    }
    if (body.email !== undefined) {
      const e = body.email.trim().toLowerCase();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        throw new BadRequestException({ code: 'INVALID_EMAIL', message: 'Format email tidak valid' });
      }
      data.email = e || null;
    }
    if (body.photoUrl !== undefined) {
      data.photoUrl = body.photoUrl || null;
    }
    if (Object.keys(data).length === 0) return this.getProfile(userId);
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }

  async createPhotoUploadUrl(userId: string, contentType: string) {
    const r = await this.storage.createUploadUrl({
      bucket: 'public',
      keyPrefix: `profile-photos/${userId}`,
      contentType,
      expiresInSec: 300,
    });
    return { ...r, publicUrl: this.storage.getPublicUrl(r.key) };
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

  async forgotPassword(
    identifier: string,
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<{ ok: boolean; emailSent?: boolean; devOtp?: string }> {
    const raw = identifier.trim();
    const normalized = isLikelyEmail(raw) ? raw.toLowerCase() : normalizePhone(raw);
    await this.assertPublicAuthRate('forgot_password', normalized, meta);
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
    const devMode = process.env.AUTH_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production';
    return { ok: true, emailSent, ...(devMode ? { devOtp: otp } : {}) };
  }

  async resetPassword(
    identifier: string,
    otp: string,
    newPassword: string,
    meta: { ipAddress?: string; userAgent?: string; deviceId?: string } = {},
  ): Promise<void> {
    if (newPassword.length < 8) {
      throw new BadRequestException({ code: 'WEAK_PASSWORD', message: 'Password baru min 8 karakter.' });
    }
    const raw = identifier.trim();
    const normalized = isLikelyEmail(raw) ? raw.toLowerCase() : normalizePhone(raw);
    await this.assertPublicAuthRate('reset_password', normalized, meta);
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

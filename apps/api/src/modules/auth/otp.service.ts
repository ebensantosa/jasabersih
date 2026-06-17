import { Inject, Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis.module';
import { EmailService } from '../email/email.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttl: number;
  private readonly maxAttempts: number;
  private readonly rateWindow: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {
    this.ttl = Number(this.config.get('OTP_TTL_SECONDS') ?? 300);
    this.maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 3);
    this.rateWindow = Number(this.config.get('OTP_RATE_LIMIT_WINDOW_SECONDS') ?? 900);
  }

  async generateAndSend(phone: string): Promise<string> {
    const rateKey = `otp:rate:${phone}`;
    const sent = await this.redis.incr(rateKey);
    if (sent === 1) await this.redis.expire(rateKey, this.rateWindow);
    if (sent > this.maxAttempts) {
      throw new HttpException(
        { code: 'OTP_RATE_LIMIT', message: 'Terlalu banyak permintaan OTP. Coba lagi nanti.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = crypto.randomInt(100_000, 1_000_000).toString();
    await this.redis.set(`otp:code:${phone}`, otp, 'EX', this.ttl);
    await this.redis.del(`otp:tries:${phone}`);

    // Sprint 2: ganti dengan Zenziva SMS service
    this.logger.warn(`[OTP] phone=${phone} code=${otp} (DEV ONLY — kirim via SMS di Sprint 2)`);
    return otp;
  }

  async assertScopedRateOk(opts: {
    key: string;
    limit: number;
    windowSec: number;
    code: string;
    message: string;
  }): Promise<void> {
    const count = await this.redis.incr(opts.key);
    if (count === 1) await this.redis.expire(opts.key, opts.windowSec);
    if (count > opts.limit) {
      throw new HttpException(
        { code: opts.code, message: opts.message },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Kirim OTP via email (Resend). Best-effort — caller bisa fallback ke devOtp/SMS. */
  async sendViaEmail(toEmail: string, otp: string): Promise<{ ok: boolean; error?: string }> {
    return this.email.sendOtp(toEmail, otp);
  }

  /** Throttle per-email OTP requests (max 3 / 15 menit) — cegah abuse Resend quota. */
  async assertEmailRateOk(email: string): Promise<void> {
    const key = `otp:email:rate:${email.toLowerCase()}`;
    const sent = await this.redis.incr(key);
    if (sent === 1) await this.redis.expire(key, this.rateWindow);
    if (sent > this.maxAttempts) {
      throw new HttpException(
        { code: 'OTP_EMAIL_RATE_LIMIT', message: 'Terlalu banyak permintaan kode untuk email ini. Coba lagi dalam 15 menit.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async verify(phone: string, otp: string): Promise<void> {
    const triesKey = `otp:tries:${phone}`;
    const tries = await this.redis.incr(triesKey);
    if (tries === 1) await this.redis.expire(triesKey, this.ttl);
    if (tries > this.maxAttempts) {
      await this.redis.del(`otp:code:${phone}`);
      throw new HttpException(
        { code: 'OTP_TOO_MANY_TRIES', message: 'Terlalu banyak percobaan OTP salah.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const stored = await this.redis.get(`otp:code:${phone}`);
    if (!stored || stored !== otp) {
      throw new BadRequestException({ code: 'OTP_INVALID', message: 'Kode OTP tidak valid atau kadaluarsa.' });
    }
    await this.redis.del(`otp:code:${phone}`, triesKey);
  }
}

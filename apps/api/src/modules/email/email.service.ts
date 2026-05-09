import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

import { PrismaService } from '../../common/prisma.service';

type EmailConfig = {
  apiKey: string | null;
  fromAddress: string;
  fromName: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private cached: { value: EmailConfig; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Read email config from app_config. Cached 60s to avoid hot loop. */
  private async config(): Promise<EmailConfig> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;
    const rows = await this.prisma.$queryRaw<{ key: string; value: any }[]>`
      SELECT key, value FROM app_config
       WHERE key IN ('email.resend_api_key', 'email.from_address', 'email.from_name')
    `;
    const map = new Map(rows.map((r) => [r.key, typeof r.value === 'string' ? r.value : (r.value as any)]));
    const cfg: EmailConfig = {
      apiKey: (map.get('email.resend_api_key') as string | null) || process.env.RESEND_API_KEY || null,
      fromAddress: (map.get('email.from_address') as string) || process.env.EMAIL_FROM_ADDRESS || 'noreply@jasabersih.com',
      fromName: (map.get('email.from_name') as string) || 'JasaBersih',
    };
    this.cached = { value: cfg, expiresAt: Date.now() + 60_000 };
    return cfg;
  }

  /** Force-refresh on next call (e.g. after admin changes config). */
  invalidateCache(): void {
    this.cached = null;
  }

  async send(opts: { to: string; subject: string; html: string; text?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
    const cfg = await this.config();
    if (!cfg.apiKey) {
      this.logger.warn(`[EMAIL] No Resend API key configured — would send to=${opts.to} subject="${opts.subject}"`);
      return { ok: false, error: 'NO_API_KEY' };
    }
    try {
      const resend = new Resend(cfg.apiKey);
      const result = await resend.emails.send({
        from: `${cfg.fromName} <${cfg.fromAddress}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      if (result.error) {
        this.logger.error(`[EMAIL] Resend error: ${result.error.message}`);
        return { ok: false, error: result.error.message };
      }
      return { ok: true, id: result.data?.id };
    } catch (e: any) {
      this.logger.error(`[EMAIL] Send failed: ${e?.message ?? e}`);
      return { ok: false, error: e?.message ?? 'UNKNOWN' };
    }
  }

  async sendOtp(toEmail: string, otp: string): Promise<{ ok: boolean; error?: string }> {
    const subject = `Kode verifikasi JasaBersih: ${otp}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0F172A">
        <h2 style="margin:0 0 8px">Verifikasi Akun</h2>
        <p style="color:#475569;margin:0 0 24px">Masukkan kode berikut untuk menyelesaikan pendaftaran kamu di JasaBersih:</p>
        <div style="background:#F1F5F9;border-radius:12px;padding:20px;text-align:center;font-size:32px;letter-spacing:8px;font-weight:700;color:#1D4ED8">${otp}</div>
        <p style="color:#94A3B8;font-size:12px;margin-top:24px">Kode berlaku selama 5 menit. Jangan bagikan ke siapa pun.</p>
        <p style="color:#94A3B8;font-size:12px">Kalau kamu tidak meminta kode ini, abaikan email ini.</p>
      </div>
    `;
    const text = `Kode verifikasi JasaBersih: ${otp}\nBerlaku 5 menit. Jangan bagikan ke siapa pun.`;
    return this.send({ to: toEmail, subject, html, text });
  }
}

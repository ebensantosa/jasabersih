import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';

// Flip Accept Payment v3 — bigflip.id
// Auth: Authorization: Basic base64(secretKey + ":")
// Callback: application/x-www-form-urlencoded with `data` (JSON) + `token`.
//   Verify by string-comparing token to the configured validation_token.
type Creds = {
  baseUrl: string;
  secretKey: string;
  validationToken: string;
  enabled: boolean;
};

export type FlipCreateInput = {
  title: string;
  amount: number;
  refId: string;          // becomes Flip "sender_email" prefix / our merchant_ref
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  redirectUrl?: string;
  expiredAt?: Date;       // optional override; else 24h
};

export type FlipCreateResult = {
  link_id: number;
  link_url: string;       // checkout URL to open in WebView
  title: string;
  type: string;
  amount: number;
  status: string;
  step: number;
  bill_payment?: any;
};

const TTL_MS = 60_000;

@Injectable()
export class FlipService {
  private readonly log = new Logger(FlipService.name);
  private cached: Creds | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  invalidateCache(): void { this.cached = null; }

  private async getCreds(): Promise<Creds> {
    if (this.cached && Date.now() - this.cachedAt < TTL_MS) return this.cached;
    const rows = await this.prisma.$queryRaw<{ key: string; value: unknown }[]>`
      SELECT key, value FROM app_config WHERE key IN
        ('payment.flip_enabled', 'payment.flip_is_production',
         'payment.flip_secret_key', 'payment.flip_validation_token')
    `;
    const map = new Map<string, unknown>();
    for (const r of rows) map.set(r.key, r.value);
    const isProd = Boolean(map.get('payment.flip_is_production'));
    const baseUrl = isProd
      ? 'https://bigflip.id/api/v3'
      : 'https://bigflip.id/big_sandbox_api/v2';
    const creds: Creds = {
      baseUrl,
      secretKey: String(map.get('payment.flip_secret_key') ?? ''),
      validationToken: String(map.get('payment.flip_validation_token') ?? ''),
      enabled: Boolean(map.get('payment.flip_enabled')),
    };
    this.cached = creds;
    this.cachedAt = Date.now();
    return creds;
  }

  async isConfigured(): Promise<boolean> {
    const c = await this.getCreds();
    return c.enabled && !!c.secretKey;
  }

  private authHeader(secretKey: string): string {
    return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
  }

  async createBill(input: FlipCreateInput): Promise<FlipCreateResult> {
    const c = await this.getCreds();
    if (!c.enabled) throw new BadRequestException('Flip belum di-enable di App Settings.');
    if (!c.secretKey) throw new BadRequestException('Flip secret_key kosong di App Settings.');

    // Flip expects multipart/form-data OR x-www-form-urlencoded for create-bill.
    const form = new URLSearchParams();
    form.set('title', input.title);
    form.set('type', 'SINGLE');
    form.set('amount', String(input.amount));
    form.set('expired_date', this.formatExpired(input.expiredAt ?? new Date(Date.now() + 24 * 3600_000)));
    form.set('redirect_url', input.redirectUrl ?? '');
    form.set('is_address_required', '0');
    form.set('is_phone_number_required', '0');
    form.set('step', '2'); // 2 = customer chooses payment method on Flip page
    if (input.customerName) form.set('sender_name', input.customerName);
    if (input.customerEmail) form.set('sender_email', input.customerEmail);
    if (input.customerPhone) form.set('sender_phone_number', input.customerPhone);

    const res = await fetch(`${c.baseUrl}/pwf/bill`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(c.secretKey),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.code) {
      this.log.error(`flip create-bill failed: ${JSON.stringify(json)}`);
      throw new BadRequestException(json?.message ?? json?.error ?? 'Gagal create bill di Flip.');
    }
    return json as FlipCreateResult;
  }

  // Flip callbacks: form field `token` must equal our validation_token (string equal).
  async verifyCallbackToken(token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const c = await this.getCreds();
    if (!c.validationToken) return false;
    // Use timing-safe compare to avoid leaking length info
    const a = Buffer.from(token);
    const b = Buffer.from(c.validationToken);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
  }

  // Flip wants "YYYY-MM-DD HH:mm" (local WIB-ish — Flip docs use server-local).
  private formatExpired(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

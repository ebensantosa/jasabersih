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
    const secretKey = String(map.get('payment.flip_secret_key') ?? '');
    const creds: Creds = {
      baseUrl,
      secretKey,
      validationToken: String(map.get('payment.flip_validation_token') ?? ''),
      enabled: Boolean(map.get('payment.flip_enabled')),
    };
    this.log.log(`Flip creds loaded: mode=${isProd ? 'production' : 'sandbox'} enabled=${creds.enabled} secret_first10=${secretKey.slice(0, 10)} secret_len=${secretKey.length}`);
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

  // Direct API: pre-select method (VA bank or QRIS) so user doesn't see
  // Flip's hosted picker page. Response includes account_number / qr_string
  // we render natively in our app.
  async createDirectBill(input: FlipCreateInput & {
    senderBank: string;          // bca|bni|bri|mandiri|cimb|permata|bsi|qris
    senderBankType: 'virtual_account' | 'qris' | 'wallet_account';
  }): Promise<any> {
    const c = await this.getCreds();
    if (!c.enabled) throw new BadRequestException('Flip belum di-enable di App Settings.');
    if (!c.secretKey) throw new BadRequestException('Flip secret_key kosong di App Settings.');

    const form = new URLSearchParams();
    form.set('title', input.title);
    form.set('type', 'SINGLE');
    form.set('step', 'direct_api'); // Flip v3 docs: required untuk direct mode (skip hosted picker)
    form.set('amount', String(input.amount));
    form.set('expired_date', this.formatExpired(input.expiredAt ?? new Date(Date.now() + 24 * 3600_000)));
    if (input.redirectUrl) form.set('redirect_url', input.redirectUrl);
    form.set('sender_bank', input.senderBank);
    form.set('sender_bank_type', input.senderBankType);
    if (input.refId) form.set('reference_id', input.refId);
    if (input.customerName) form.set('sender_name', input.customerName);
    if (input.customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail) && !input.customerEmail.endsWith('@jasabersih.com')) {
      form.set('sender_email', input.customerEmail);
    }
    if (input.customerPhone && /^08\d{8,12}$/.test(input.customerPhone)) {
      form.set('sender_phone_number', input.customerPhone);
    }

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
      this.log.error(`flip direct-bill failed (status=${res.status}): ${JSON.stringify(json)}`);
      const stringifyMsg = (m: any): string => typeof m === 'string' ? m : (m == null ? '' : JSON.stringify(m));
      const detailMsg = stringifyMsg(json?.message)
        || (Array.isArray(json?.errors) ? json.errors.map((e: any) => `${e?.attribute ?? ''}: ${stringifyMsg(e?.message) || JSON.stringify(e)}`).join('; ') : '')
        || stringifyMsg(json?.error)
        || `Flip ${res.status}`;
      throw new BadRequestException(`Flip: ${detailMsg}`);
    }
    // DEBUG: dump full Flip response to inspect where qr_code_data / account_number live
    this.log.log(`flip direct-bill OK — full response: ${JSON.stringify(json)}`);
    return json;
  }

  /** Fetch bill detail by link_id — kadang qr_code_data baru tersedia di sini, bukan di create response */
  async getBillDetail(linkId: number | string): Promise<any> {
    const c = await this.getCreds();
    if (!c.secretKey) throw new BadRequestException('Flip secret_key kosong.');
    const res = await fetch(`${c.baseUrl}/pwf/${linkId}/get-payment-url`, {
      method: 'GET',
      headers: { Authorization: this.authHeader(c.secretKey) },
    });
    const json: any = await res.json().catch(() => ({}));
    this.log.log(`flip get-bill-detail (link_id=${linkId}) — response: ${JSON.stringify(json)}`);
    return json;
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
    if (input.redirectUrl) form.set('redirect_url', input.redirectUrl); // omit kalau kosong (Flip v3 reject empty string)
    // Note: Flip v3 dropped numeric `step` param. Omit → defaults to "checkout"
    // (customer picks payment method on Flip's hosted page) which is what we want.
    // Sender fields are optional & Flip strict-validates email/phone format.
    // Only send if format clearly valid to avoid 400.
    if (input.customerName) form.set('sender_name', input.customerName);
    if (input.customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail) && !input.customerEmail.endsWith('@jasabersih.com')) {
      form.set('sender_email', input.customerEmail);
    }
    if (input.customerPhone && /^08\d{8,12}$/.test(input.customerPhone)) {
      form.set('sender_phone_number', input.customerPhone);
    }

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
      this.log.error(`flip create-bill failed (status=${res.status}): ${JSON.stringify(json)}`);
      const stringifyMsg = (m: any): string => typeof m === 'string' ? m : (m == null ? '' : JSON.stringify(m));
      const detailMsg = stringifyMsg(json?.message)
        || (Array.isArray(json?.errors) ? json.errors.map((e: any) => `${e?.attribute ?? ''}: ${stringifyMsg(e?.message) || JSON.stringify(e)}`).join('; ') : '')
        || stringifyMsg(json?.error)
        || `Flip ${res.status}`;
      throw new BadRequestException(`Flip: ${detailMsg}`);
    }
    return json as FlipCreateResult;
  }

  // ===== Money Transfer / Disbursement =====
  // POST /disbursement/bank-account-inquiry — verify pemilik rekening (sync return).
  async inquiryBankAccount(input: { bankCode: string; accountNumber: string }): Promise<any> {
    const c = await this.getCreds();
    if (!c.enabled) throw new BadRequestException('Flip belum di-enable di App Settings.');
    if (!c.secretKey) throw new BadRequestException('Flip secret_key kosong di App Settings.');
    const form = new URLSearchParams();
    form.set('account_number', input.accountNumber);
    form.set('bank_code', input.bankCode.toLowerCase());
    form.set('inquiry_key', `INQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const res = await fetch(`${c.baseUrl}/disbursement/bank-account-inquiry`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(c.secretKey),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.code) {
      this.log.error(`flip inquiry failed (status=${res.status}): ${JSON.stringify(json)}`);
      throw new BadRequestException(json?.message ?? `Flip inquiry gagal (${res.status})`);
    }
    return json; // contains: bank_code, account_number, account_holder, status ("SUCCESS"|...)
  }

  // POST /disbursement — create transfer keluar.
  // idempotencyKey wajib unik (kalau Flip nerima dua call dengan key sama, balikin transaksi pertama, gak duplicate).
  async createDisbursement(input: {
    amount: number;
    bankCode: string;
    accountNumber: string;
    accountHolderName: string;
    remark?: string;
    idempotencyKey: string;
  }): Promise<any> {
    const c = await this.getCreds();
    if (!c.enabled) throw new BadRequestException('Flip belum di-enable di App Settings.');
    if (!c.secretKey) throw new BadRequestException('Flip secret_key kosong di App Settings.');
    const form = new URLSearchParams();
    form.set('account_number', input.accountNumber);
    form.set('bank_code', input.bankCode.toLowerCase());
    form.set('amount', String(input.amount));
    form.set('remark', input.remark ?? 'JasaBersih withdrawal');
    form.set('recipient_city', '391'); // default Jakarta; Flip akan validate
    const res = await fetch(`${c.baseUrl}/disbursement`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(c.secretKey),
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': input.idempotencyKey,
      },
      body: form.toString(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.code) {
      this.log.error(`flip disbursement failed (status=${res.status}): ${JSON.stringify(json)}`);
      throw new BadRequestException(json?.message ?? `Flip disbursement gagal (${res.status})`);
    }
    return json; // contains: id, status ("PENDING"|"DONE"|"FAILED"|"CANCELLED"), timestamp, etc.
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

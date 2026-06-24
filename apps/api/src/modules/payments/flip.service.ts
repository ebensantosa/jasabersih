import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';

// Flip Accept Payment v3 — bigflip.id
// Auth: Authorization: Basic base64(secretKey + ":")
// Callback: application/x-www-form-urlencoded with `data` (JSON) + `token`.
//   Verify by string-comparing token to the configured validation_token.
type Creds = {
  baseUrl: string;
  disbursementBaseUrl: string;
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
    // Flip Accept Payment (PWF bills) = v3, Disbursement (bank inquiry + transfer) = v2.
    // Sandbox semua endpoint pakai big_sandbox_api/v2.
    const baseUrl = isProd
      ? 'https://bigflip.id/api/v3'
      : 'https://bigflip.id/big_sandbox_api/v2';
    const disbursementBaseUrl = isProd
      ? 'https://bigflip.id/api/v2'
      : 'https://bigflip.id/big_sandbox_api/v2';
    const secretKey = String(map.get('payment.flip_secret_key') ?? '');
    const creds: Creds = {
      baseUrl,
      disbursementBaseUrl,
      secretKey,
      validationToken: String(map.get('payment.flip_validation_token') ?? ''),
      enabled: Boolean(map.get('payment.flip_enabled')),
    };
    // Jangan log secret value/prefix/length — semua itu bocor di log shipping.
    this.log.log(`Flip creds loaded: mode=${isProd ? 'production' : 'sandbox'} enabled=${creds.enabled} hasKey=${!!secretKey}`);
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
    senderBankType: 'virtual_account' | 'qris' | 'wallet_account' | 'bank_transfer' | 'retail' | 'credit_card';
  }): Promise<any> {
    const c = await this.getCreds();
    if (!c.enabled) throw new BadRequestException('Layanan pembayaran belum di-enable. Cek App Settings.');
    if (!c.secretKey) throw new BadRequestException('Kredensial pembayaran kosong. Cek App Settings.');

    // Per Flip docs: Content-Type=application/json, type=lowercase "single", direct_api step
    const payload: Record<string, any> = {
      title: input.title,
      type: 'single',
      step: 'direct_api',
      amount: input.amount,
      sender_bank: input.senderBank,
      sender_bank_type: input.senderBankType,
    };
    if (input.refId) payload.reference_id = input.refId;
    if (input.customerName) payload.sender_name = input.customerName;
    if (input.customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail) && !input.customerEmail.endsWith('@jasabersih.com')) {
      payload.sender_email = input.customerEmail;
    }
    // Ewallet butuh nomor HP (OVO push notif; DANA/ShopeePay/LinkAja sebagai identifier)
    if (input.senderBankType === 'wallet_account' && input.customerPhone && /^08\d{8,12}$/.test(input.customerPhone)) {
      payload.sender_phone_number = input.customerPhone;
    }
    if (input.redirectUrl) payload.redirect_url = input.redirectUrl;

    const res = await fetch(`${c.baseUrl}/pwf/bill`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(c.secretKey),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.code) {
      this.log.error(`flip direct-bill failed (status=${res.status}): ${JSON.stringify(json)}`);
      const stringifyMsg = (m: any): string => typeof m === 'string' ? m : (m == null ? '' : JSON.stringify(m));
      const detailMsg = stringifyMsg(json?.message)
        || (Array.isArray(json?.errors) ? json.errors.map((e: any) => `${e?.attribute ?? ''}: ${stringifyMsg(e?.message) || JSON.stringify(e)}`).join('; ') : '')
        || stringifyMsg(json?.error)
        || `Flip ${res.status}`;
      throw new BadRequestException(detailMsg);
    }
    this.log.log(`flip direct-bill OK — link_id=${json?.link_id}`);
    return json;
  }

  /** Fetch bill detail. Try multiple endpoint paths Flip may use. */
  async getBillDetail(linkId: number | string): Promise<any> {
    const c = await this.getCreds();
    if (!c.secretKey) throw new BadRequestException('Kredensial pembayaran kosong.');
    // Try multiple endpoint patterns
    const paths = [
      `/pwf/bill?id=${linkId}`,
      `/pwf/${linkId}`,
      `/pwf/bill/${linkId}`,
      `/pwf/payment-url?id=${linkId}`,
    ];
    for (const path of paths) {
      try {
        const res = await fetch(`${c.baseUrl}${path}`, {
          method: 'GET',
          headers: { Authorization: this.authHeader(c.secretKey) },
        });
        const json: any = await res.json().catch(() => ({}));
        this.log.log(`flip get-bill-detail [${path}] status=${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
        if (!res.ok || json?.code) continue;
        // Single-bill response
        if (json?.bill_payment || json?.qr_code_data) return json;
        // List response: filter by link_id
        if (Array.isArray(json?.data)) {
          const found = json.data.find((b: any) => String(b?.link_id) === String(linkId));
          if (found) {
            this.log.log(`flip get-bill-detail: found match in list for link_id=${linkId}: ${JSON.stringify(found).slice(0, 500)}`);
            return found;
          }
        }
      } catch (e: any) {
        this.log.warn(`getBillDetail path ${path} failed: ${e?.message ?? e}`);
      }
    }
    return null;
  }

  async createBill(input: FlipCreateInput): Promise<FlipCreateResult> {
    const c = await this.getCreds();
    if (!c.enabled) throw new BadRequestException('Layanan pembayaran belum di-enable. Cek App Settings.');
    if (!c.secretKey) throw new BadRequestException('Kredensial pembayaran kosong. Cek App Settings.');

    // Per Flip docs: Content-Type=application/json, type=lowercase, step omitted = "checkout" (hosted picker)
    const payload: Record<string, any> = {
      title: input.title,
      type: 'single',
      amount: input.amount,
    };
    if (input.redirectUrl) payload.redirect_url = input.redirectUrl;
    if (input.customerName) payload.sender_name = input.customerName;
    if (input.customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail) && !input.customerEmail.endsWith('@jasabersih.com')) {
      payload.sender_email = input.customerEmail;
    }

    const res = await fetch(`${c.baseUrl}/pwf/bill`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(c.secretKey),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.code) {
      this.log.error(`flip create-bill failed (status=${res.status}): ${JSON.stringify(json)}`);
      const stringifyMsg = (m: any): string => typeof m === 'string' ? m : (m == null ? '' : JSON.stringify(m));
      const detailMsg = stringifyMsg(json?.message)
        || (Array.isArray(json?.errors) ? json.errors.map((e: any) => `${e?.attribute ?? ''}: ${stringifyMsg(e?.message) || JSON.stringify(e)}`).join('; ') : '')
        || stringifyMsg(json?.error)
        || `Flip ${res.status}`;
      throw new BadRequestException(detailMsg);
    }
    return json as FlipCreateResult;
  }

  // ===== Money Transfer / Disbursement =====
  // POST /disbursement/bank-account-inquiry — verify pemilik rekening (sync return).
  async inquiryBankAccount(input: { bankCode: string; accountNumber: string }): Promise<any> {
    const c = await this.getCreds();
    if (!c.enabled) throw new BadRequestException('Layanan pembayaran belum di-enable. Cek App Settings.');
    if (!c.secretKey) throw new BadRequestException('Kredensial pembayaran kosong. Cek App Settings.');
    const form = new URLSearchParams();
    form.set('account_number', input.accountNumber);
    form.set('bank_code', input.bankCode.toLowerCase());
    form.set('inquiry_key', `INQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const res = await fetch(`${c.disbursementBaseUrl}/disbursement/bank-account-inquiry`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(c.secretKey),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.code) {
      const flipErrors: any[] = json?.errors ?? [];
      const isInvalidBankCode = flipErrors.some((e: any) => e?.code === 1033) || res.status === 422;
      this.log.error(`flip inquiry failed (bank=${input.bankCode} status=${res.status}): ${JSON.stringify(json)}`);
      // Bank code tidak didukung Flip untuk inquiry — simpan tanpa verifikasi
      if (isInvalidBankCode) return null;
      throw new BadRequestException(json?.message ?? `Verifikasi rekening gagal (${res.status})`);
    }
    return json; // contains: bank_code, account_number, account_holder, status ("SUCCESS"|...)
  }

  // POST /disbursement — create transfer keluar.
  // idempotencyKey wajib unik (kalau Flip nerima dua call dengan key sama, balikin transaksi pertama, gak duplicate).
  /**
   * GET status Accept Payment (bill) by link_id. Dipakai cron sync
   * supaya pending payments auto-update walau Flip callback gagal.
   */
  async getAcceptPaymentStatus(linkId: string | number): Promise<any> {
    const c = await this.getCreds();
    if (!c.enabled || !c.secretKey) return null;
    // Accept Payment GET bill status. Flip API endpoint: GET /pwf/{link_id}.
    const res = await fetch(`${c.baseUrl}/pwf/${encodeURIComponent(String(linkId))}`, {
      method: 'GET',
      headers: { Authorization: this.authHeader(c.secretKey) },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.log.warn(`flip get-bill failed linkId=${linkId} status=${res.status}: ${JSON.stringify(json)}`);
      return null;
    }
    return json;
  }

  /**
   * GET status disbursement by Flip ID. Dipakai cron sync supaya
   * pending withdrawals auto-update walau Flip callback gagal/telat.
   */
  async getDisbursementStatus(flipId: string): Promise<any> {
    const c = await this.getCreds();
    if (!c.enabled || !c.secretKey) return null;
    const res = await fetch(`${c.disbursementBaseUrl}/get-disbursement?id=${encodeURIComponent(flipId)}`, {
      method: 'GET',
      headers: { Authorization: this.authHeader(c.secretKey) },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.log.warn(`flip get-disbursement failed id=${flipId} status=${res.status}: ${JSON.stringify(json)}`);
      return null;
    }
    return json;
  }

  async createDisbursement(input: {
    amount: number;
    bankCode: string;
    accountNumber: string;
    accountHolderName: string;
    remark?: string;
    idempotencyKey: string;
  }): Promise<any> {
    const c = await this.getCreds();
    if (!c.enabled) throw new BadRequestException('Layanan pembayaran belum di-enable. Cek App Settings.');
    if (!c.secretKey) throw new BadRequestException('Kredensial pembayaran kosong. Cek App Settings.');
    const bankCode = input.bankCode.toLowerCase();
    const ewallets = new Set(['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja']);
    const isEwallet = ewallets.has(bankCode);

    // Normalize account number untuk e-wallet -> harus format 628xxx (Flip
    // requirement). User mungkin input 08xxx atau +628xxx.
    let accountNumber = input.accountNumber.trim();
    if (isEwallet) {
      accountNumber = accountNumber.replace(/\D/g, '');
      if (accountNumber.startsWith('0')) accountNumber = '62' + accountNumber.slice(1);
      else if (accountNumber.startsWith('8')) accountNumber = '62' + accountNumber;
    }

    const form = new URLSearchParams();
    form.set('account_number', accountNumber);
    form.set('bank_code', bankCode);
    form.set('amount', String(input.amount));
    // Flip limit remark max 18 char. 'JasaBersih withdrawal' = 21 (reject).
    // Truncate input.remark + fallback ke 'JasaBersih Tarik' (16 char).
    const remarkRaw = input.remark ?? 'JasaBersih Tarik';
    const remark = remarkRaw.slice(0, 18);
    form.set('remark', remark);
    // recipient_city cuma diperlukan untuk bank, e-wallet gak butuh.
    if (!isEwallet) form.set('recipient_city', '391');
    // Beneficiary name required Flip utk semua disbursement, terutama e-wallet.
    form.set('beneficiary_name', input.accountHolderName);

    const res = await fetch(`${c.disbursementBaseUrl}/disbursement`, {
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
      this.log.error(`flip disbursement failed (status=${res.status}, bank=${bankCode}): ${JSON.stringify(json)}`);
      // Surfacing provider error message yg lebih detail ke user
      const flipMsg = json?.message ?? json?.error ?? json?.errors?.[0]?.message;
      if (flipMsg) {
        throw new BadRequestException(`${flipMsg}`);
      }
      // Common 422 = merchant belum enable e-wallet disbursement di provider
      if (res.status === 422 && isEwallet) {
        throw new BadRequestException(
          `Disbursement ke ${bankCode.toUpperCase()} belum aktif. Coba pakai bank transfer dulu atau hubungi CS.`,
        );
      }
      throw new BadRequestException(`Transfer gagal (${res.status}). Coba lagi atau hubungi CS.`);
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

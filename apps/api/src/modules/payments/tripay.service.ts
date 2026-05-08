import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { PrismaService } from '../../common/prisma.service';

export type TripayChannel = {
  group: string;
  code: string;
  name: string;
  type: string;
  fee_merchant: { flat: number; percent: number };
  fee_customer: { flat: number; percent: number };
  total_fee: { flat: number; percent: string };
  minimum_fee: number;
  maximum_fee: number;
  icon_url: string;
  active: boolean;
};

export type TripayCreateInput = {
  method: string;
  merchantRef: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  orderItems: { name: string; price: number; quantity: number }[];
  callbackUrl?: string;
  returnUrl?: string;
  expiredHours?: number;
};

export type TripayCreateResult = {
  reference: string;
  merchantRef: string;
  payment_method: string;
  payment_name: string;
  amount: number;
  fee_merchant: number;
  fee_customer: number;
  total_fee: number;
  amount_received: number;
  pay_code: string;
  pay_url: string;
  checkout_url: string;
  status: string;
  expired_time: number;
  qr_url?: string;
  qr_string?: string;
  instructions?: any[];
};

type Creds = { baseUrl: string; apiKey: string; privateKey: string; merchantCode: string };

const CONFIG_TTL_MS = 60_000;

@Injectable()
export class TripayService {
  private readonly log = new Logger(TripayService.name);
  private cachedCreds: Creds | null = null;
  private cachedAt = 0;

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  // DB app_config takes precedence; .env as fallback so existing deploy tetap kompatibel
  private async getCreds(): Promise<Creds> {
    if (this.cachedCreds && Date.now() - this.cachedAt < CONFIG_TTL_MS) return this.cachedCreds;

    const rows = await this.prisma.$queryRaw<{ key: string; value: unknown }[]>`
      SELECT key, value FROM app_config WHERE key IN
        ('payment.tripay_base_url', 'payment.tripay_api_key', 'payment.tripay_private_key', 'payment.tripay_merchant_code')
    `;
    const map = new Map<string, string>();
    for (const r of rows) {
      const v = r.value;
      const s = typeof v === 'string' ? v : (v == null ? '' : String(v));
      map.set(r.key, s);
    }
    const creds: Creds = {
      baseUrl: map.get('payment.tripay_base_url') || this.config.get<string>('TRIPAY_BASE_URL') || 'https://tripay.co.id/api',
      apiKey: map.get('payment.tripay_api_key') || this.config.get<string>('TRIPAY_API_KEY') || '',
      privateKey: map.get('payment.tripay_private_key') || this.config.get<string>('TRIPAY_PRIVATE_KEY') || '',
      merchantCode: map.get('payment.tripay_merchant_code') || this.config.get<string>('TRIPAY_MERCHANT_CODE') || '',
    };
    this.cachedCreds = creds;
    this.cachedAt = Date.now();
    return creds;
  }

  invalidateCache(): void { this.cachedCreds = null; }

  async isConfigured(): Promise<boolean> {
    const c = await this.getCreds();
    return !!(c.apiKey && c.privateKey && c.merchantCode);
  }

  async createTransaction(input: TripayCreateInput): Promise<TripayCreateResult> {
    const c = await this.getCreds();
    if (!(c.apiKey && c.privateKey && c.merchantCode)) {
      throw new BadRequestException('Tripay belum dikonfigurasi. Set credential di /admin/app-settings.');
    }

    const signature = crypto
      .createHmac('sha256', c.privateKey)
      .update(c.merchantCode + input.merchantRef + input.amount)
      .digest('hex');

    const expiredSec = (input.expiredHours ?? 24) * 3600;
    const body = {
      method: input.method,
      merchant_ref: input.merchantRef,
      amount: input.amount,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      order_items: input.orderItems,
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      expired_time: Math.floor(Date.now() / 1000) + expiredSec,
      signature,
    };

    const res = await fetch(`${c.baseUrl}/transaction/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      this.log.error(`tripay create failed: ${JSON.stringify(json)}`);
      throw new BadRequestException(json?.message ?? 'Gagal create transaksi Tripay.');
    }
    return json.data as TripayCreateResult;
  }

  async listChannels(): Promise<TripayChannel[]> {
    const c = await this.getCreds();
    if (!c.apiKey) return [];
    const res = await fetch(`${c.baseUrl}/merchant/payment-channel`, {
      headers: { authorization: `Bearer ${c.apiKey}` },
    });
    const json: any = await res.json().catch(() => ({}));
    return (json?.data as TripayChannel[]) ?? [];
  }

  async verifyCallbackSignature(rawBody: string, headerSignature: string | undefined): Promise<boolean> {
    if (!headerSignature) return false;
    const c = await this.getCreds();
    const computed = crypto.createHmac('sha256', c.privateKey).update(rawBody).digest('hex');
    return computed === headerSignature;
  }
}

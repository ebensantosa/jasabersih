import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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
  method: string;            // BCAVA, BRIVA, QRIS, OVO, DANA, etc
  merchantRef: string;       // our internal payment id
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  orderItems: { name: string; price: number; quantity: number }[];
  callbackUrl?: string;
  returnUrl?: string;
  expiredHours?: number;     // default 24
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
  expired_time: number;       // unix seconds
  qr_url?: string;
  qr_string?: string;
  instructions?: any[];
};

@Injectable()
export class TripayService {
  private readonly log = new Logger(TripayService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly privateKey: string;
  private readonly merchantCode: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('TRIPAY_BASE_URL') ?? 'https://tripay.co.id/api';
    this.apiKey = config.get<string>('TRIPAY_API_KEY') ?? '';
    this.privateKey = config.get<string>('TRIPAY_PRIVATE_KEY') ?? '';
    this.merchantCode = config.get<string>('TRIPAY_MERCHANT_CODE') ?? '';
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.privateKey && this.merchantCode);
  }

  // Closed payment: amount fixed, expires
  async createTransaction(input: TripayCreateInput): Promise<TripayCreateResult> {
    if (!this.isConfigured()) throw new BadRequestException('Tripay belum dikonfigurasi.');

    // Signature: HMAC-SHA256(merchant_code + merchant_ref + amount, private_key)
    const signature = crypto
      .createHmac('sha256', this.privateKey)
      .update(this.merchantCode + input.merchantRef + input.amount)
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

    const res = await fetch(`${this.baseUrl}/transaction/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
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
    if (!this.isConfigured()) return [];
    const res = await fetch(`${this.baseUrl}/merchant/payment-channel`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    const json: any = await res.json().catch(() => ({}));
    return (json?.data as TripayChannel[]) ?? [];
  }

  // Validate webhook signature from Tripay (header X-Callback-Signature)
  verifyCallbackSignature(rawBody: string, headerSignature: string | undefined): boolean {
    if (!headerSignature) return false;
    const computed = crypto.createHmac('sha256', this.privateKey).update(rawBody).digest('hex');
    return computed === headerSignature;
  }
}

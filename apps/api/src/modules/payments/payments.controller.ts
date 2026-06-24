import { BadRequestException, Body, Controller, Get, Headers, Logger, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { JobsGateway } from '../jobs/jobs.gateway';
import { PushService } from '../notifications/push.service';
import { TripayService } from './tripay.service';
import { FlipService } from './flip.service';

// Flip returns bill_payment.id (small int) as the canonical payment ID used in callbacks.
// link_id is the bill-level ID which may be a large BigInt in newer Flip API versions.
// We store whichever field matches what Flip sends as bill_link_id in callbacks.
function resolveFlipLinkId(result: any): string {
  const paymentId = result?.bill_payment?.id ?? result?.bill_link_id ?? result?.id;
  const billId = result?.link_id;
  return String(paymentId ?? billId ?? '');
}

type CheckoutMethodGroup = 'qris' | 'virtual_account' | 'bank_transfer' | 'ewallet' | 'retail' | 'credit_card';
type CheckoutSenderBankType = 'virtual_account' | 'qris' | 'wallet_account' | 'bank_transfer' | 'retail' | 'credit_card';

type CheckoutMethodDef = {
  code: string;
  name: string;
  group: CheckoutMethodGroup;
  senderBank: string;
  senderBankType: CheckoutSenderBankType;
  description?: string;
  recommended?: boolean;
};

const CHECKOUT_METHODS: CheckoutMethodDef[] = [
  {
    code: 'QRIS',
    name: 'QRIS',
    group: 'qris',
    senderBank: 'qris',
    senderBankType: 'qris',
    description: 'Semua e-wallet dan mobile banking',
    recommended: true,
  },
  { code: 'BCAVA', name: 'BCA Virtual Account', group: 'virtual_account', senderBank: 'bca', senderBankType: 'virtual_account' },
  { code: 'MANDIRIVA', name: 'Mandiri Virtual Account', group: 'virtual_account', senderBank: 'mandiri', senderBankType: 'virtual_account' },
  { code: 'BRIVA', name: 'BRI Virtual Account', group: 'virtual_account', senderBank: 'bri', senderBankType: 'virtual_account' },
  { code: 'BNIVA', name: 'BNI Virtual Account', group: 'virtual_account', senderBank: 'bni', senderBankType: 'virtual_account' },
  { code: 'CIMBVA', name: 'CIMB Niaga Virtual Account', group: 'virtual_account', senderBank: 'cimb', senderBankType: 'virtual_account' },
  { code: 'PERMATAVA', name: 'Permata Virtual Account', group: 'virtual_account', senderBank: 'permata', senderBankType: 'virtual_account' },
  { code: 'BSIVA', name: 'BSI Virtual Account', group: 'virtual_account', senderBank: 'bsi', senderBankType: 'virtual_account' },
  { code: 'DANAMONVA', name: 'Danamon Virtual Account', group: 'virtual_account', senderBank: 'danamon', senderBankType: 'virtual_account' },
  { code: 'SEABANKVA', name: 'SeaBank Virtual Account', group: 'virtual_account', senderBank: 'seabank', senderBankType: 'virtual_account' },
  { code: 'BTNVA', name: 'BTN Virtual Account', group: 'virtual_account', senderBank: 'btn', senderBankType: 'virtual_account' },
  { code: 'MEGAVA', name: 'Bank Mega Virtual Account', group: 'virtual_account', senderBank: 'mega', senderBankType: 'virtual_account' },
  { code: 'GOPAY', name: 'GoPay', group: 'ewallet', senderBank: 'gopay', senderBankType: 'wallet_account' },
  { code: 'OVO', name: 'OVO', group: 'ewallet', senderBank: 'ovo', senderBankType: 'wallet_account' },
  { code: 'DANA', name: 'DANA', group: 'ewallet', senderBank: 'dana', senderBankType: 'wallet_account' },
  { code: 'SHOPEEPAY', name: 'ShopeePay', group: 'ewallet', senderBank: 'shopeepay', senderBankType: 'wallet_account' },
  { code: 'LINKAJA', name: 'LinkAja', group: 'ewallet', senderBank: 'linkaja', senderBankType: 'wallet_account' },
  { code: 'ALFAMART', name: 'Alfamart', group: 'retail', senderBank: 'alfamart', senderBankType: 'retail', description: 'Bayar langsung di kasir' },
  { code: 'INDOMARET', name: 'Indomaret', group: 'retail', senderBank: 'indomaret', senderBankType: 'retail', description: 'Bayar langsung di kasir' },
  { code: 'CREDIT_CARD', name: 'Kartu Kredit', group: 'credit_card', senderBank: 'credit_card', senderBankType: 'credit_card', description: 'Pembayaran kartu via halaman pembayaran yang aman' },
];

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  private readonly log = new Logger(PaymentsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripay: TripayService,
    private readonly flip: FlipService,
    private readonly push: PushService,
    private readonly jobs: JobsGateway,
  ) {}

  private findFirstNestedString(value: unknown, matcher: (key: string, str: string) => boolean): string | undefined {
    const visit = (node: unknown): string | undefined => {
      if (!node || typeof node !== 'object') return undefined;
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = visit(item);
          if (found) return found;
        }
        return undefined;
      }
      for (const [key, child] of Object.entries(node)) {
        if (typeof child === 'string' && matcher(key, child)) return child;
        const found = visit(child);
        if (found) return found;
      }
      return undefined;
    };
    return visit(value);
  }

  private extractQrNative(result: any): { qrString: string | null; qrUrl: string | null; nmid: string | null } {
    const billPayment = result?.bill_payment ?? {};
    const receiverAcc = billPayment?.receiver_bank_account ?? {};

    const qrString =
      receiverAcc?.qr_code_data
      ?? receiverAcc?.qr_string
      ?? billPayment?.qr_code_data
      ?? billPayment?.qr_string
      ?? billPayment?.qrcode_string
      ?? result?.qr_code_data
      ?? result?.qr_string
      ?? this.findFirstNestedString(result, (key, str) => {
        const k = key.toLowerCase();
        return k.includes('qr') && /^000201/i.test(str.trim());
      })
      ?? null;

    const qrUrl =
      receiverAcc?.qr_url
      ?? receiverAcc?.qr_image_url
      ?? billPayment?.qr_url
      ?? billPayment?.qr_image_url
      ?? result?.qr_url
      ?? result?.qr_image_url
      ?? this.findFirstNestedString(result, (key, str) => {
        const k = key.toLowerCase();
        return k.includes('qr') && /^https?:\/\//i.test(str.trim());
      })
      ?? null;

    const nmid =
      receiverAcc?.nmid
      ?? billPayment?.nmid
      ?? result?.nmid
      ?? this.findFirstNestedString(result, (key, str) => key.toLowerCase() === 'nmid')
      ?? null;

    return { qrString, qrUrl, nmid };
  }

  private resolvePaymentExpiry(result: any): Date {
    const raw = result?.expired_date ?? result?.expired_at ?? result?.bill_payment?.expired_date ?? result?.bill_payment?.expired_at;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  private mapDirectPaymentRow(row: Record<string, unknown>) {
    const meta = (row.extraMetadata && typeof row.extraMetadata === 'object' ? row.extraMetadata : {}) as Record<string, unknown>;
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt));
    const storedExpiredAt = row.expiredAt instanceof Date ? row.expiredAt : (row.expiredAt ? new Date(String(row.expiredAt)) : null);
    const resolvedExpiredAt =
      storedExpiredAt && !Number.isNaN(storedExpiredAt.getTime())
        ? storedExpiredAt.toISOString()
        : createdAt && !Number.isNaN(createdAt.getTime())
          ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null;
    return {
      paymentId: String(row.id),
      provider: 'flip',
      amount: Number(row.amount ?? 0),
      senderBank: typeof meta.senderBank === 'string' ? meta.senderBank : null,
      senderBankType: typeof meta.senderBankType === 'string' ? meta.senderBankType : null,
      accountNumber: typeof row.payCode === 'string' ? row.payCode : null,
      qrString: typeof meta.qrString === 'string' ? meta.qrString : null,
      qrUrl: typeof meta.qrUrl === 'string' ? meta.qrUrl : null,
      nmid: typeof meta.nmid === 'string' ? meta.nmid : null,
      walletUrl: typeof meta.walletUrl === 'string' ? meta.walletUrl : null,
      paymentUrl: typeof row.paymentUrl === 'string' ? row.paymentUrl : null,
      expiredAt: resolvedExpiredAt,
      linkId: typeof row.flipLinkId === 'string' || typeof row.flipLinkId === 'number' ? row.flipLinkId : null,
      fellBackToCheckout: Boolean(meta.fellBackToCheckout),
      reused: true,
    };
  }

  private normalizeDisabledMethodCode(code: string, type?: CheckoutSenderBankType): string {
    const normalized = String(code ?? '').trim().toLowerCase();
    if (type === 'virtual_account') {
      const vaMap: Record<string, string> = {
        bca: 'BCAVA',
        mandiri: 'MANDIRIVA',
        bri: 'BRIVA',
        bni: 'BNIVA',
        cimb: 'CIMBVA',
        permata: 'PERMATAVA',
        bsi: 'BSIVA',
        seabank: 'SEABANKVA',
      };
      return vaMap[normalized] ?? normalized.toUpperCase();
    }
    if (type === 'qris') return 'QRIS';
    if (type === 'wallet_account') {
      const walletMap: Record<string, string> = {
        ovo: 'OVO',
        gopay: 'GOPAY',
        dana: 'DANA',
        shopeepay: 'SHOPEEPAY',
        shopeepay_app: 'SHOPEEPAY',
        linkaja: 'LINKAJA',
        linkaja_app: 'LINKAJA',
        qris: 'QRIS',
      };
      return walletMap[normalized] ?? normalized.toUpperCase();
    }
    if (type === 'retail') {
      const retailMap: Record<string, string> = {
        alfamart: 'ALFAMART',
        indomaret: 'INDOMARET',
      };
      return retailMap[normalized] ?? normalized.toUpperCase();
    }
    if (type === 'credit_card') return 'CREDIT_CARD';
    return normalized.toUpperCase();
  }

  private async getDisabledMethods(): Promise<Set<string>> {
    const cfg = await this.prisma.$queryRaw<{ value: unknown }[]>`
      SELECT value FROM app_config WHERE key = 'payment.disabled_methods' LIMIT 1
    `;
    const value = cfg[0]?.value;
    let disabled: string[] = [];
    if (Array.isArray(value)) {
      disabled = value.filter((v): v is string => typeof v === 'string');
    } else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) disabled = parsed.filter((v): v is string => typeof v === 'string');
      } catch {
        disabled = [];
      }
    }
    return new Set(disabled.map((v) => v.toUpperCase()));
  }

  private async assertMethodEnabled(code: string, type: CheckoutSenderBankType) {
    const disabled = await this.getDisabledMethods();
    const normalizedMethodCode = this.normalizeDisabledMethodCode(code, type);
    if (disabled.has(normalizedMethodCode)) {
      throw new BadRequestException('Metode pembayaran ini sedang dinonaktifkan sementara. Mohon pilih metode lain.');
    }
  }

  // Kata kunci error dari Flip yang menandakan maintenance / channel belum aktif
  private isMaintenanceError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return lower.includes('maintenance') || lower.includes('pemeliharaan') ||
           lower.includes('not available') || lower.includes('not active') ||
           lower.includes('unavailable') || lower.includes('belum aktif') ||
           lower.includes('channel is currently') || lower.includes('bank sedang') ||
           lower.includes('suspended') || lower.includes('disabled by provider');
  }

  // Auto-disable method di payment.active_channels + catat expiry (2 jam)
  private async autoDisableMethod(senderBank: string, reason: string): Promise<void> {
    try {
      const row = await this.prisma.$queryRaw<{ value: any }[]>`
        SELECT value FROM app_config WHERE key = 'payment.active_channels' LIMIT 1
      `;
      const current: Record<string, any> = (row[0]?.value ?? {}) as any;
      const expiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      current[senderBank] = { active: false, reason, autoDisabledAt: new Date().toISOString(), autoReEnableAt: expiry };
      await this.prisma.$executeRaw`
        INSERT INTO app_config (key, value) VALUES ('payment.active_channels', ${JSON.stringify(current)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(current)}::jsonb, updated_at = NOW()
      `;
      this.log.warn(`[AutoDisable] ${senderBank} disabled — ${reason} — re-enable at ${expiry}`);
    } catch (e: any) {
      this.log.error(`autoDisableMethod failed: ${e?.message}`);
    }
  }

  // Cron setiap 30 menit: re-enable method yang sudah melewati autoReEnableAt
  @Cron('0 */30 * * * *')
  async autoReEnableExpiredMethods(): Promise<void> {
    try {
      const row = await this.prisma.$queryRaw<{ value: any }[]>`
        SELECT value FROM app_config WHERE key = 'payment.active_channels' LIMIT 1
      `;
      const current: Record<string, any> = (row[0]?.value ?? {}) as any;
      let changed = false;
      for (const [bank, cfg] of Object.entries(current)) {
        if (cfg?.autoReEnableAt && new Date(cfg.autoReEnableAt) <= new Date()) {
          delete current[bank];
          changed = true;
          this.log.log(`[AutoReEnable] ${bank} re-enabled after maintenance window`);
        }
      }
      if (changed) {
        await this.prisma.$executeRaw`
          INSERT INTO app_config (key, value) VALUES ('payment.active_channels', ${JSON.stringify(current)}::jsonb)
          ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(current)}::jsonb, updated_at = NOW()
        `;
      }
    } catch (e: any) {
      this.log.error(`autoReEnableExpiredMethods failed: ${e?.message}`);
    }
  }

  private toFlipSenderBankType(senderBank: string, senderBankType: CheckoutSenderBankType): CheckoutSenderBankType {
    if (senderBank === 'qris' && senderBankType === 'qris') {
      return 'wallet_account';
    }
    return senderBankType;
  }

  // ============ FLIP ============

  // Create Flip bill for a booking. Returns checkout URL (open in WebView).
  // Manual sync status payment dari Flip - customer pull-to-refresh.
  // Polling juga jalan via cron tiap 3 menit, ini supaya user dapat status segera.
  @Post('flip/sync/:bookingId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async flipSyncPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
  ) {
    const rows = await this.prisma.$queryRaw<{ id: string; status: string; flip_bill_id: string | null; user_id: string; amount: number }[]>`
      SELECT id, status, flip_bill_id, user_id, amount FROM payments
       WHERE booking_id = ${bookingId}::uuid AND user_id = ${user.id}::uuid
       ORDER BY created_at DESC LIMIT 1
    `;
    const p = rows[0];
    if (!p) throw new NotFoundException('Payment tidak ditemukan.');
    if (p.status !== 'pending') return { ok: true, status: p.status, message: 'Status sudah final.' };
    if (!p.flip_bill_id) return { ok: false, status: p.status, message: 'Belum ada Flip bill ID.' };
    const result = await this.flip.getAcceptPaymentStatus(p.flip_bill_id);
    if (!result) return { ok: false, status: p.status, message: 'Gagal cek status Flip.' };
    const statusRaw = String(result?.status ?? '').toUpperCase();
    const next = statusRaw === 'SUCCESSFUL' || statusRaw === 'PAID' || statusRaw === 'COMPLETED' ? 'paid'
      : statusRaw === 'FAILED' || statusRaw === 'CANCELLED' ? 'failed'
      : statusRaw === 'EXPIRED' ? 'expired' : null;
    if (!next) return { ok: true, status: p.status, message: `Flip masih ${statusRaw}.` };
    // Atomic update
    await this.prisma.$executeRaw`
      UPDATE payments SET status = ${next}, callback_payload = ${JSON.stringify({ ...result, _source: 'manual-sync' })}::jsonb
       WHERE id = ${p.id}::uuid AND status = 'pending'
    `;
    if (next === 'paid') {
      await this.prisma.$executeRaw`
        UPDATE bookings SET status = 'searching', paid_at = NOW()
         WHERE id = ${bookingId}::uuid AND status = 'pending_payment'
      `;
    }
    return { ok: true, status: next };
  }

  @Post('flip/create')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async flipCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { bookingId: string },
  ) {
    if (!body?.bookingId) throw new BadRequestException('bookingId wajib.');

    const rows = await this.prisma.$queryRaw<{ id: string; customer_id: string; total_amount: number; status: string }[]>`
      SELECT id, customer_id, total_amount, status FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new NotFoundException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu.');
    if (b.status !== 'pending_payment') throw new BadRequestException(`Booking status ${b.status} — tidak bisa create payment.`);

    const userRows = await this.prisma.$queryRaw<{ name: string | null; email: string | null; phone: string }[]>`
      SELECT name, email, phone FROM users WHERE id = ${user.id}::uuid LIMIT 1
    `;
    const u = userRows[0];
    if (!u) throw new NotFoundException('User tidak ditemukan.');

    const merchantRef = `JBSIH-${b.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const amount = Number(b.total_amount);

    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO payments (booking_id, user_id, amount, payment_method, status, provider, tripay_merchant_ref)
      VALUES (${b.id}::uuid, ${user.id}::uuid, ${amount}::bigint, 'flip', 'pending', 'flip', ${merchantRef})
      RETURNING id
    `;
    const paymentId = inserted[0]!.id;

    try {
      const result = await this.flip.createBill({
        title: `JasaBersih · Booking ${b.id.slice(0, 8)}`,
        amount,
        refId: merchantRef,
        customerName: u.name ?? 'JasaBersih Customer',
        customerEmail: u.email ?? `${u.phone}@jasabersih.com`,
        customerPhone: u.phone,
        redirectUrl: `https://jasabersih.com/booking/${b.id}`,
      });

      // Flip returns link_url without protocol (e.g. "flip.id/pwf-sandbox/..").
      // Normalize to absolute https URL so browser/WebView opens correctly.
      const checkoutUrl = /^https?:\/\//i.test(result.link_url)
        ? result.link_url
        : `https://${result.link_url}`;

      await this.prisma.$executeRaw`
        UPDATE payments
           SET flip_link_id = ${resolveFlipLinkId(result)},
               payment_url = ${checkoutUrl}
         WHERE id = ${paymentId}::uuid
      `;

      return {
        paymentId,
        provider: 'flip',
        amount,
        checkoutUrl,
        linkId: result.link_id,
      };
    } catch (e) {
      await this.prisma.$executeRaw`UPDATE payments SET status = 'failed' WHERE id = ${paymentId}::uuid`;
      throw e;
    }
  }

  // Direct API: VA / QRIS — return native instructions (no WebView).
  @Post('flip/create-direct')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async flipCreateDirect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { bookingId: string; senderBank: string; senderBankType: CheckoutSenderBankType; useCredit?: boolean },
  ) {
    if (!body?.bookingId || !body?.senderBank || !body?.senderBankType) {
      throw new BadRequestException('bookingId, senderBank, senderBankType wajib.');
    }
    await this.assertMethodEnabled(body.senderBank, body.senderBankType);

    const rows = await this.prisma.$queryRaw<{ id: string; customer_id: string; total_amount: number; status: string }[]>`
      SELECT id, customer_id, total_amount, status FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new NotFoundException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu.');
    if (b.status !== 'pending_payment') throw new BadRequestException(`Status ${b.status} tidak bisa bayar.`);

    const userRows = await this.prisma.$queryRaw<{ name: string | null; email: string | null; phone: string }[]>`
      SELECT name, email, phone FROM users WHERE id = ${user.id}::uuid LIMIT 1
    `;
    const u = userRows[0]!;
    const merchantRef = `JBSIH-${b.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const total = Number(b.total_amount);

    if (!body.useCredit) {
      const reusable = await this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, amount, pay_code AS "payCode", payment_url AS "paymentUrl",
               flip_link_id AS "flipLinkId", expired_at AS "expiredAt",
               created_at AS "createdAt", extra_metadata AS "extraMetadata"
          FROM payments
         WHERE booking_id = ${b.id}::uuid
           AND user_id = ${user.id}::uuid
           AND payment_method = ${`flip_${body.senderBankType}_${body.senderBank}`}
           AND provider = 'flip'
           AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1
      `;
      const existing = reusable[0];
      if (existing) {
        const mapped = this.mapDirectPaymentRow(existing);
        const expiryTime = mapped.expiredAt ? new Date(mapped.expiredAt).getTime() : 0;
        if (expiryTime > Date.now()) return mapped;
      }
    }

    // Pakai saldo (partial): kurangi tagihan PG sebesar min(balance, total)
    let creditUsed = 0;
    if (body.useCredit) {
      const balRow = await this.prisma.$queryRawUnsafe<{ b: number }[]>(
        `SELECT COALESCE(SUM(CASE WHEN account_type IN ('refund_credit','topup','earnings') AND status='CLEARED' THEN amount ELSE 0 END),0)
              - COALESCE(SUM(CASE WHEN account_type IN ('credit_use','withdrawal','admin_debit') AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END),0) AS b
           FROM wallet_ledger_entries WHERE user_id = $1::uuid`,
        user.id,
      );
      const balance = Number(balRow[0]?.b ?? 0);
      creditUsed = Math.min(balance, total);
    }
    const amount = total - creditUsed;
    if (amount <= 0) throw new BadRequestException('Total bayar 0 — gunakan endpoint /bookings/:id/pay dengan useCredit untuk pelunasan pakai saldo penuh.');
    const methodLabel = `flip_${body.senderBankType}_${body.senderBank}`;

    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO payments (booking_id, user_id, amount, payment_method, status, provider, tripay_merchant_ref)
      VALUES (${b.id}::uuid, ${user.id}::uuid, ${amount}::bigint, ${methodLabel}, 'pending', 'flip', ${merchantRef})
      RETURNING id
    `;
    const paymentId = inserted[0]!.id;

    try {
      let result: any;
      let fellBackToCheckout = false;
      const flipSenderBankType = this.toFlipSenderBankType(body.senderBank, body.senderBankType);
      try {
        result = await this.flip.createDirectBill({
          title: `JasaBersih · Booking ${b.id.slice(0, 8)}`,
          amount,
          refId: merchantRef,
          customerName: u.name ?? 'JasaBersih Customer',
          customerEmail: u.email ?? `${u.phone}@jasabersih.com`,
          customerPhone: u.phone,
          redirectUrl: `https://jasabersih.com/booking/${b.id}`,
          senderBank: body.senderBank,
          senderBankType: flipSenderBankType,
        });
      } catch (directErr: any) {
        const errMsg = directErr?.message ?? '';
        // Kalau Flip return maintenance/unavailable error → auto-disable method ini 2 jam
        if (this.isMaintenanceError(errMsg)) {
          await this.autoDisableMethod(body.senderBank, errMsg.slice(0, 120));
          throw new BadRequestException(`${body.senderBank.toUpperCase()} sedang maintenance. Silakan pilih metode lain — kami sudah otomatis sembunyikan sementara.`);
        }
        // Fallback: kalau direct mode error (Flip API changed), pakai hosted checkout page.
        this.flipLog.warn(`createDirect failed (${errMsg}), falling back to hosted checkout`);
        result = await this.flip.createBill({
          title: `JasaBersih · Booking ${b.id.slice(0, 8)}`,
          amount,
          refId: merchantRef,
          customerName: u.name ?? 'JasaBersih Customer',
          customerEmail: u.email ?? `${u.phone}@jasabersih.com`,
          customerPhone: u.phone,
          redirectUrl: `https://jasabersih.com/booking/${b.id}`,
        });
        fellBackToCheckout = true;
      }

      // Some Flip direct responses don't include qr_code_data/account_number on first create.
      // Try fetching bill detail by link_id (best-effort) to get the data we need for native UI.
      if (result?.link_id) {
        try {
          const detail = await this.flip.getBillDetail(result.link_id);
          // Merge any qr_code_data / account_number found in detail
          if (detail?.bill_payment) {
            result.bill_payment = { ...(result.bill_payment ?? {}), ...detail.bill_payment };
          }
          // Some responses put data at top-level too
          for (const k of ['qr_code_data', 'qr_string', 'qrcode_string', 'account_number']) {
            if (detail?.[k] && !result?.[k]) result[k] = detail[k];
          }
        } catch (e: any) {
          this.flipLog.warn(`getBillDetail failed for link_id ${result.link_id}: ${e?.message ?? e}`);
        }
      }

      const billPayment = result?.bill_payment ?? {};
      const receiverAcc = billPayment?.receiver_bank_account ?? {};
      const accountNumber: string | undefined =
        receiverAcc?.account_number
        ?? billPayment?.account_number
        ?? result?.account_number;
      const { qrString, qrUrl, nmid } = this.extractQrNative(result);
      const walletUrl: string | undefined =
        billPayment?.customer?.payment_url
        ?? billPayment?.redirect_url
        ?? billPayment?.payment_url
        ?? billPayment?.url
        ?? result?.customer_url
        ?? result?.payment_url;
      const expiresAt = this.resolvePaymentExpiry(result);
      const expiredAt = expiresAt.toISOString();

      this.flipLog.log(`flip parsed: qrString=${qrString ? 'YES('+qrString.length+'chars)' : 'NO'} qrUrl=${qrUrl ? 'YES' : 'NO'} nmid=${nmid ?? 'NO'} accountNumber=${accountNumber ?? 'NO'} linkId=${result?.link_id}`);

      // Flip API sukses — baru debit wallet (rollback-safe: kalau Flip gagal, catch block mark failed tanpa insert ledger)
      if (creditUsed > 0) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
           VALUES ($1::uuid, 'credit_use', $2, 'booking', $3::uuid, 'CLEARED', NOW(), $4)`,
          user.id, creditUsed, b.id, `Potongan saldo untuk booking ${b.id.slice(0, 8)}`,
        );
      }

      await this.prisma.$executeRaw`
        UPDATE payments
           SET flip_link_id = ${resolveFlipLinkId(result)},
               pay_code = ${accountNumber ?? null},
               payment_url = ${result.link_url ?? null},
               expired_at = ${expiresAt},
               extra_metadata = COALESCE(extra_metadata, '{}'::jsonb) || ${JSON.stringify({
                 senderBank: body.senderBank,
                 senderBankType: body.senderBankType,
                 qrString: qrString ?? null,
                 qrUrl: qrUrl ?? null,
                 nmid: nmid ?? null,
                 walletUrl: walletUrl ?? null,
                 fellBackToCheckout,
               })}::jsonb
         WHERE id = ${paymentId}::uuid
      `;

      const checkoutUrl = result.link_url
        ? (/^https?:\/\//i.test(result.link_url) ? result.link_url : `https://${result.link_url}`)
        : null;
      return {
        paymentId,
        provider: 'flip',
        amount,
        senderBank: body.senderBank,
        senderBankType: body.senderBankType,
        accountNumber: accountNumber ?? null,
        qrString: qrString ?? null,
        qrUrl: qrUrl ?? null,
        nmid: nmid ?? null,
        walletUrl: walletUrl ?? null,
        paymentUrl: checkoutUrl,
        expiredAt,
        linkId: result.link_id,
        fellBackToCheckout,
      };
    } catch (e) {
      await this.prisma.$executeRaw`UPDATE payments SET status = 'failed' WHERE id = ${paymentId}::uuid`;
      throw e;
    }
  }

  // Extra payment (upcharge / tip) via Flip. Sama struktur dgn /flip/create-direct
  // tapi: payment_type ditandai + extra_metadata simpan upchargeId/tipAmount.
  // Callback finalize-nya hook ke approveUpcharge / tip ledger insert.
  @Post('flip/create-direct-extra')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async flipCreateDirectExtra(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      bookingId: string;
      type: 'upcharge' | 'tip';
      upchargeId?: string;
      tipAmount?: number;
      senderBank: string;
      senderBankType: CheckoutSenderBankType;
      useCredit?: boolean;
    },
  ) {
    if (!body?.bookingId || !body?.senderBank || !body?.senderBankType || !body?.type) {
      throw new BadRequestException('bookingId, type, senderBank, senderBankType wajib.');
    }
    if (body.type === 'upcharge' && !body.upchargeId) throw new BadRequestException('upchargeId wajib untuk upcharge.');
    if (body.type === 'tip' && (!body.tipAmount || body.tipAmount <= 0)) throw new BadRequestException('tipAmount wajib > 0 untuk tip.');
    await this.assertMethodEnabled(body.senderBank, body.senderBankType);

    const bRows = await this.prisma.$queryRaw<{ id: string; customer_id: string; cleaner_id: string | null; status: string }[]>`
      SELECT id, customer_id, cleaner_id, status FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = bRows[0];
    if (!b) throw new NotFoundException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu.');

    let amount = 0;
    let extra: any = { type: body.type, bookingId: body.bookingId };
    if (body.type === 'upcharge') {
      const uRows = await this.prisma.$queryRaw<{ id: string; amount: number; status: string }[]>`
        SELECT id, amount, status FROM booking_upcharges
         WHERE id = ${body.upchargeId}::uuid AND booking_id = ${body.bookingId}::uuid LIMIT 1
      `;
      const u = uRows[0];
      if (!u) throw new NotFoundException('Upcharge tidak ditemukan.');
      if (u.status !== 'pending') throw new BadRequestException('Upcharge sudah diputuskan.');
      amount = Number(u.amount);
      extra = { ...extra, upchargeId: body.upchargeId };
    } else {
      if (!b.cleaner_id) throw new BadRequestException('Belum ada cleaner untuk dikasih tip.');
      amount = Number(body.tipAmount);
      extra = { ...extra, tipAmount: amount, cleanerId: b.cleaner_id };
    }

    const userRows = await this.prisma.$queryRaw<{ name: string | null; email: string | null; phone: string }[]>`
      SELECT name, email, phone FROM users WHERE id = ${user.id}::uuid LIMIT 1
    `;
    const u = userRows[0]!;
    const merchantRef = `JBSIH-${body.type.toUpperCase()}-${b.id.slice(0, 8)}-${Date.now().toString(36)}`;

    if (!body.useCredit) {
      const reusable = await this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT id, amount, pay_code AS "payCode", payment_url AS "paymentUrl",
               flip_link_id AS "flipLinkId", expired_at AS "expiredAt",
               created_at AS "createdAt", extra_metadata AS "extraMetadata"
          FROM payments
         WHERE booking_id = ${b.id}::uuid
           AND user_id = ${user.id}::uuid
           AND payment_method = ${`flip_${body.senderBankType}_${body.senderBank}`}
           AND provider = 'flip'
           AND status = 'pending'
           AND payment_type = ${body.type}
         ORDER BY created_at DESC
         LIMIT 1
      `;
      const existing = reusable[0];
      if (existing) {
        const mapped = this.mapDirectPaymentRow(existing);
        const expiryTime = mapped.expiredAt ? new Date(mapped.expiredAt).getTime() : 0;
        if (expiryTime > Date.now()) return mapped;
      }
    }

    // Pakai saldo (partial): kurangi tagihan PG sebesar min(balance, amount)
    let creditUsed = 0;
    if (body.useCredit) {
      const balRow = await this.prisma.$queryRawUnsafe<{ b: number }[]>(
        `SELECT COALESCE(SUM(CASE WHEN account_type IN ('refund_credit','topup','earnings') AND status='CLEARED' THEN amount ELSE 0 END),0)
              - COALESCE(SUM(CASE WHEN account_type IN ('credit_use','withdrawal','admin_debit') AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END),0) AS b
           FROM wallet_ledger_entries WHERE user_id = $1::uuid`,
        user.id,
      );
      const balance = Number(balRow[0]?.b ?? 0);
      creditUsed = Math.min(balance, amount);
      if (creditUsed >= amount) {
        // Wallet covers full - skip Flip, langsung finalize.
        if (body.type === 'upcharge') {
          await this.finalizeUpcharge(user.id, body.bookingId, body.upchargeId!);
        } else {
          await this.finalizeTip(user.id, body.bookingId, b.cleaner_id!, amount);
        }
        return { ok: true, paidViaWallet: true, walletDeducted: amount, walletRemaining: balance - amount };
      }
      if (creditUsed > 0) {
        extra = { ...extra, creditUsed };
      }
    }
    const flipAmount = amount - creditUsed;
    if (flipAmount <= 0) throw new BadRequestException('Total bayar 0.');
    const methodLabel = `flip_${body.senderBankType}_${body.senderBank}`;

    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO payments (booking_id, user_id, amount, payment_method, status, provider, tripay_merchant_ref, payment_type, extra_metadata)
      VALUES (${b.id}::uuid, ${user.id}::uuid, ${flipAmount}::bigint, ${methodLabel}, 'pending', 'flip', ${merchantRef}, ${body.type}, ${JSON.stringify(extra)}::jsonb)
      RETURNING id
    `;
    const paymentId = inserted[0]!.id;

    try {
      let result: any;
      const flipSenderBankType = this.toFlipSenderBankType(body.senderBank, body.senderBankType);
      try {
        result = await this.flip.createDirectBill({
          title: `JasaBersih · ${body.type === 'upcharge' ? 'Charge Tambahan' : 'Tip Cleaner'} ${b.id.slice(0, 8)}`,
          amount: flipAmount,
          refId: merchantRef,
          customerName: u.name ?? 'JasaBersih Customer',
          customerEmail: u.email ?? `${u.phone}@jasabersih.com`,
          customerPhone: u.phone,
          redirectUrl: `https://jasabersih.com/booking/${b.id}`,
          senderBank: body.senderBank,
          senderBankType: flipSenderBankType,
        });
      } catch (directErr: any) {
        const extraErrMsg = directErr?.message ?? '';
        if (this.isMaintenanceError(extraErrMsg)) {
          await this.autoDisableMethod(body.senderBank, extraErrMsg.slice(0, 120));
          throw new BadRequestException(`${body.senderBank.toUpperCase()} sedang maintenance. Silakan pilih metode lain.`);
        }
        this.flipLog.warn(`createDirect extra failed (${extraErrMsg}), fallback`);
        result = await this.flip.createBill({
          title: `JasaBersih · ${body.type === 'upcharge' ? 'Charge Tambahan' : 'Tip'} ${b.id.slice(0, 8)}`,
          amount: flipAmount,
          refId: merchantRef,
          customerName: u.name ?? 'JasaBersih Customer',
          customerEmail: u.email ?? `${u.phone}@jasabersih.com`,
          customerPhone: u.phone,
          redirectUrl: `https://jasabersih.com/booking/${b.id}`,
        });
      }

      if (result?.link_id) {
        try {
          const detail = await this.flip.getBillDetail(result.link_id);
          if (detail?.bill_payment) result.bill_payment = { ...(result.bill_payment ?? {}), ...detail.bill_payment };
          for (const k of ['qr_code_data', 'qr_string', 'qrcode_string', 'account_number']) {
            if (detail?.[k] && !result?.[k]) result[k] = detail[k];
          }
        } catch {}
      }

      const billPayment = result?.bill_payment ?? {};
      const receiverAcc = billPayment?.receiver_bank_account ?? {};
      const accountNumber: string | undefined = receiverAcc?.account_number ?? billPayment?.account_number ?? result?.account_number;
      const { qrString, qrUrl, nmid } = this.extractQrNative(result);
      const walletUrl: string | undefined = billPayment?.customer?.payment_url ?? billPayment?.redirect_url ?? billPayment?.payment_url ?? billPayment?.url ?? result?.customer_url ?? result?.payment_url;
      const expiresAt = this.resolvePaymentExpiry(result);
      const expiredAt = expiresAt.toISOString();

      // Flip API sukses — baru debit wallet (rollback-safe)
      if (creditUsed > 0) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
           VALUES ($1::uuid, 'credit_use', $2, $3, $4::uuid, 'CLEARED', NOW(), $5)`,
          user.id, creditUsed, body.type, body.upchargeId ?? body.bookingId,
          `Potongan saldo untuk ${body.type} booking ${b.id.slice(0, 8)}`,
        );
      }

      await this.prisma.$executeRaw`
        UPDATE payments SET flip_link_id = ${resolveFlipLinkId(result)},
              pay_code = ${accountNumber ?? null},
              payment_url = ${result.link_url ?? null},
              expired_at = ${expiresAt},
              extra_metadata = COALESCE(extra_metadata, '{}'::jsonb) || ${JSON.stringify({
                senderBank: body.senderBank,
                senderBankType: body.senderBankType,
                qrString: qrString ?? null,
                qrUrl: qrUrl ?? null,
                nmid: nmid ?? null,
                walletUrl: walletUrl ?? null,
                fellBackToCheckout: false,
              })}::jsonb
         WHERE id = ${paymentId}::uuid
      `;

      return {
        paymentId, provider: 'flip', amount: flipAmount,
        senderBank: body.senderBank, senderBankType: body.senderBankType,
        accountNumber: accountNumber ?? null,
        qrString: qrString ?? null,
        qrUrl: qrUrl ?? null,
        nmid: nmid ?? null,
        walletUrl: walletUrl ?? null,
        paymentUrl: result.link_url ? (/^https?:\/\//i.test(result.link_url) ? result.link_url : `https://${result.link_url}`) : null,
        expiredAt, linkId: result.link_id,
        creditUsed,
      };
    } catch (e) {
      await this.prisma.$executeRaw`UPDATE payments SET status = 'failed' WHERE id = ${paymentId}::uuid`;
      throw e;
    }
  }

  // Helpers untuk finalize wallet-only payment
  private async finalizeUpcharge(userId: string, bookingId: string, upchargeId: string) {
    // Reuse logic dari /bookings/:id/upcharges/:upchargeId/approve - panggil endpoint internal.
    // Sederhana: inline minimal logic agar tidak circular dependency.
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ amount: number; cleaner_id: string }[]>`
        SELECT amount, cleaner_id FROM booking_upcharges WHERE id = ${upchargeId}::uuid AND booking_id = ${bookingId}::uuid AND status = 'pending' LIMIT 1
      `;
      const u = rows[0];
      if (!u) throw new BadRequestException('Upcharge tidak ditemukan/sudah diproses.');
      const amount = Number(u.amount);
      const totalRow = await tx.$queryRaw<{ total_amount: number }[]>`SELECT total_amount FROM bookings WHERE id = ${bookingId}::uuid LIMIT 1`;
      const currentTotal = Number(totalRow[0]?.total_amount ?? 0);
      const profRow = await tx.$queryRaw<{ brings_tools: boolean }[]>`SELECT brings_tools FROM cleaner_profiles WHERE user_id = ${u.cleaner_id}::uuid LIMIT 1`;
      const bringsTools = !!profRow[0]?.brings_tools;
      const tiersRow = await tx.$queryRaw<{ range_min: number | null; range_max: number | null; cleaner_share_no_tools: number; cleaner_share_with_tools: number }[]>`
        SELECT range_min, range_max, cleaner_share_no_tools, cleaner_share_with_tools FROM commission_tiers ORDER BY range_min ASC NULLS FIRST
      `;
      const tier = tiersRow.find((t) => currentTotal >= Number(t.range_min ?? 0) && (t.range_max == null || currentTotal <= Number(t.range_max)));
      const pct = Number((bringsTools ? tier?.cleaner_share_with_tools : tier?.cleaner_share_no_tools) ?? 40);
      const cleanerShare = Math.round(amount * pct / 100);
      const platformFee = amount - cleanerShare;
      await tx.$executeRaw`UPDATE booking_upcharges SET status = 'approved', decided_at = NOW(), decided_by_user_id = ${userId}::uuid WHERE id = ${upchargeId}::uuid`;
      await tx.$executeRaw`UPDATE bookings SET total_amount = total_amount + ${amount}, cleaner_payout = COALESCE(cleaner_payout,0) + ${cleanerShare}, platform_fee = COALESCE(platform_fee,0) + ${platformFee} WHERE id = ${bookingId}::uuid`;
      await tx.$executeRaw`INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description) VALUES (${u.cleaner_id}::uuid, 'earnings', ${cleanerShare}, 'booking', ${bookingId}::uuid, 'PENDING', ${`Upcharge approved — share ${pct}% dari Rp ${amount.toLocaleString('id-ID')}`})`;
    });
  }

  private async finalizeTip(userId: string, bookingId: string, cleanerId: string, amount: number) {
    // Tip masuk ke cleaner earnings (CLEARED langsung, gak ada escrow utk tip) +
    // record di ratings.tip_amount. Kalau rating belum ada, buat row baru tanpa rating value.
    await this.prisma.$executeRaw`
      INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
      VALUES (${cleanerId}::uuid, 'earnings', ${amount}, 'tip', ${bookingId}::uuid, 'CLEARED', NOW(), ${'Tip dari customer'})
    `;
    await this.prisma.$executeRaw`
      INSERT INTO ratings (booking_id, rater_id, ratee_id, tip_amount)
      VALUES (${bookingId}::uuid, ${userId}::uuid, ${cleanerId}::uuid, ${amount})
      ON CONFLICT (booking_id) DO UPDATE SET tip_amount = COALESCE(ratings.tip_amount, 0) + ${amount}
    `;
  }

  // Flip webhook. Flip POSTs application/x-www-form-urlencoded with `data` (JSON)
  // and `token` (validation token). No HMAC — just string-equal token check.
  private readonly flipLog = new Logger('FlipCallback');

  @Post('flip/callback')
  async flipCallback(@Req() req: Request) {
    const body: any = req.body ?? {};
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    this.flipLog.log(`callback received from ${ip} — token=${typeof body.token === 'string' ? body.token.slice(0,8)+'…' : 'missing'} dataLen=${typeof body.data === 'string' ? body.data.length : 0}`);
    const token: string | undefined = typeof body.token === 'string' ? body.token : undefined;
    // Detect Flip's dashboard test button placeholder ("YOUR_VALIDATION_TOKEN…").
    // Real callbacks use the actual validation_token. Test pings get 200 OK without side effects.
    if (typeof token === 'string' && /^YOUR_VAL/i.test(token)) {
      this.flipLog.log(`callback: dashboard test ping from ${ip} (placeholder token) — replying OK without processing`);
      return { ok: true, test: true };
    }
    if (!(await this.flip.verifyCallbackToken(token))) {
      this.flipLog.warn(`token verification FAILED from ${ip}`);
      throw new BadRequestException('Invalid Flip token');
    }
    let data: any;
    try {
      data = typeof body.data === 'string' ? JSON.parse(body.data) : body.data;
    } catch { throw new BadRequestException('Invalid JSON in data'); }
    if (!data) throw new BadRequestException('data missing');

    const linkId: string | number | undefined = data.bill_link_id ?? data.id;
    const status: string | undefined = data.status; // SUCCESSFUL | FAILED | PENDING | CANCELLED
    const referenceId: string | undefined = typeof data.reference_id === 'string' ? data.reference_id : undefined;
    this.flipLog.log(`callback verified — linkId=${linkId} status=${status} refId=${referenceId ?? 'none'}`);

    if (!linkId) return { ok: false, reason: 'no link id' };

    let payRows = await this.prisma.$queryRaw<{ id: string; booking_id: string | null; user_id: string | null; status: string; amount: number; payment_type: string | null; extra_metadata: any }[]>`
      SELECT id, booking_id, user_id, status, amount, payment_type, extra_metadata FROM payments WHERE flip_link_id = ${String(linkId)} LIMIT 1
    `;
    // Fallback: Flip may store different link_id formats; match by reference_id (our merchant ref) as safety net.
    if (!payRows[0] && referenceId) {
      payRows = await this.prisma.$queryRaw<{ id: string; booking_id: string | null; user_id: string | null; status: string; amount: number; payment_type: string | null; extra_metadata: any }[]>`
        SELECT id, booking_id, user_id, status, amount, payment_type, extra_metadata FROM payments WHERE tripay_merchant_ref = ${referenceId} AND provider = 'flip' LIMIT 1
      `;
      if (payRows[0]) {
        // Repair the stored flip_link_id so future lookups work correctly.
        await this.prisma.$executeRaw`UPDATE payments SET flip_link_id = ${String(linkId)} WHERE id = ${payRows[0].id}::uuid`;
        this.flipLog.log(`callback: matched by refId=${referenceId} (flip_link_id was stale/mismatched) — repaired to ${linkId}`);
      }
    }
    const p = payRows[0];
    if (!p) { this.flipLog.warn(`payment not found for linkId=${linkId} refId=${referenceId ?? 'none'} (this is expected for Flip test buttons)`); return { ok: false, reason: 'payment not found' }; }

    const raw = JSON.stringify(data);
    // Amount mismatch guard — Flip QRIS sometimes accepts arbitrary amount if
    // the QR isn't amount-locked. Reject if paid amount != expected.
    const paidAmount = Number(data?.amount ?? data?.bill_payment?.amount ?? 0);
    const expected = Number(p.amount);

    // Guard: amount=0/undefined — jangan proses sebagai payment sukses
    if (status === 'SUCCESSFUL' && (!paidAmount || paidAmount <= 0)) {
      this.flipLog.warn(`callback: SUCCESSFUL but paidAmount=${paidAmount} — skipping (possible Flip test/bogus callback)`);
      return { received: true };
    }

    if (status === 'SUCCESSFUL' && paidAmount > 0 && Math.abs(paidAmount - expected) > 1) {
      // Mark as disputed/underpaid — needs admin attention, do NOT advance booking.
      await this.prisma.$executeRaw`
        UPDATE payments
           SET status = 'underpaid',
               callback_payload = ${raw}::jsonb,
               admin_notes = 'Paid ' || ${paidAmount}::text || ' but expected ' || ${expected}::text
         WHERE id = ${p.id}::uuid
      `;
      if (p.user_id) {
        void this.push.send({
          userId: p.user_id, channel: 'booking',
          title: 'Pembayaran kurang',
          body: `Kamu bayar Rp ${paidAmount.toLocaleString('id-ID')}, harusnya Rp ${expected.toLocaleString('id-ID')}. Tim CS akan hubungi.`,
          data: { type: 'payment_underpaid', bookingId: p.booking_id },
        }).catch(() => {});
      }
      return { ok: true, warning: 'amount_mismatch' };
    }

    if (status === 'SUCCESSFUL' && p.status !== 'paid') {
      const isExtra = p.payment_type === 'upcharge' || p.payment_type === 'tip';
      if (isExtra) {
        // Extra payment (upcharge/tip): mark paid + finalize via helpers, jangan UPDATE bookings.status
        await this.prisma.$executeRaw`
          UPDATE payments SET status = 'paid', paid_at = NOW(),
            flip_bill_id = ${String(data.id ?? '')},
            callback_payload = ${raw}::jsonb
            WHERE id = ${p.id}::uuid
        `;
        try {
          const meta = typeof p.extra_metadata === 'string' ? JSON.parse(p.extra_metadata) : p.extra_metadata;
          if (p.payment_type === 'upcharge' && meta?.upchargeId && p.user_id && p.booking_id) {
            await this.finalizeUpcharge(p.user_id, p.booking_id, meta.upchargeId);
          } else if (p.payment_type === 'tip' && meta?.cleanerId && p.booking_id && p.user_id) {
            await this.finalizeTip(p.user_id, p.booking_id, meta.cleanerId, Number(p.amount));
          }
        } catch (e: any) {
          this.flipLog.error(`extra payment finalize failed payId=${p.id}: ${e?.message ?? e}`);
        }
        if (p.user_id) {
          void this.push.send({
            userId: p.user_id, channel: 'booking',
            title: 'Pembayaran berhasil',
            body: p.payment_type === 'upcharge' ? 'Charge tambahan terbayar. Cleaner sudah dapat notifikasi.' : 'Tip terkirim ke cleaner. Terima kasih!',
            data: { type: `payment_${p.payment_type}_paid`, bookingId: p.booking_id, paymentId: p.id },
          }).catch(() => {});
        }
      } else {
        // Regular booking payment - flow lama
        await this.prisma.$transaction([
          this.prisma.$executeRaw`
            UPDATE payments SET status = 'paid', paid_at = NOW(),
              flip_bill_id = ${String(data.id ?? '')},
              callback_payload = ${raw}::jsonb
              WHERE id = ${p.id}::uuid
          `,
          ...(p.booking_id ? [
            this.prisma.$executeRaw`
              UPDATE bookings SET status = 'searching', paid_at = NOW()
                WHERE id = ${p.booking_id}::uuid AND status = 'pending_payment'
            `,
          ] : []),
        ]);
        if (p.user_id) {
          void this.push.send({
            userId: p.user_id, channel: 'booking',
            title: 'Pembayaran berhasil',
            body: 'Kami sedang mencari cleaner untuk kamu.',
            data: { type: 'payment_paid', bookingId: p.booking_id, paymentId: p.id },
          }).catch(() => {});
        }
        if (p.booking_id) void this.jobs.broadcastIncomingJob(p.booking_id).catch(() => {});
      }
    } else if ((status === 'FAILED' || status === 'CANCELLED') && !['failed', 'cancelled'].includes(p.status)) {
      const next = status.toLowerCase();
      await this.prisma.$executeRaw`
        UPDATE payments SET status = ${next}, callback_payload = ${raw}::jsonb
          WHERE id = ${p.id}::uuid
      `;
      // Notif "Pembayaran gagal" suppressed - user lagi di payment screen ngebayar
      // bakal liat in-app error toast langsung. Push notif duplikat noisy
      // kalau user coba multiple methods.
    }
    return { ok: true };
  }


  // Flip bank-status callback. Flip POSTs same format as Accept Payment callback
  // (form-urlencoded with `data` JSON + `token`). Status nilai: OPERATIONAL | DELAYED | DISRUPTED.
  @Post('flip/bank-status')
  async flipBankStatus(@Req() req: Request) {
    const body: any = req.body ?? {};
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const hasToken = typeof body.token === 'string' && body.token.length > 0;
    const hasData = typeof body.data === 'string' && body.data.length > 0;
    this.flipLog.log(`bank-status callback from ${ip} — token=${hasToken ? body.token.slice(0,8)+'…' : 'missing'} dataLen=${hasData ? body.data.length : 0}`);
    // Empty ping (no token, no data) = Flip's "Simpan & Test Callback" reachability check.
    // Reply 200 OK so dashboard verification passes.
    if (!hasToken && !hasData) {
      this.flipLog.log(`bank-status: empty ping from ${ip} — replying OK (reachability check)`);
      return { ok: true, ping: true };
    }
    const token: string | undefined = typeof body.token === 'string' ? body.token : undefined;
    if (typeof token === 'string' && /^YOUR_VAL/i.test(token)) {
      this.flipLog.log(`bank-status: dashboard test ping from ${ip} (placeholder token) — replying OK`);
      return { ok: true, test: true };
    }
    if (!(await this.flip.verifyCallbackToken(token))) {
      this.flipLog.warn(`bank-status token verification FAILED from ${ip}`);
      throw new BadRequestException('Invalid Flip token');
    }
    let data: any;
    try { data = typeof body.data === 'string' ? JSON.parse(body.data) : body.data; }
    catch { throw new BadRequestException('Invalid JSON in data'); }
    if (!data) throw new BadRequestException('data missing');

    // Flip docs vary — accept multiple shapes: { bank_code, status } | { code, status } | { banks: [{code,status}] }
    const updates: Array<{ code: string; status: string }> = [];
    if (Array.isArray(data?.banks)) {
      for (const b of data.banks) if (b?.code || b?.bank_code) updates.push({ code: String(b.code ?? b.bank_code).toLowerCase(), status: String(b.status ?? '').toLowerCase() });
    } else if (data?.bank_code || data?.code) {
      updates.push({ code: String(data.bank_code ?? data.code).toLowerCase(), status: String(data.status ?? '').toLowerCase() });
    }
    if (updates.length === 0) { this.flipLog.warn(`bank-status: no parseable updates in payload`); return { ok: true, updated: 0 }; }

    // Normalize status → "normal" | "delayed" | "down" (apa yang APK pahami)
    const normalize = (s: string): 'normal' | 'delayed' | 'down' => {
      const x = s.toUpperCase();
      if (x === 'OPERATIONAL' || x === 'NORMAL' || x === 'OK') return 'normal';
      if (x === 'DELAYED' || x === 'PENDING' || x === 'SLOW') return 'delayed';
      return 'down'; // DISRUPTED | DOWN | OFFLINE | unknown → safe default
    };

    // Read current state, merge updates, write back.
    const rows = await this.prisma.$queryRaw<{ value: any }[]>`SELECT value FROM app_config WHERE key = 'payment.bank_status' LIMIT 1`;
    const current: Record<string, { status: string; updated_at: string }> = (rows[0]?.value ?? {}) as any;
    const now = new Date().toISOString();
    for (const u of updates) {
      const status = normalize(u.status);
      current[u.code] = { status, updated_at: now };
      this.flipLog.log(`bank-status: ${u.code} = ${status} (raw=${u.status})`);
    }
    await this.prisma.$executeRaw`
      INSERT INTO app_config (key, value, description, category, updated_at)
      VALUES ('payment.bank_status', ${JSON.stringify(current)}::jsonb, 'Status bank dari Flip — auto-updated via webhook', 'payment', NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return { ok: true, updated: updates.length };
  }

  // Flip Disbursement callback. Status: PENDING | DONE | CANCELLED | FAILED.
  @Post('flip/disbursement-callback')
  async flipDisbursementCallback(@Req() req: Request) {
    const body: any = req.body ?? {};
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const hasToken = typeof body.token === 'string' && body.token.length > 0;
    const hasData = typeof body.data === 'string' && body.data.length > 0;
    this.flipLog.log(`disbursement callback from ${ip} — token=${hasToken ? body.token.slice(0,8)+'…' : 'missing'} dataLen=${hasData ? body.data.length : 0}`);
    if (!hasToken && !hasData) { return { ok: true, ping: true }; }
    if (typeof body.token === 'string' && /^YOUR_VAL/i.test(body.token)) {
      this.flipLog.log(`disbursement: dashboard test ping — replying OK`);
      return { ok: true, test: true };
    }
    if (!(await this.flip.verifyCallbackToken(body.token))) {
      this.flipLog.warn(`disbursement token verification FAILED from ${ip}`);
      throw new BadRequestException('Invalid Flip token');
    }
    let data: any;
    try { data = typeof body.data === 'string' ? JSON.parse(body.data) : body.data; }
    catch { throw new BadRequestException('Invalid JSON in data'); }
    if (!data) throw new BadRequestException('data missing');

    const flipId: string | number | undefined = data.id;
    const status: string = String(data.status ?? '').toUpperCase();
    if (!flipId) return { ok: false, reason: 'no id' };

    const rows = await this.prisma.$queryRaw<{ id: string; user_id: string; status: string; amount: number }[]>`
      SELECT id, user_id, status, amount FROM withdrawals WHERE flip_disbursement_id = ${String(flipId)} LIMIT 1
    `;
    const w = rows[0];
    if (!w) {
      this.flipLog.warn(`disbursement callback: withdrawal not found for flip_id=${flipId} (probably test)`);
      return { ok: false, reason: 'withdrawal not found' };
    }

    const next = status === 'DONE' ? 'completed' : status === 'CANCELLED' ? 'canceled' : status === 'FAILED' ? 'failed' : 'processing';
    const failureReason = next === 'failed' || next === 'canceled' ? String(data.failure_reason ?? data.reason ?? `Flip status ${status}`) : null;

    // Guard: only update (and notify) if still in a non-terminal state.
    // Flip retries callbacks — without this guard every retry sends a duplicate notification.
    const updated = await this.prisma.$executeRaw`
      UPDATE withdrawals
         SET status = ${next},
             callback_payload = ${JSON.stringify(data)}::jsonb,
             failure_reason = ${failureReason},
             processed_at = CASE WHEN ${next} = 'completed' THEN NOW() ELSE processed_at END
       WHERE id = ${w.id}::uuid AND status NOT IN ('completed', 'canceled', 'failed')
    `;
    if (Number(updated) === 0) {
      return { ok: true, status: next, skipped: true };
    }

    // Kalau gagal/cancel, reverse holding ledger entry agar saldo cleaner balik.
    if (next === 'failed' || next === 'canceled') {
      await this.prisma.$executeRaw`
        INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, description)
        VALUES (${w.user_id}::uuid, 'withdrawal', ${-w.amount}::bigint, 'withdrawal_reverse', ${w.id}::uuid, 'CLEARED', 'Reverse: withdrawal ' || ${next})
      `;
      // Tutup hold yang PENDING
      await this.prisma.$executeRaw`
        UPDATE wallet_ledger_entries SET status = 'CLEARED', cleared_at = NOW()
         WHERE reference_type = 'withdrawal' AND reference_id = ${w.id}::uuid AND status = 'PENDING'
      `;
      if (w.user_id) {
        void this.push.send({
          userId: w.user_id, channel: 'wallet',
          title: 'Penarikan gagal',
          body: `Rp ${Number(w.amount).toLocaleString('id-ID')} dikembalikan ke saldo. Alasan: ${failureReason ?? 'Coba lagi'}.`,
          data: { type: 'withdrawal_failed', withdrawalId: w.id },
        }).catch(() => {});
      }
    }

    if (next === 'completed') {
      // Clear hold sebagai final settled
      await this.prisma.$executeRaw`
        UPDATE wallet_ledger_entries SET status = 'CLEARED', cleared_at = NOW()
         WHERE reference_type = 'withdrawal' AND reference_id = ${w.id}::uuid AND status = 'PENDING'
      `;
      if (w.user_id) {
        void this.push.send({
          userId: w.user_id, channel: 'wallet',
          title: 'Penarikan berhasil',
          body: `Rp ${Number(w.amount).toLocaleString('id-ID')} sudah ditransfer ke rekening kamu.`,
          data: { type: 'withdrawal_completed', withdrawalId: w.id },
        }).catch(() => {});
      }
    }

    return { ok: true, status: next };
  }

  // Flip Bank-Account Inquiry callback. Optional — kita pakai sync inquiry, jadi callback ini cuma audit.
  @Post('flip/inquiry-callback')
  async flipInquiryCallback(@Req() req: Request) {
    const body: any = req.body ?? {};
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const hasToken = typeof body.token === 'string' && body.token.length > 0;
    const hasData = typeof body.data === 'string' && body.data.length > 0;
    this.flipLog.log(`inquiry callback from ${ip} — token=${hasToken ? body.token.slice(0,8)+'…' : 'missing'} dataLen=${hasData ? body.data.length : 0}`);
    if (!hasToken && !hasData) {
      this.flipLog.log(`inquiry: empty ping from ${ip} — replying OK (reachability check)`);
      return { ok: true, ping: true };
    }
    if (typeof body.token === 'string' && /^YOUR_VAL/i.test(body.token)) {
      this.flipLog.log(`inquiry: dashboard test ping from ${ip} (placeholder token) — replying OK`);
      return { ok: true, test: true };
    }
    if (!(await this.flip.verifyCallbackToken(body.token))) {
      this.flipLog.warn(`inquiry token verification FAILED from ${ip}`);
      throw new BadRequestException('Invalid Flip token');
    }
    this.flipLog.log(`inquiry verified from ${ip} — audit only (sync inquiry result already used)`);
    return { ok: true };
  }

  // Public endpoint untuk APK cek status bank sebelum tampilin picker.
  // Status sources (urutan priority):
  // 1. payment.active_channels (admin override per channel — paling akurat)
  // 2. payment.bank_status (auto-updated dari Flip Status Bank webhook)
  // 3. Default 'normal'
  @Get('bank-health')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async bankHealth() {
    const rows = await this.prisma.$queryRaw<{ key: string; value: any }[]>`
      SELECT key, value FROM app_config WHERE key IN ('payment.bank_status', 'payment.active_channels', 'payment.disabled_methods')
    `;
    const stored: Record<string, { status: string; updated_at: string }> =
      (rows.find((r) => r.key === 'payment.bank_status')?.value ?? {}) as any;
    // active_channels: { bca: { active: false, reason: 'Belum aktif di Flip' }, qris: { active: false, reason: 'Maintenance Flip' }, ... }
    const overrides: Record<string, { active?: boolean; reason?: string }> =
      (rows.find((r) => r.key === 'payment.active_channels')?.value ?? {}) as any;
    const disabled = await this.getDisabledMethods();
    const known = ['bca', 'mandiri', 'bri', 'bni', 'cimb', 'permata', 'bsi', 'danamon', 'seabank', 'btn', 'mega', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'linkaja', 'alfamart', 'indomaret', 'credit_card'];
    const labels: Record<string, string> = {
      bca: 'BCA', mandiri: 'Mandiri', bri: 'BRI', bni: 'BNI', cimb: 'CIMB Niaga', permata: 'Permata',
      bsi: 'BSI', danamon: 'Danamon', seabank: 'SeaBank', btn: 'BTN', mega: 'Bank Mega',
      qris: 'QRIS', gopay: 'GoPay', ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay', linkaja: 'LinkAja',
      alfamart: 'Alfamart', indomaret: 'Indomaret', credit_card: 'Kartu Kredit',
    };
    return known.map((code) => {
      const override = overrides[code];
      const s = stored[code];
      // Auto-expire stale status: Flip jarang kirim "recovered" webhook, jadi
      // kalau status lama > threshold, anggap sudah normal kembali.
      let status: 'normal' | 'delayed' | 'down' = 'normal';
      if (s?.status && s.status !== 'normal') {
        const ageMs = s.updated_at ? Date.now() - new Date(s.updated_at).getTime() : 0;
        const maxAgeMs = s.status === 'down' ? 6 * 3600_000 : 2 * 3600_000;
        if (ageMs < maxAgeMs) status = s.status as any;
      }
      let message = '';
      // Admin override mengalahkan webhook status
      if (override?.active === false) {
        status = 'down';
        message = override.reason ?? `${labels[code]} belum aktif`;
      } else if (disabled.has(this.normalizeDisabledMethodCode(
        code,
        code === 'qris'
          ? 'qris'
          : ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].includes(code)
            ? 'wallet_account'
            : ['alfamart', 'indomaret'].includes(code)
              ? 'retail'
              : code === 'credit_card'
                ? 'credit_card'
                : 'virtual_account',
      ))) {
        status = 'down';
        message = `${labels[code]} sedang tidak tersedia untuk sementara.`;
      } else if (status === 'down') {
        message = `${labels[code]} sedang gangguan, mohon pilih metode lain.`;
      } else if (status === 'delayed') {
        message = `${labels[code]} sedang tertunda, transaksi mungkin lambat.`;
      }
      return { code, name: labels[code], status, message, updated_at: s?.updated_at ?? null };
    });
  }

  @Get('checkout-methods')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async checkoutMethods() {
    const health = await this.bankHealth();
    const healthMap = new Map(health.map((item) => [item.code, item]));
    return CHECKOUT_METHODS.map((method) => {
      const healthEntry = healthMap.get(method.senderBank);
      return {
        ...method,
        status: healthEntry?.status ?? 'normal',
        message: healthEntry?.message ?? '',
      };
    });
  }

  // List active payment channels (public — for picker UI).
  // Admin bisa nge-disable channel tertentu via app_config:
  //   key='payment.disabled_methods', value=["BCAVA","BRIVA",...] (JSON array)
  // Pakai saat bank/wallet partner lagi error / maintenance.
  @Get('channels')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async channels() {
    const all = await this.tripay.listChannels();
    const disabled = await this.getDisabledMethods();
    return all
      .filter((c) => c.active && !disabled.has(String(c.code).toUpperCase()))
      .map((c) => ({
        code: c.code, name: c.name, group: c.group, type: c.type,
        iconUrl: c.icon_url, fee: c.total_fee,
      }));
  }

  // Create payment for a booking. Returns Tripay payment URL/instructions.
  @Post('create')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { bookingId: string; method: string },
  ) {
    if (!body?.bookingId || !body?.method) throw new BadRequestException('bookingId & method wajib.');
    const disabled = await this.getDisabledMethods();
    if (disabled.has(String(body.method).toUpperCase())) {
      throw new BadRequestException('Metode pembayaran ini sedang dinonaktifkan sementara. Mohon pilih metode lain.');
    }

    // Get booking + verify owner + status pending_payment
    const rows = await this.prisma.$queryRaw<{ id: string; customer_id: string; total_amount: number; status: string }[]>`
      SELECT id, customer_id, total_amount, status FROM bookings WHERE id = ${body.bookingId}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new NotFoundException('Booking tidak ditemukan.');
    if (b.customer_id !== user.id) throw new BadRequestException('Bukan booking kamu.');
    if (b.status !== 'pending_payment') throw new BadRequestException(`Booking status ${b.status} — tidak bisa create payment.`);

    // Get user info for tripay
    const userRows = await this.prisma.$queryRaw<{ name: string | null; email: string | null; phone: string }[]>`
      SELECT name, email, phone FROM users WHERE id = ${user.id}::uuid LIMIT 1
    `;
    const u = userRows[0];
    if (!u) throw new NotFoundException('User tidak ditemukan.');

    const merchantRef = `JBSIH-${b.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const amount = Number(b.total_amount);

    // Insert pending payment row first
    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO payments (booking_id, user_id, amount, payment_method, status, tripay_merchant_ref)
      VALUES (${b.id}::uuid, ${user.id}::uuid, ${amount}::bigint, ${body.method}, 'pending', ${merchantRef})
      RETURNING id
    `;
    const paymentId = inserted[0]!.id;

    try {
      const result = await this.tripay.createTransaction({
        method: body.method,
        merchantRef,
        amount,
        customerName: u.name ?? 'JasaBersih Customer',
        customerEmail: u.email ?? `${u.phone}@jasabersih.com`,
        customerPhone: u.phone,
        orderItems: [{ name: `Booking ${b.id.slice(0, 8)}`, price: amount, quantity: 1 }],
        callbackUrl: `https://api.jasabersih.com/v1/payments/callback`,
        returnUrl: `https://jasabersih.com/booking/${b.id}`,
      });

      // Update payment with tripay info
      await this.prisma.$executeRaw`
        UPDATE payments
           SET tripay_reference = ${result.reference},
               payment_url = ${result.checkout_url},
               pay_code = ${result.pay_code ?? null},
               pay_method_code = ${result.payment_method},
               amount_received = ${result.amount_received ?? amount}::bigint,
               fee = ${result.total_fee ?? 0}::bigint,
               expired_at = TO_TIMESTAMP(${result.expired_time})
         WHERE id = ${paymentId}::uuid
      `;

      return {
        paymentId,
        reference: result.reference,
        method: result.payment_method,
        methodName: result.payment_name,
        amount: result.amount,
        fee: result.total_fee,
        amountTotal: result.amount + result.total_fee,
        payCode: result.pay_code,
        payUrl: result.pay_url,
        checkoutUrl: result.checkout_url,
        qrUrl: result.qr_url,
        qrString: result.qr_string,
        expiredAt: new Date(result.expired_time * 1000).toISOString(),
        instructions: result.instructions,
      };
    } catch (e: any) {
      await this.prisma.$executeRaw`UPDATE payments SET status = 'failed' WHERE id = ${paymentId}::uuid`;
      throw e;
    }
  }

  // Webhook — Tripay calls this on payment status change. NO auth (signature verified instead).
  @Post('callback')
  async callback(@Req() req: Request, @Headers('x-callback-signature') sig: string | undefined) {
    // req.body is raw Buffer (configured in main.ts for this route specifically)
    const buf = req.body as Buffer;
    const raw = Buffer.isBuffer(buf) ? buf.toString('utf8') : JSON.stringify(buf);
    if (!(await this.tripay.verifyCallbackSignature(raw, sig))) {
      throw new BadRequestException('Invalid signature');
    }
    let body: any;
    try { body = JSON.parse(raw); } catch { throw new BadRequestException('Invalid JSON'); }
    const reference: string | undefined = body?.reference;
    const merchantRef: string | undefined = body?.merchant_ref;
    const status: string | undefined = body?.status; // PAID | EXPIRED | REFUND | UNPAID
    if (!reference) throw new BadRequestException('reference missing');

    // Find payment
    const payRows = await this.prisma.$queryRaw<{ id: string; booking_id: string | null; user_id: string | null; status: string }[]>`
      SELECT id, booking_id, user_id, status FROM payments WHERE tripay_reference = ${reference} LIMIT 1
    `;
    const p = payRows[0];
    if (!p) return { ok: false, reason: 'payment not found' };

    // Idempotent: ignore if already in terminal state
    if (status === 'PAID' && p.status !== 'paid') {
      await this.prisma.$transaction([
        this.prisma.$executeRaw`
          UPDATE payments SET status = 'paid', paid_at = NOW(), callback_payload = ${raw}::jsonb
            WHERE id = ${p.id}::uuid
        `,
        // Mark booking paid + status searching
        ...(p.booking_id ? [
          this.prisma.$executeRaw`
            UPDATE bookings SET status = 'searching', paid_at = NOW()
              WHERE id = ${p.booking_id}::uuid AND status = 'pending_payment'
          `,
        ] : []),
      ]);
      // Notify customer + broadcast to available cleaners
      if (p.user_id) {
        void this.push.send({
          userId: p.user_id, channel: 'booking',
          title: 'Pembayaran berhasil',
          body: 'Kami sedang mencari cleaner untuk kamu.',
          data: { type: 'payment_paid', bookingId: p.booking_id, paymentId: p.id },
        }).catch(() => {});
      }
      if (p.booking_id) void this.jobs.broadcastIncomingJob(p.booking_id).catch(() => {});
    } else if ((status === 'EXPIRED' || status === 'REFUND') && p.status !== status.toLowerCase()) {
      await this.prisma.$executeRaw`
        UPDATE payments SET status = ${status.toLowerCase()}, callback_payload = ${raw}::jsonb
          WHERE id = ${p.id}::uuid
      `;
      if (p.user_id) {
        void this.push.send({
          userId: p.user_id, channel: 'booking',
          title: status === 'EXPIRED' ? 'Pembayaran kadaluwarsa' : 'Pembayaran di-refund',
          body: status === 'EXPIRED' ? 'Silakan buat pembayaran baru.' : 'Dana sudah dikembalikan ke rekening kamu.',
          data: { type: 'payment_' + status.toLowerCase(), bookingId: p.booking_id },
        }).catch(() => {});
      }
    }
    return { ok: true };
  }

  // Get payment status (mobile poll while user di payment screen)
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, booking_id AS "bookingId", amount, payment_method AS "paymentMethod",
             status, paid_at AS "paidAt", tripay_reference AS "reference",
             pay_code AS "payCode", payment_url AS "paymentUrl",
             expired_at AS "expiredAt", created_at AS "createdAt",
             extra_metadata AS "extraMetadata"
        FROM payments WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException();
    const row = { ...rows[0] };
    const meta = (row.extraMetadata && typeof row.extraMetadata === 'object' ? row.extraMetadata : {}) as Record<string, unknown>;
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt));
    const storedExpiredAt = row.expiredAt instanceof Date ? row.expiredAt : (row.expiredAt ? new Date(String(row.expiredAt)) : null);
    const resolvedExpiredAt =
      storedExpiredAt && !Number.isNaN(storedExpiredAt.getTime())
        ? storedExpiredAt.toISOString()
        : createdAt && !Number.isNaN(createdAt.getTime())
          ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null;
    if (row.bookingId && row.status === 'pending') {
      const bookingRows = await this.prisma.$queryRaw<{ status: string; paidAt: Date | null }[]>`
        SELECT status, paid_at AS "paidAt"
          FROM bookings
         WHERE id = ${String(row.bookingId)}::uuid
         LIMIT 1
      `;
      const booking = bookingRows[0];
      if (booking?.paidAt || (booking?.status && booking.status !== 'pending_payment')) {
        row.status = 'paid';
        row.paidAt = booking.paidAt ?? new Date();
      }
    }
    return {
      ...row,
      expiredAt: resolvedExpiredAt,
      senderBank: typeof meta.senderBank === 'string' ? meta.senderBank : null,
      senderBankType: typeof meta.senderBankType === 'string' ? meta.senderBankType : null,
      qrString: typeof meta.qrString === 'string' ? meta.qrString : null,
      qrUrl: typeof meta.qrUrl === 'string' ? meta.qrUrl : null,
      nmid: typeof meta.nmid === 'string' ? meta.nmid : null,
      walletUrl: typeof meta.walletUrl === 'string' ? meta.walletUrl : null,
      fellBackToCheckout: Boolean(meta.fellBackToCheckout),
    };
  }
}

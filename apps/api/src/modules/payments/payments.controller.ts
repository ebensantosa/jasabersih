import { BadRequestException, Body, Controller, Get, Headers, Logger, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { JobsGateway } from '../jobs/jobs.gateway';
import { PushService } from '../notifications/push.service';
import { TripayService } from './tripay.service';
import { FlipService } from './flip.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripay: TripayService,
    private readonly flip: FlipService,
    private readonly push: PushService,
    private readonly jobs: JobsGateway,
  ) {}

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
           SET flip_link_id = ${String(result.link_id)},
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
    @Body() body: { bookingId: string; senderBank: string; senderBankType: 'virtual_account' | 'qris' | 'wallet_account' | 'bank_transfer'; useCredit?: boolean },
  ) {
    if (!body?.bookingId || !body?.senderBank || !body?.senderBankType) {
      throw new BadRequestException('bookingId, senderBank, senderBankType wajib.');
    }

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
      if (creditUsed > 0 && creditUsed < total) {
        // partial: deduct saldo sekarang
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
           VALUES ($1::uuid, 'credit_use', $2, 'booking', $3::uuid, 'CLEARED', NOW(), $4)`,
          user.id, creditUsed, b.id, `Potongan saldo untuk booking ${b.id.slice(0, 8)}`,
        );
      }
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
          senderBankType: body.senderBankType,
        });
      } catch (directErr: any) {
        // Fallback: kalau direct mode error (Flip API changed), pakai hosted checkout page.
        // Customer akan pilih bank di Flip page. UX sedikit beda tapi tetap jalan.
        this.flipLog.warn(`createDirect failed (${directErr?.message ?? 'unknown'}), falling back to hosted checkout`);
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
      const qrString: string | undefined =
        receiverAcc?.qr_code_data
        ?? receiverAcc?.qr_string
        ?? billPayment?.qr_code_data
        ?? billPayment?.qr_string
        ?? billPayment?.qrcode_string
        ?? result?.qr_code_data
        ?? result?.qr_string;
      const walletUrl: string | undefined =
        billPayment?.customer?.payment_url
        ?? billPayment?.redirect_url
        ?? billPayment?.payment_url
        ?? billPayment?.url
        ?? result?.customer_url
        ?? result?.payment_url;
      const expiredAt = result?.expired_date ?? null;

      this.flipLog.log(`flip parsed: qrString=${qrString ? 'YES('+qrString.length+'chars)' : 'NO'} accountNumber=${accountNumber ?? 'NO'} linkId=${result?.link_id}`);

      await this.prisma.$executeRaw`
        UPDATE payments
           SET flip_link_id = ${String(result.link_id ?? '')},
               pay_code = ${accountNumber ?? null},
               payment_url = ${result.link_url ?? null}
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
    this.flipLog.log(`callback verified — linkId=${linkId} status=${status}`);

    if (!linkId) return { ok: false, reason: 'no link id' };

    const payRows = await this.prisma.$queryRaw<{ id: string; booking_id: string | null; user_id: string | null; status: string; amount: number }[]>`
      SELECT id, booking_id, user_id, status, amount FROM payments WHERE flip_link_id = ${String(linkId)} LIMIT 1
    `;
    const p = payRows[0];
    if (!p) { this.flipLog.warn(`payment not found for linkId=${linkId} (this is expected for Flip test buttons)`); return { ok: false, reason: 'payment not found' }; }

    const raw = JSON.stringify(data);
    // Amount mismatch guard — Flip QRIS sometimes accepts arbitrary amount if
    // the QR isn't amount-locked. Reject if paid amount != expected.
    const paidAmount = Number(data?.amount ?? data?.bill_payment?.amount ?? 0);
    const expected = Number(p.amount);
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
    } else if ((status === 'FAILED' || status === 'CANCELLED') && !['failed', 'cancelled'].includes(p.status)) {
      const next = status.toLowerCase();
      await this.prisma.$executeRaw`
        UPDATE payments SET status = ${next}, callback_payload = ${raw}::jsonb
          WHERE id = ${p.id}::uuid
      `;
      if (p.user_id) {
        void this.push.send({
          userId: p.user_id, channel: 'booking',
          title: 'Pembayaran gagal',
          body: 'Silakan coba lagi atau pilih metode lain.',
          data: { type: `payment_${next}`, bookingId: p.booking_id },
        }).catch(() => {});
      }
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

    await this.prisma.$executeRaw`
      UPDATE withdrawals
         SET status = ${next},
             callback_payload = ${JSON.stringify(data)}::jsonb,
             failure_reason = ${failureReason},
             processed_at = CASE WHEN ${next} = 'completed' THEN NOW() ELSE processed_at END
       WHERE id = ${w.id}::uuid
    `;

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
  async bankHealth() {
    const rows = await this.prisma.$queryRaw<{ key: string; value: any }[]>`
      SELECT key, value FROM app_config WHERE key IN ('payment.bank_status', 'payment.active_channels')
    `;
    const stored: Record<string, { status: string; updated_at: string }> =
      (rows.find((r) => r.key === 'payment.bank_status')?.value ?? {}) as any;
    // active_channels: { bca: { active: false, reason: 'Belum aktif di Flip' }, qris: { active: false, reason: 'Maintenance Flip' }, ... }
    const overrides: Record<string, { active?: boolean; reason?: string }> =
      (rows.find((r) => r.key === 'payment.active_channels')?.value ?? {}) as any;
    const known = ['bca', 'mandiri', 'bri', 'bni', 'cimb', 'permata', 'bsi', 'danamon', 'btn', 'mega', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'];
    const labels: Record<string, string> = {
      bca: 'BCA', mandiri: 'Mandiri', bri: 'BRI', bni: 'BNI', cimb: 'CIMB Niaga', permata: 'Permata',
      bsi: 'BSI', danamon: 'Danamon', btn: 'BTN', mega: 'Bank Mega',
      qris: 'QRIS', gopay: 'GoPay', ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay', linkaja: 'LinkAja',
    };
    return known.map((code) => {
      const override = overrides[code];
      const s = stored[code];
      let status: 'normal' | 'delayed' | 'down' = (s?.status as any) ?? 'normal';
      let message = '';
      // Admin override mengalahkan webhook status
      if (override?.active === false) {
        status = 'down';
        message = override.reason ?? `${labels[code]} belum aktif`;
      } else if (status === 'down') {
        message = `${labels[code]} sedang gangguan, mohon pilih metode lain.`;
      } else if (status === 'delayed') {
        message = `${labels[code]} sedang tertunda, transaksi mungkin lambat.`;
      }
      return { code, name: labels[code], status, message, updated_at: s?.updated_at ?? null };
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
    const cfg = await this.prisma.$queryRaw<{ value: any }[]>`
      SELECT value FROM app_config WHERE key = 'payment.disabled_methods' LIMIT 1
    `;
    let disabled: string[] = [];
    const v = cfg[0]?.value;
    if (Array.isArray(v)) disabled = v.filter((x: unknown) => typeof x === 'string').map((s) => String(s).toUpperCase());
    else if (typeof v === 'string') {
      try { const arr = JSON.parse(v); if (Array.isArray(arr)) disabled = arr.map((s: any) => String(s).toUpperCase()); } catch {}
    }
    return all
      .filter((c) => c.active && !disabled.includes(String(c.code).toUpperCase()))
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
             expired_at AS "expiredAt", created_at AS "createdAt"
        FROM payments WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }
}

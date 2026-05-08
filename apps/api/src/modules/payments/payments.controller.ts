import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PushService } from '../notifications/push.service';
import { TripayService } from './tripay.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripay: TripayService,
    private readonly push: PushService,
  ) {}

  // List active payment channels (public — for picker UI)
  @Get('channels')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async channels() {
    const all = await this.tripay.listChannels();
    return all.filter((c) => c.active).map((c) => ({
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
    if (!this.tripay.verifyCallbackSignature(raw, sig)) {
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
      // Notify customer
      if (p.user_id) {
        void this.push.send({
          userId: p.user_id, channel: 'booking',
          title: 'Pembayaran berhasil',
          body: 'Kami sedang mencari cleaner untuk kamu.',
          data: { type: 'payment_paid', bookingId: p.booking_id, paymentId: p.id },
        }).catch(() => {});
      }
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

import { Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Body, BadRequestException, Req } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('bookings')
  @Roles('super_admin', 'ops', 'finance', 'fraud_analyst', 'support')
  async listBookings(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = Math.min(Math.max(Number(limitStr ?? 50), 1), 200);
    const offset = Math.max(Number(offsetStr ?? 0), 0);
    const [rows, totalRow] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT
          b.id, b.status, b.pricing_mode AS "pricingMode",
          b.total_amount AS total, b.scheduled_at AS "scheduledAt",
          b.address_line AS address, b.created_at AS "createdAt",
          cu.name AS "customerName", cu.phone AS "customerPhone",
          cl.name AS "cleanerName",
          COALESCE(s.name, sp.name, p.name) AS service,
          (b.form_snapshot->>'createdByAdmin')::boolean AS "isManual"
        FROM bookings b
        LEFT JOIN users cu ON cu.id = b.customer_id
        LEFT JOIN users cl ON cl.id = b.cleaner_id
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN pricing_packages p ON p.id = b.package_id
        LEFT JOIN services sp ON sp.id = p.service_id
        WHERE 1=1
          AND (${status ?? null}::text IS NULL OR b.status = ${status ?? null})
          AND (${from ?? null}::date IS NULL OR b.created_at >= ${from ?? null}::date)
          AND (${to ?? null}::date IS NULL OR b.created_at < (${to ?? null}::date + INTERVAL '1 day'))
        ORDER BY b.created_at DESC
        LIMIT ${limit}::int OFFSET ${offset}::int
      `,
      this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM bookings b
        WHERE 1=1
          AND (${status ?? null}::text IS NULL OR b.status = ${status ?? null})
          AND (${from ?? null}::date IS NULL OR b.created_at >= ${from ?? null}::date)
          AND (${to ?? null}::date IS NULL OR b.created_at < (${to ?? null}::date + INTERVAL '1 day'))
      `,
    ]);
    return { items: rows, total: Number(totalRow[0]?.c ?? 0), limit, offset };
  }

  // GET /admin/bookings/export.csv — export semua booking yg cocok filter ke CSV.
  // Capped 10k rows untuk safety; user persempit filter kalau lebih.
  @Get('bookings/export.csv')
  @Roles('super_admin', 'ops', 'finance')
  async exportBookingsCsv(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        b.id, b.status, b.pricing_mode AS "pricingMode",
        b.total_amount AS total, b.scheduled_at AS "scheduledAt",
        b.paid_at AS "paidAt", b.completed_at AS "completedAt",
        b.address_line AS address, b.created_at AS "createdAt",
        cu.name AS "customerName", cu.phone AS "customerPhone", cu.email AS "customerEmail",
        cl.name AS "cleanerName", cl.phone AS "cleanerPhone",
        COALESCE(s.name, sp.name) AS service,
        p.name AS package
      FROM bookings b
      LEFT JOIN users cu ON cu.id = b.customer_id
      LEFT JOIN users cl ON cl.id = b.cleaner_id
      LEFT JOIN services s ON s.id = b.service_id
      LEFT JOIN pricing_packages p ON p.id = b.package_id
      LEFT JOIN services sp ON sp.id = p.service_id
      WHERE 1=1
        AND (${status ?? null}::text IS NULL OR b.status = ${status ?? null})
        AND (${from ?? null}::date IS NULL OR b.created_at >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR b.created_at < (${to ?? null}::date + INTERVAL '1 day'))
      ORDER BY b.created_at DESC
      LIMIT 10000
    `;
    return { items: rows, count: rows.length, limited: rows.length >= 10000 };
  }

  // GET /admin/payouts/export.csv — export withdrawal/payout untuk reconciliation finance.
  @Get('payouts/export.csv')
  @Roles('super_admin', 'finance')
  async exportPayoutsCsv(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        w.id, w.amount, w.fee, w.net_amount AS "netAmount",
        w.review_status AS "reviewStatus", w.flip_disbursement_id AS "flipId",
        w.flip_status AS "flipStatus", w.bank_code AS "bankCode",
        w.account_number AS "accountNumber", w.account_holder_name AS "accountHolderName",
        w.created_at AS "createdAt", w.completed_at AS "completedAt", w.failed_reason AS "failedReason",
        u.name AS "cleanerName", u.phone AS "cleanerPhone"
      FROM withdrawals w
      LEFT JOIN users u ON u.id = w.user_id
      WHERE 1=1
        AND (${from ?? null}::date IS NULL OR w.created_at >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR w.created_at < (${to ?? null}::date + INTERVAL '1 day'))
        AND (${status ?? null}::text IS NULL OR w.review_status = ${status ?? null})
      ORDER BY w.created_at DESC
      LIMIT 10000
    `;
    return { items: rows, count: rows.length, limited: rows.length >= 10000 };
  }

  @Get('cleaners')
  @Roles('super_admin', 'ops', 'finance', 'fraud_analyst', 'support')
  async listCleaners(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limitStr?: string,
  ) {
    // Whitelist status terhadap nilai enum yang valid (mencegah SQL injection via status).
    const VALID_STATUS = new Set(['active', 'pending', 'approved', 'rejected', 'suspended', 'banned']);
    const safeStatus = status && VALID_STATUS.has(status) ? status : null;
    // Query string: dipakai sebagai parameter LIKE (bukan template), aman.
    const safeQ = (q ?? '').trim().slice(0, 50);
    const limit = Math.min(Math.max(Number(limitStr ?? 100) || 100, 1), 500);
    const likeParam = safeQ ? `%${safeQ}%` : null;
    // Pakai $queryRawUnsafe dengan positional parameters ($1, $2, ...) — driver Postgres handle escaping.
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `
      SELECT
        u.id, u.name, u.phone, u.photo_url AS "photoUrl", u.created_at AS "joinedAt",
        cp.kyc_status AS status,
        cp.tier,
        cp.brings_tools AS "bringsTools",
        cp.rating_avg AS rating,
        cp.total_jobs_done AS "jobsDone",
        cp.service_areas AS "serviceAreas"
      FROM users u
      LEFT JOIN cleaner_profiles cp ON cp.user_id = u.id
      WHERE u.is_freelancer = TRUE AND u.deleted_at IS NULL
        AND (
          $1::text IS NULL
          OR ($1 = 'active' AND u.status = 'active' AND cp.kyc_status = 'approved')
          OR ($1 = 'banned' AND u.status = 'banned')
          OR ($1 = 'suspended' AND u.status = 'suspended')
          OR ($1 NOT IN ('active', 'banned', 'suspended') AND cp.kyc_status = $1)
        )
        AND ($2::text IS NULL OR u.name ILIKE $2 OR u.phone ILIKE $2)
      ORDER BY u.created_at DESC
      LIMIT $3::int
    `,
      safeStatus,
      likeParam,
      limit,
    );
    return rows;
  }

  // POST /admin/customers — manual create customer (admin-trusted, bypass OTP)
  @Post('customers')
  @Roles('super_admin', 'ops')
  async createCustomer(
    @Body() body: { name: string; phone: string; email?: string; password: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body.name || body.name.length < 2) throw new BadRequestException('Nama wajib (min 2 karakter)');
    if (!body.phone || !/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(body.phone.replace(/\s/g, ''))) {
      throw new BadRequestException('Nomor HP tidak valid');
    }
    if (!body.password || body.password.length < 8) throw new BadRequestException('Password min 8 karakter');

    const digits = body.phone.replace(/\D/g, '');
    const phone = digits.startsWith('62') ? `+${digits}` : digits.startsWith('0') ? `+62${digits.slice(1)}` : `+62${digits}`;
    const email = body.email?.trim().toLowerCase() || null;

    const dup = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE phone = ${phone} OR (${email}::text IS NOT NULL AND email = ${email}) LIMIT 1
    `;
    if (dup.length > 0) throw new BadRequestException('Nomor HP atau email sudah terdaftar');

    const passwordHash = await bcrypt.hash(body.password, 12);
    const userRows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO users (phone, name, email, password_hash, phone_verified_at, is_customer, is_freelancer, status)
      VALUES (${phone}, ${body.name}, ${email}, ${passwordHash}, NOW(), TRUE, FALSE, 'active')
      RETURNING id
    `;
    const userId = userRows[0]!.id;

    await this.audit.log({
      adminId: admin.id, action: 'customer.create', resourceType: 'user', resourceId: userId,
      changes: { name: body.name, phone, email }, ipAddress: req.ip ?? null,
    });
    return { id: userId, phone, name: body.name };
  }

  // DELETE /admin/customers/:id — hard delete customer
  @Delete('customers/:id')
  @Roles('super_admin', 'ops')
  async deleteCustomer(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string | null; is_customer: boolean }[]>`
      SELECT id, name, is_customer FROM users WHERE id = ${id}::uuid LIMIT 1
    `;
    if (rows.length === 0) throw new BadRequestException('Customer tidak ditemukan');
    if (!rows[0]!.is_customer) throw new BadRequestException('User ini bukan customer');

    const active = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM bookings
       WHERE customer_id = ${id}::uuid
         AND status IN ('searching', 'matched', 'on_the_way', 'in_progress', 'pending_payment')
    `;
    if (Number(active[0]?.c ?? 0) > 0) {
      throw new BadRequestException('Customer masih punya booking aktif — selesaikan dulu sebelum hapus');
    }

    await this.hardDeleteUser(id);

    await this.audit.log({
      adminId: admin.id, action: 'customer.delete', resourceType: 'user', resourceId: id,
      changes: { reason: body.reason ?? null, name: rows[0]!.name }, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // POST /admin/cleaners — manual create cleaner (admin-trusted, bypass OTP)
  @Post('cleaners')
  @Roles('super_admin', 'ops')
  async createCleaner(
    @Body() body: { name: string; phone: string; email?: string; password: string; bringsTools?: boolean; serviceAreas?: string[]; tier?: string; autoApprove?: boolean },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body.name || body.name.length < 2) throw new BadRequestException('Nama wajib (min 2 karakter)');
    if (!body.phone || !/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(body.phone.replace(/\s/g, ''))) {
      throw new BadRequestException('Nomor HP tidak valid');
    }
    if (!body.password || body.password.length < 8) throw new BadRequestException('Password min 8 karakter');

    // Normalize phone
    const digits = body.phone.replace(/\D/g, '');
    const phone = digits.startsWith('62') ? `+${digits}` : digits.startsWith('0') ? `+62${digits.slice(1)}` : `+62${digits}`;
    const email = body.email?.trim().toLowerCase() || null;

    // Check duplicate
    const dup = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE phone = ${phone} OR (${email}::text IS NOT NULL AND email = ${email}) LIMIT 1
    `;
    if (dup.length > 0) throw new BadRequestException('Nomor HP atau email sudah terdaftar');

    const passwordHash = await bcrypt.hash(body.password, 12);
    // autoApprove dibatasi hanya super_admin — ops/support harus lewat workflow KYC normal.
    const kycStatus = body.autoApprove && admin.role === 'super_admin' ? 'approved' : 'pending';
    const tier = body.tier || 'standard';

    const userRows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO users (phone, name, email, password_hash, phone_verified_at, is_customer, is_freelancer, status)
      VALUES (${phone}, ${body.name}, ${email}, ${passwordHash}, NOW(), FALSE, TRUE, 'active')
      RETURNING id
    `;
    const userId = userRows[0]!.id;

    // Create cleaner_profile (idempotent kalau row sudah ada)
    await this.prisma.$executeRaw`
      INSERT INTO cleaner_profiles (user_id, kyc_status, tier, brings_tools, service_areas)
      VALUES (${userId}::uuid, ${kycStatus}, ${tier}, ${body.bringsTools ?? false}, ${JSON.stringify(body.serviceAreas ?? [])}::jsonb)
      ON CONFLICT (user_id) DO UPDATE
        SET kyc_status = EXCLUDED.kyc_status,
            tier = EXCLUDED.tier,
            brings_tools = EXCLUDED.brings_tools,
            service_areas = EXCLUDED.service_areas
    `;

    await this.audit.log({
      adminId: admin.id,
      action: 'cleaner.create',
      resourceType: 'user',
      resourceId: userId,
      changes: { name: body.name, phone, email, kycStatus, tier, autoApprove: !!body.autoApprove },
      ipAddress: req.ip ?? null,
    });

    return { id: userId, phone, name: body.name, kycStatus, tier };
  }

  // PATCH /admin/users/:id — admin edit name / email / password (customer ATAU cleaner)
  @Patch('users/:id')
  @Roles('super_admin', 'ops')
  async updateUserAccount(
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; password?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const exists = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${id}::uuid LIMIT 1`;
    if (exists.length === 0) throw new BadRequestException('User tidak ditemukan');

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2) throw new BadRequestException('Nama minimal 2 karakter');
      await this.prisma.$executeRaw`UPDATE users SET name = ${name}, updated_at = NOW() WHERE id = ${id}::uuid`;
    }
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Format email tidak valid');
      if (email) {
        const dup = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM users WHERE LOWER(email) = ${email} AND id <> ${id}::uuid LIMIT 1
        `;
        if (dup.length > 0) throw new BadRequestException('Email ini sudah dipakai user lain');
      }
      await this.prisma.$executeRaw`UPDATE users SET email = ${email || null}, updated_at = NOW() WHERE id = ${id}::uuid`;
    }
    if (body.password !== undefined && body.password.length > 0) {
      if (body.password.length < 6) throw new BadRequestException('Password minimal 6 karakter');
      const hash = await bcrypt.hash(body.password, 12);
      await this.prisma.$executeRaw`UPDATE users SET password_hash = ${hash}, updated_at = NOW() WHERE id = ${id}::uuid`;
    }
    await this.audit.log({
      adminId: admin.id, action: 'user.update_account', resourceType: 'user', resourceId: id,
      changes: { name: body.name, email: body.email, passwordChanged: !!body.password }, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // PATCH /admin/cleaners/:id — admin update bringsTools / tier / serviceAreas
  @Patch('cleaners/:id')
  @Roles('super_admin', 'ops')
  async updateCleaner(
    @Param('id') id: string,
    @Body() body: { bringsTools?: boolean; tier?: string; serviceAreas?: string[] },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (body.bringsTools !== undefined) {
      await this.prisma.$executeRaw`UPDATE cleaner_profiles SET brings_tools = ${body.bringsTools}, updated_at = NOW() WHERE user_id = ${id}::uuid`;
    }
    if (body.tier !== undefined) {
      await this.prisma.$executeRaw`UPDATE cleaner_profiles SET tier = ${body.tier}, updated_at = NOW() WHERE user_id = ${id}::uuid`;
    }
    if (body.serviceAreas !== undefined) {
      await this.prisma.$executeRaw`UPDATE cleaner_profiles SET service_areas = ${JSON.stringify(body.serviceAreas)}::jsonb, updated_at = NOW() WHERE user_id = ${id}::uuid`;
    }
    await this.audit.log({
      adminId: admin.id, action: 'cleaner.update', resourceType: 'cleaner_profile', resourceId: id,
      changes: body, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // DELETE /admin/cleaners/:id — hard delete cleaner (NULL non-cascade FKs + DELETE user)
  @Delete('cleaners/:id')
  @Roles('super_admin', 'ops')
  async deleteCleaner(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string | null; is_freelancer: boolean }[]>`
      SELECT id, name, is_freelancer FROM users WHERE id = ${id}::uuid LIMIT 1
    `;
    if (rows.length === 0) throw new BadRequestException('Cleaner tidak ditemukan');
    if (!rows[0]!.is_freelancer) throw new BadRequestException('User ini bukan cleaner');

    // Cek active jobs — jangan hapus kalau lagi pegang booking
    const active = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM bookings
       WHERE cleaner_id = ${id}::uuid
         AND status IN ('matched', 'on_the_way', 'in_progress')
    `;
    if (Number(active[0]?.c ?? 0) > 0) {
      throw new BadRequestException('Cleaner masih punya job aktif — selesaikan dulu sebelum hapus');
    }

    // Hard delete — NULL out non-cascading FK refs, lalu DELETE user (CASCADE handle sisanya)
    await this.hardDeleteUser(id);

    await this.audit.log({
      adminId: admin.id,
      action: 'cleaner.delete',
      resourceType: 'user',
      resourceId: id,
      changes: { reason: body.reason ?? null, name: rows[0]!.name },
      ipAddress: req.ip ?? null,
    });

    return { ok: true };
  }

  // Shared hard-delete helper — NULL semua non-cascade FK ke users(id), lalu DELETE user.
  // Dipakai oleh deleteCustomer dan deleteCleaner.
  private async hardDeleteUser(id: string): Promise<void> {
    // bookings
    await this.prisma.$executeRaw`UPDATE bookings SET cleaner_id = NULL WHERE cleaner_id = ${id}::uuid`;
    await this.prisma.$executeRaw`UPDATE bookings SET customer_id = NULL WHERE customer_id = ${id}::uuid`;
    // booking_photos
    await this.prisma.$executeRaw`UPDATE booking_photos SET uploaded_by = NULL WHERE uploaded_by = ${id}::uuid`;
    // booking_upcharges (FK tidak cascade)
    await this.prisma.$executeRaw`UPDATE booking_upcharges SET cleaner_id = NULL WHERE cleaner_id = ${id}::uuid`;
    await this.prisma.$executeRaw`UPDATE booking_upcharges SET decided_by_user_id = NULL WHERE decided_by_user_id = ${id}::uuid`;
    // booking_helpers.invited_by adalah NOT NULL — harus DELETE row
    await this.prisma.$executeRaw`DELETE FROM booking_helpers WHERE invited_by = ${id}::uuid`;
    // chat_messages
    await this.prisma.$executeRaw`DELETE FROM chat_messages WHERE sender_id = ${id}::uuid OR recipient_id = ${id}::uuid`;
    // referrals
    await this.prisma.$executeRaw`UPDATE referrals SET referrer_id = NULL WHERE referrer_id = ${id}::uuid`;
    await this.prisma.$executeRaw`UPDATE referrals SET referred_id = NULL WHERE referred_id = ${id}::uuid`;
    // ratings
    await this.prisma.$executeRaw`UPDATE ratings SET rater_id = NULL WHERE rater_id = ${id}::uuid`;
    await this.prisma.$executeRaw`UPDATE ratings SET ratee_id = NULL WHERE ratee_id = ${id}::uuid`;
    // disputes
    await this.prisma.$executeRaw`UPDATE disputes SET raised_by = NULL WHERE raised_by = ${id}::uuid`;
    // wallet_ledger_entries: trigger ledger_immutable memblokir DELETE dan UPDATE user_id.
    // Disable trigger sementara untuk allow anonymisasi saat hard delete user.
    await this.prisma.$executeRawUnsafe(`ALTER TABLE wallet_ledger_entries DISABLE TRIGGER ledger_immutable`);
    await this.prisma.$executeRaw`UPDATE wallet_ledger_entries SET user_id = NULL WHERE user_id = ${id}::uuid`;
    await this.prisma.$executeRawUnsafe(`ALTER TABLE wallet_ledger_entries ENABLE TRIGGER ledger_immutable`);
    // withdrawals
    await this.prisma.$executeRaw`UPDATE withdrawals SET user_id = NULL WHERE user_id = ${id}::uuid`;
    // payments
    await this.prisma.$executeRaw`UPDATE payments SET user_id = NULL WHERE user_id = ${id}::uuid`;
    // voucher_usage
    await this.prisma.$executeRaw`UPDATE voucher_usage SET user_id = NULL WHERE user_id = ${id}::uuid`;
    // city_requests (user_id nullable FK ke users)
    await this.prisma.$executeRaw`UPDATE city_requests SET user_id = NULL WHERE user_id = ${id}::uuid`;
    // cleaner_area_requests.reviewed_by_admin_id → admin_users (ON DELETE SET NULL, auto-handled)
    // city_requests.reviewed_by_admin_id → admin_users (ON DELETE SET NULL, auto-handled)
    // referral_codes
    await this.prisma.$executeRaw`DELETE FROM referral_codes WHERE user_id = ${id}::uuid`;
    // Akhirnya hapus user — tabel dengan ON DELETE CASCADE handle otomatis
    await this.prisma.$executeRaw`DELETE FROM users WHERE id = ${id}::uuid`;
  }

  // GET wallet detail untuk user tertentu (customer atau cleaner)
  @Get('users/:id/wallet')
  @Roles('super_admin', 'ops', 'support')
  async userWallet(@Param('id') id: string) {
    const balRow = await this.prisma.$queryRaw<{ credit_in: number | null; credit_out: number | null }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN account_type IN ('refund_credit','topup','earnings') AND status='CLEARED' THEN amount ELSE 0 END),0) AS credit_in,
        COALESCE(SUM(CASE WHEN account_type IN ('credit_use','withdrawal','admin_debit') AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END),0) AS credit_out
      FROM wallet_ledger_entries WHERE user_id = ${id}::uuid
    `;
    const balance = Number(balRow[0]?.credit_in ?? 0) - Number(balRow[0]?.credit_out ?? 0);
    const ledger = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, account_type AS "accountType", amount, reference_type AS "referenceType",
             reference_id AS "referenceId", status, description,
             created_at AS "createdAt", cleared_at AS "clearedAt"
        FROM wallet_ledger_entries
       WHERE user_id = ${id}::uuid
       ORDER BY created_at DESC LIMIT 50
    `;
    return { balance, ledger };
  }

  // POST adjust saldo manual (admin top-up atau admin debit)
  @Post('users/:id/wallet-adjust')
  @Roles('super_admin', 'ops')
  async walletAdjust(
    @Param('id') id: string,
    @Body() body: { amount: number; type: 'credit' | 'debit'; reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.amount || body.amount <= 0) throw new BadRequestException('Nominal harus > 0');
    if (!body?.reason || body.reason.length < 5) throw new BadRequestException('Alasan min 5 karakter');
    if (body.type !== 'credit' && body.type !== 'debit') throw new BadRequestException('Type harus credit/debit');

    const userExists = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${id}::uuid LIMIT 1`;
    if (userExists.length === 0) throw new BadRequestException('User tidak ditemukan');

    const accountType = body.type === 'credit' ? 'refund_credit' : 'admin_debit';
    await this.prisma.$executeRaw`
      INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
      VALUES (${id}::uuid, ${accountType}, ${body.amount}, 'admin_adjust', NULL, 'CLEARED', NOW(), ${'Admin ' + body.type + ': ' + body.reason})
    `;
    await this.audit.log({
      adminId: admin.id, action: 'wallet.adjust', resourceType: 'user', resourceId: id,
      changes: { type: body.type, amount: body.amount, reason: body.reason }, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // Admin tolak foto profil cleaner — clear photo_url, set is_available=false, notif cleaner
  @Post('cleaners/:id/reject-photo')
  @Roles('super_admin', 'ops')
  async rejectPhoto(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason || body.reason.length < 5) throw new BadRequestException('Alasan min 5 karakter');
    const rows = await this.prisma.$queryRaw<{ id: string; name: string | null; is_freelancer: boolean; photo_url: string | null }[]>`
      SELECT id, name, is_freelancer, photo_url FROM users WHERE id = ${id}::uuid LIMIT 1
    `;
    if (rows.length === 0) throw new BadRequestException('Cleaner tidak ditemukan');
    if (!rows[0]!.is_freelancer) throw new BadRequestException('User ini bukan cleaner');
    if (!rows[0]!.photo_url) throw new BadRequestException('Cleaner belum punya foto');

    await this.prisma.$executeRaw`UPDATE users SET photo_url = NULL WHERE id = ${id}::uuid`;
    await this.prisma.$executeRaw`UPDATE cleaner_profiles SET is_available = FALSE WHERE user_id = ${id}::uuid`;
    await this.audit.log({
      adminId: admin.id, action: 'cleaner.photo.reject', resourceType: 'user', resourceId: id,
      changes: { reason: body.reason }, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // NOTE: GET /admin/users sekarang di-handle oleh AdminUsersController (users-admin.controller.ts)
  // yang punya filter q/status/role + photoUrl + strikes. Endpoint duplicate di sini sebelumnya
  // bayangin filter-nya sehingga UI Banned filter gak jalan. Dihapus.

  @Patch('bookings/:id/assign')
  @Roles('super_admin', 'ops')
  async assignCleaner(
    @Param('id') id: string,
    @Body() body: { cleanerId: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    if (!body.cleanerId) throw new BadRequestException('cleanerId wajib');
    await this.audit.log({
      adminId: admin.id, action: 'booking.assign', resourceType: 'booking', resourceId: id,
      changes: { cleanerId: body.cleanerId }, ipAddress: req.ip ?? null,
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE bookings SET cleaner_id = $1::uuid, status = 'matched', matched_at = NOW() WHERE id = $2::uuid`,
      body.cleanerId,
      id,
    );
    // Notify customer + cleaner
    const rows = await this.prisma.$queryRaw<{ customer_id: string | null }[]>`
      SELECT customer_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const customerId = rows[0]?.customer_id;
    if (customerId) {
      void this.push.send({ userId: customerId, channel: 'booking', title: 'Cleaner sudah ditemukan', body: 'Tap untuk lihat detail & chat dengan cleaner kamu.', data: { type: 'booking_matched', bookingId: id } }).catch(() => {});
    }
    void this.push.send({ userId: body.cleanerId, channel: 'booking', title: 'Job baru di-assign', body: 'Kamu mendapat job baru. Buka untuk konfirmasi.', data: { type: 'job_assigned', bookingId: id } }).catch(() => {});
    return { ok: true };
  }
}

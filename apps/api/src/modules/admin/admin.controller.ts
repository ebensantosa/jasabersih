import { Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Body, BadRequestException, Req } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PushService } from '../notifications/push.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('bookings')
  async listBookings(
    @Query('status') status?: string,
    @Query('from') from?: string,    // ISO date e.g. 2026-05-01
    @Query('to') to?: string,
  ) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        b.id, b.status, b.pricing_mode AS "pricingMode",
        b.total_amount AS total, b.scheduled_at AS "scheduledAt",
        b.address_line AS address, b.created_at AS "createdAt",
        cu.name AS "customerName", cu.phone AS "customerPhone",
        cl.name AS "cleanerName",
        s.name AS service
      FROM bookings b
      LEFT JOIN users cu ON cu.id = b.customer_id
      LEFT JOIN users cl ON cl.id = b.cleaner_id
      LEFT JOIN services s ON s.id = b.service_id
      WHERE 1=1
        AND (${status ?? null}::text IS NULL OR b.status = ${status ?? null})
        AND (${from ?? null}::date IS NULL OR b.created_at >= ${from ?? null}::date)
        AND (${to ?? null}::date IS NULL OR b.created_at < (${to ?? null}::date + INTERVAL '1 day'))
      ORDER BY b.created_at DESC
      LIMIT 200
    `;
  }

  @Get('cleaners')
  async listCleaners(@Query('status') status?: string) {
    const where = status
      ? `WHERE u.is_freelancer = TRUE AND cp.kyc_status = '${status.replace(/'/g, '')}'`
      : `WHERE u.is_freelancer = TRUE`;
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        u.id, u.name, u.phone, u.created_at AS "joinedAt",
        cp.kyc_status AS status,
        cp.tier,
        cp.brings_tools AS "bringsTools",
        cp.rating_avg AS rating,
        cp.total_jobs_done AS "jobsDone",
        cp.service_areas AS "serviceAreas"
      FROM users u
      LEFT JOIN cleaner_profiles cp ON cp.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    return rows;
  }

  // POST /admin/customers — manual create customer (admin-trusted, bypass OTP)
  @Post('customers')
  @UseGuards(AdminJwtGuard, AdminRbacGuard)
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

  // DELETE /admin/customers/:id — soft-delete customer
  @Delete('customers/:id')
  @UseGuards(AdminJwtGuard, AdminRbacGuard)
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

    await this.prisma.$executeRaw`
      UPDATE users SET deleted_at = NOW(), status = 'banned',
                       suspend_reason = ${body.reason || 'Dihapus oleh admin'}
       WHERE id = ${id}::uuid
    `;
    await this.prisma.$executeRaw`
      UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ${id}::uuid AND revoked_at IS NULL
    `;
    await this.audit.log({
      adminId: admin.id, action: 'customer.delete', resourceType: 'user', resourceId: id,
      changes: { reason: body.reason ?? null, name: rows[0]!.name }, ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // POST /admin/cleaners — manual create cleaner (admin-trusted, bypass OTP)
  @Post('cleaners')
  @UseGuards(AdminJwtGuard, AdminRbacGuard)
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
    const kycStatus = body.autoApprove ? 'approved' : 'pending';
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

  // DELETE /admin/cleaners/:id — soft-delete (deleted_at + status banned + revoke sessions)
  @Delete('cleaners/:id')
  @UseGuards(AdminJwtGuard, AdminRbacGuard)
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

    await this.prisma.$executeRaw`
      UPDATE users
         SET deleted_at = NOW(),
             status = 'banned',
             suspend_reason = ${body.reason || 'Dihapus oleh admin'}
       WHERE id = ${id}::uuid
    `;
    // Revoke semua refresh token aktif → user langsung ke-logout
    await this.prisma.$executeRaw`
      UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ${id}::uuid AND revoked_at IS NULL
    `;

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

  @Get('users')
  async listUsers() {
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        u.id, u.name, u.email, u.phone, u.created_at AS "joinedAt",
        u.is_customer AS "isCustomer",
        u.is_freelancer AS "isFreelancer",
        (SELECT COUNT(*) FROM bookings WHERE customer_id = u.id) AS "totalOrders"
      FROM users u
      WHERE u.is_customer = TRUE
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    return rows;
  }

  @Patch('bookings/:id/assign')
  async assignCleaner(
    @Param('id') id: string,
    @Body() body: { cleanerId: string },
  ): Promise<{ ok: true }> {
    if (!body.cleanerId) throw new BadRequestException('cleanerId wajib');
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

import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @Roles('super_admin', 'ops', 'support', 'fraud_analyst')
  async list(@Query('q') q?: string, @Query('status') status?: string, @Query('role') role?: 'customer' | 'cleaner') {
    const search = q && q.trim().length > 0 ? `%${q.trim()}%` : null;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        u.id, u.name, u.email, u.phone, u.photo_url AS "photoUrl", u.created_at AS "joinedAt",
        u.is_customer AS "isCustomer", u.is_freelancer AS "isFreelancer",
        u.status, u.suspended_until AS "suspendedUntil", u.suspend_reason AS "suspendReason",
        (SELECT COUNT(*) FROM bookings WHERE customer_id = u.id) AS "totalOrders",
        (SELECT COUNT(*) FROM fraud_strikes WHERE user_id = u.id) AS "strikes"
      FROM users u
      WHERE 1=1
        AND (${search}::text IS NULL OR u.name ILIKE ${search} OR u.phone ILIKE ${search} OR u.email ILIKE ${search})
        AND (${status ?? null}::text IS NULL OR u.status = ${status ?? null})
        AND (${role ?? null}::text IS NULL
             OR (${role ?? null} = 'customer' AND u.is_customer = TRUE)
             OR (${role ?? null} = 'cleaner' AND u.is_freelancer = TRUE))
      ORDER BY u.created_at DESC
      LIMIT 100
    `;
    return rows;
  }

  // === Cleaner area requests ===
  // PENTING: routes static (cleaner-area-requests) HARUS sebelum @Get(':id')
  // supaya NestJS gak interpret string sebagai param :id (UUID parse error).
  @Get('cleaner-area-requests')
  @Roles('super_admin', 'ops')
  async listCleanerAreaRequests() {
    return this.prisma.$queryRaw`
      SELECT r.id, r.city, r.notes, r.created_at AS "createdAt",
             u.id AS "cleanerId", u.name AS "cleanerName", u.phone AS "cleanerPhone",
             cp.service_areas AS "currentAreas", cp.domicile_city AS "domicileCity"
        FROM cleaner_area_requests r
        JOIN users u ON u.id = r.cleaner_id
        LEFT JOIN cleaner_profiles cp ON cp.user_id = r.cleaner_id
       ORDER BY r.created_at DESC LIMIT 200
    `;
  }

  @Post('cleaner-area-requests/:id/approve')
  @Roles('super_admin', 'ops')
  async approveCleanerAreaRequest(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const rows = await this.prisma.$queryRaw<{ cleaner_id: string; city: string }[]>`
      SELECT cleaner_id, city FROM cleaner_area_requests WHERE id = ${id}::uuid LIMIT 1
    `;
    const r = rows[0];
    if (!r) throw new BadRequestException('Request tidak ditemukan');

    // Tambahin city ke service_areas cleaner + delete request (no soft-keep,
    // audit trail udah ke-capture di admin_audit_log).
    await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `UPDATE cleaner_profiles
           SET service_areas = COALESCE(service_areas, '[]'::jsonb) || to_jsonb($1::text),
               updated_at = NOW()
         WHERE user_id = $2::uuid
           AND NOT (service_areas @> to_jsonb($1::text))`,
        r.city, r.cleaner_id,
      ),
      this.prisma.$executeRaw`DELETE FROM cleaner_area_requests WHERE id = ${id}::uuid`,
    ]);
    await this.audit.log({ adminId: admin.id, action: 'cleaner_area_request.approve', resourceType: 'cleaner_area_requests', resourceId: id, changes: { city: r.city, cleanerId: r.cleaner_id }, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Post('cleaner-area-requests/:id/reject')
  @Roles('super_admin', 'ops')
  async rejectCleanerAreaRequest(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const rows = await this.prisma.$queryRaw<{ cleaner_id: string; city: string }[]>`
      SELECT cleaner_id, city FROM cleaner_area_requests WHERE id = ${id}::uuid LIMIT 1
    `;
    const r = rows[0];
    if (!r) throw new BadRequestException('Request tidak ditemukan');
    await this.prisma.$executeRaw`DELETE FROM cleaner_area_requests WHERE id = ${id}::uuid`;
    await this.audit.log({ adminId: admin.id, action: 'cleaner_area_request.reject', resourceType: 'cleaner_area_requests', resourceId: id, changes: { city: r.city, cleanerId: r.cleaner_id, reason: body?.reason ?? null }, ipAddress: req.ip ?? null });
    return { ok: true };
  }

  @Get(':id')
  @Roles('super_admin', 'ops', 'support', 'fraud_analyst')
  async detail(@Param('id') id: string) {
    const user = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, name, email, phone, created_at AS "joinedAt",
             is_customer AS "isCustomer", is_freelancer AS "isFreelancer",
             status, suspended_until AS "suspendedUntil", suspend_reason AS "suspendReason",
             phone_verified_at AS "phoneVerifiedAt", email_verified_at AS "emailVerifiedAt"
      FROM users WHERE id = ${id}::uuid LIMIT 1
    `;
    if (user.length === 0) throw new BadRequestException('User tidak ditemukan.');
    const strikes = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, strike_type AS "strikeType", details, created_at AS "createdAt"
        FROM fraud_strikes WHERE user_id = ${id}::uuid ORDER BY created_at DESC LIMIT 50
    `;
    const recentBookings = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, status, total_amount AS total, scheduled_at AS "scheduledAt", created_at AS "createdAt"
        FROM bookings WHERE customer_id = ${id}::uuid OR cleaner_id = ${id}::uuid
        ORDER BY created_at DESC LIMIT 20
    `;
    return { user: user[0], strikes, recentBookings };
  }

  @Post(':id/suspend')
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async suspend(
    @Param('id') id: string,
    @Body() body: { reason: string; durationDays?: number },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new BadRequestException('Alasan wajib (min 5 karakter).');
    }
    const days = body.durationDays && body.durationDays > 0 ? body.durationDays : 7;
    await this.prisma.$executeRaw`
      UPDATE users
         SET status = 'suspended',
             suspended_until = NOW() + (${days}::int * INTERVAL '1 day'),
             suspend_reason = ${body.reason},
             suspended_by = ${admin.id}::uuid
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'user.suspend',
      resourceType: 'user',
      resourceId: id,
      changes: { reason: body.reason, durationDays: days },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Post(':id/ban')
  @Roles('super_admin', 'fraud_analyst')
  async ban(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new BadRequestException('Alasan wajib (min 5 karakter).');
    }
    await this.prisma.$executeRaw`
      UPDATE users
         SET status = 'banned',
             suspended_until = NULL,
             suspend_reason = ${body.reason},
             suspended_by = ${admin.id}::uuid
       WHERE id = ${id}::uuid
    `;
    // Auto-cancel pending bookings of banned user (as customer or cleaner)
    await this.prisma.$executeRaw`
      UPDATE bookings
         SET status = 'canceled',
             canceled_at = NOW(),
             cancellation_reason = 'admin_ban',
             cancelled_by = ${admin.id}::uuid
       WHERE (customer_id = ${id}::uuid OR cleaner_id = ${id}::uuid)
         AND status IN ('pending_payment', 'searching_cleaner', 'matched', 'confirmed')
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'user.ban',
      resourceType: 'user',
      resourceId: id,
      changes: { reason: body.reason },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Post(':id/unsuspend')
  @Roles('super_admin', 'ops')
  async unsuspend(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`
      UPDATE users
         SET status = 'active',
             suspended_until = NULL,
             suspend_reason = NULL,
             suspended_by = NULL
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'user.unsuspend',
      resourceType: 'user',
      resourceId: id,
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Get(':id/audit-trail')
  @Roles('super_admin', 'fraud_analyst')
  async auditTrail(@Param('id') id: string) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT a.action, a.resource_type AS "resourceType", a.changes, a.performed_at AS "performedAt",
             u.email AS "adminEmail", u.name AS "adminName"
        FROM admin_audit_log a
        LEFT JOIN admin_users u ON u.id = a.admin_id
        WHERE a.resource_id = ${id}::uuid
        ORDER BY a.performed_at DESC
        LIMIT 200
    `;
  }
}

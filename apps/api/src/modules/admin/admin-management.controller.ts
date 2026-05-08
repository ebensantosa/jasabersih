import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal, type AdminRole } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

const ROLES: AdminRole[] = ['super_admin', 'ops', 'finance', 'fraud_analyst', 'support'];

@ApiTags('admin-management')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/admins')
export class AdminManagementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @Roles('super_admin')
  async list() {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, email, name, role, is_active AS "isActive",
             last_login_at AS "lastLoginAt", created_at AS "createdAt"
        FROM admin_users ORDER BY created_at DESC
    `;
  }

  @Post()
  @Roles('super_admin')
  async create(
    @Body() body: { email: string; name: string; role: AdminRole; password: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body.email || !body.name || !body.role || !body.password) {
      throw new BadRequestException('email, name, role, password wajib.');
    }
    if (!ROLES.includes(body.role)) throw new BadRequestException(`role harus salah satu: ${ROLES.join(', ')}`);
    if (body.password.length < 8) throw new BadRequestException('Password minimum 8 karakter.');

    const hash = await bcrypt.hash(body.password, 10);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO admin_users (email, name, role, password_hash, is_active)
      VALUES (${body.email}, ${body.name}, ${body.role}, ${hash}, TRUE)
      RETURNING id
    `;
    const newId = rows[0]?.id;
    if (!newId) throw new BadRequestException('Gagal membuat admin.');
    await this.audit.log({
      adminId: admin.id,
      action: 'admin.create',
      resourceType: 'admin_user',
      resourceId: newId,
      changes: { email: body.email, role: body.role },
      ipAddress: req.ip ?? null,
    });
    return { id: newId };
  }

  @Patch(':id')
  @Roles('super_admin')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; role?: AdminRole; isActive?: boolean; password?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (body.role && !ROLES.includes(body.role)) throw new BadRequestException('Invalid role.');
    if (body.password && body.password.length < 8) throw new BadRequestException('Password minimum 8 karakter.');

    if (body.name !== undefined) {
      await this.prisma.$executeRaw`UPDATE admin_users SET name = ${body.name} WHERE id = ${id}::uuid`;
    }
    if (body.role !== undefined) {
      await this.prisma.$executeRaw`UPDATE admin_users SET role = ${body.role} WHERE id = ${id}::uuid`;
    }
    if (body.isActive !== undefined) {
      await this.prisma.$executeRaw`UPDATE admin_users SET is_active = ${body.isActive} WHERE id = ${id}::uuid`;
    }
    if (body.password) {
      const hash = await bcrypt.hash(body.password, 10);
      await this.prisma.$executeRaw`UPDATE admin_users SET password_hash = ${hash} WHERE id = ${id}::uuid`;
    }
    await this.audit.log({
      adminId: admin.id,
      action: 'admin.update',
      resourceType: 'admin_user',
      resourceId: id,
      changes: { name: body.name, role: body.role, isActive: body.isActive, passwordChanged: !!body.password },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  @Delete(':id')
  @Roles('super_admin')
  async deactivate(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    if (id === admin.id) throw new BadRequestException('Tidak bisa nonaktifkan akun sendiri.');
    await this.prisma.$executeRaw`UPDATE admin_users SET is_active = FALSE WHERE id = ${id}::uuid`;
    await this.audit.log({
      adminId: admin.id,
      action: 'admin.deactivate',
      resourceType: 'admin_user',
      resourceId: id,
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // Audit log viewer (cross-admin) — super_admin & fraud_analyst only
  @Get('audit-log')
  @Roles('super_admin', 'fraud_analyst')
  async auditLog(@Query('action') action?: string, @Query('adminId') adminId?: string, @Query('limit') limit?: string) {
    const lim = Math.min(Number(limit ?? 100), 500);
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT a.id, a.action, a.resource_type AS "resourceType", a.resource_id AS "resourceId",
             a.changes, a.ip_address AS "ipAddress", a.performed_at AS "performedAt",
             u.email AS "adminEmail", u.name AS "adminName", u.role AS "adminRole"
        FROM admin_audit_log a
        LEFT JOIN admin_users u ON u.id = a.admin_id
       WHERE (${action ?? null}::text IS NULL OR a.action = ${action ?? null})
         AND (${adminId ?? null}::uuid IS NULL OR a.admin_id = ${adminId ?? null}::uuid)
       ORDER BY a.performed_at DESC
       LIMIT ${lim}::int
    `;
  }
}

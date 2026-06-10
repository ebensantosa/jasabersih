import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';
import { StorageService } from '../storage/storage.service';

type KycListRow = {
  user_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  joined_at: Date;
  kyc_status: string | null;
  pending_docs: number;
  total_docs: number;
};

type KycDoc = {
  id: string;
  doc_type: string | null;
  storage_path: string;
  status: string | null;
  uploaded_at: Date;
  verified_at: Date | null;
  rejected_reason: string | null;
};

@ApiTags('admin-kyc')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/kyc')
export class AdminKycController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditService,
    private readonly push: PushService,
  ) {}

  // List cleaner with kyc_status pending or under_review.
  @Get('queue')
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async queue(@Query('status') status: 'pending' | 'under_review' | 'approved' | 'rejected' = 'pending') {
    const rows = await this.prisma.$queryRaw<KycListRow[]>`
      SELECT
        u.id AS user_id,
        u.name,
        u.phone,
        u.email,
        u.created_at AS joined_at,
        cp.kyc_status,
        COALESCE(SUM(CASE WHEN k.status = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending_docs,
        COUNT(k.id)::int AS total_docs
      FROM users u
      INNER JOIN cleaner_profiles cp ON cp.user_id = u.id
      LEFT JOIN kyc_documents k ON k.user_id = u.id
      WHERE cp.kyc_status = ${status}
      GROUP BY u.id, cp.kyc_status
      ORDER BY u.created_at ASC
      LIMIT 100
    `;
    return rows;
  }

  // Detail satu cleaner: profile + semua dokumen + signed URL untuk view.
  @Get(':userId')
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async detail(@Param('userId') userId: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const profile = await this.prisma.$queryRaw<
      {
        user_id: string;
        name: string | null;
        phone: string;
        email: string | null;
        kyc_status: string | null;
        bio: string | null;
        rejection_reason: string | null;
        joined_at: Date;
      }[]
    >`
      SELECT u.id AS user_id, u.name, u.phone, u.email, u.created_at AS joined_at,
             cp.kyc_status, cp.bio, cp.rejection_reason
        FROM users u
        INNER JOIN cleaner_profiles cp ON cp.user_id = u.id
        WHERE u.id = ${userId}::uuid LIMIT 1
    `;
    if (profile.length === 0) throw new NotFoundException('Cleaner tidak ditemukan.');

    const docs = await this.prisma.$queryRaw<KycDoc[]>`
      SELECT id, doc_type, storage_path, status, uploaded_at, verified_at, rejected_reason
        FROM kyc_documents WHERE user_id = ${userId}::uuid ORDER BY uploaded_at ASC
    `;

    const docsWithUrl = await Promise.all(
      docs.map(async (d) => ({
        ...d,
        viewUrl: await this.storage.getSignedReadUrl('private', d.storage_path, 600),
      })),
    );

    // Audit: viewing KYC docs is sensitive (PII)
    await this.audit.log({
      adminId: admin.id,
      action: 'kyc.view',
      resourceType: 'cleaner',
      resourceId: userId,
      ipAddress: req.ip ?? null,
    });

    return { profile: profile[0], documents: docsWithUrl };
  }

  // POST /admin/kyc/bulk-approve — approve banyak cleaner sekaligus.
  // Body: { userIds: string[] }. Max 50 per request biar gak overload.
  @Post('bulk-approve')
  @Roles('super_admin', 'ops')
  async bulkApprove(
    @Body() body: { userIds: string[] },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const ids = Array.isArray(body?.userIds) ? body.userIds.filter((x) => typeof x === 'string' && x.length > 0) : [];
    if (ids.length === 0) throw new BadRequestException('userIds wajib (array)');
    if (ids.length > 50) throw new BadRequestException('Maksimal 50 cleaner per bulk approve');

    let approved = 0;
    const errors: { userId: string; error: string }[] = [];
    for (const userId of ids) {
      try {
        await this.prisma.$transaction([
          this.prisma.$executeRaw`
            UPDATE cleaner_profiles
               SET kyc_status = 'approved',
                   approved_at = NOW(),
                   approved_by = ${admin.id}::uuid,
                   rejection_reason = NULL
             WHERE user_id = ${userId}::uuid
          `,
          this.prisma.$executeRaw`
            UPDATE kyc_documents
               SET status = 'approved',
                   verified_at = NOW(),
                   reviewed_by = ${admin.id}::uuid,
                   rejected_reason = NULL
             WHERE user_id = ${userId}::uuid AND status != 'approved'
          `,
        ]);
        approved++;
        void this.push.send({ userId, channel: 'system', title: 'KYC kamu disetujui ✓', body: 'Selamat! Kamu sudah bisa menerima order sekarang.', data: { type: 'kyc_approved' } }).catch(() => {});
      } catch (e: any) {
        errors.push({ userId, error: e?.message ?? 'failed' });
      }
    }
    await this.audit.log({
      adminId: admin.id,
      action: 'kyc.bulk_approve',
      resourceType: 'cleaner',
      resourceId: null,
      changes: { count: approved, totalRequested: ids.length, errorCount: errors.length },
      ipAddress: req.ip ?? null,
    });
    return { approved, errors };
  }

  @Post(':userId/approve')
  @Roles('super_admin', 'ops')
  async approve(@Param('userId') userId: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE cleaner_profiles
           SET kyc_status = 'approved',
               approved_at = NOW(),
               approved_by = ${admin.id}::uuid,
               rejection_reason = NULL
         WHERE user_id = ${userId}::uuid
      `,
      this.prisma.$executeRaw`
        UPDATE kyc_documents
           SET status = 'approved',
               verified_at = NOW(),
               reviewed_by = ${admin.id}::uuid,
               rejected_reason = NULL
         WHERE user_id = ${userId}::uuid AND status != 'approved'
      `,
    ]);
    await this.audit.log({
      adminId: admin.id,
      action: 'kyc.approve',
      resourceType: 'cleaner',
      resourceId: userId,
      ipAddress: req.ip ?? null,
    });
    void this.push.send({ userId, channel: 'system', title: 'KYC kamu disetujui ✓', body: 'Selamat! Kamu sudah bisa menerima order sekarang.', data: { type: 'kyc_approved' } }).catch(() => {});
    return { ok: true };
  }

  @Post(':userId/reject')
  @Roles('super_admin', 'ops')
  async reject(
    @Param('userId') userId: string,
    @Body() body: { reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason || body.reason.trim().length < 5) {
      throw new BadRequestException('Alasan reject wajib (min 5 karakter).');
    }
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE cleaner_profiles
           SET kyc_status = 'rejected',
               rejection_reason = ${body.reason}
         WHERE user_id = ${userId}::uuid
      `,
      this.prisma.$executeRaw`
        UPDATE kyc_documents
           SET status = 'rejected',
               rejected_reason = ${body.reason},
               reviewed_by = ${admin.id}::uuid
         WHERE user_id = ${userId}::uuid AND status = 'pending'
      `,
    ]);
    await this.audit.log({
      adminId: admin.id,
      action: 'kyc.reject',
      resourceType: 'cleaner',
      resourceId: userId,
      changes: { reason: body.reason },
      ipAddress: req.ip ?? null,
    });
    void this.push.send({ userId, channel: 'system', title: 'KYC ditolak', body: body.reason, data: { type: 'kyc_rejected' } }).catch(() => {});
    return { ok: true };
  }

  @Post(':userId/request-redocument')
  @Roles('super_admin', 'ops')
  async requestRedoc(
    @Param('userId') userId: string,
    @Body() body: { reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason) throw new BadRequestException('Alasan wajib.');
    await this.prisma.$executeRaw`
      UPDATE cleaner_profiles
         SET kyc_status = 'pending',
             rejection_reason = ${body.reason}
       WHERE user_id = ${userId}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'kyc.request_redocument',
      resourceType: 'cleaner',
      resourceId: userId,
      changes: { reason: body.reason },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }
}

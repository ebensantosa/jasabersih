import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../notifications/push.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('admin-disputes')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditService,
    private readonly push: PushService,
  ) {}

  @Get()
  @Roles('super_admin', 'ops', 'fraud_analyst', 'support')
  async list(@Query('status') status: 'open' | 'in_progress' | 'resolved' | 'escalated' = 'open') {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT d.id, d.booking_id AS "bookingId", d.type, d.description, d.status, d.priority,
             d.created_at AS "createdAt", d.sla_due_at AS "slaDueAt",
             d.resolution, d.payout_amount AS "payoutAmount",
             d.resolved_at AS "resolvedAt",
             d.assigned_to AS "assignedTo",
             d.subject_user_id AS "subjectUserId",
             ru.name AS "raisedByName", ru.phone AS "raisedByPhone",
             su.name AS "subjectName", su.phone AS "subjectPhone",
             au.name AS "assignedAdminName"
        FROM disputes d
        LEFT JOIN users ru ON ru.id = d.raised_by
        LEFT JOIN users su ON su.id = d.subject_user_id
        LEFT JOIN admin_users au ON au.id = d.assigned_to
       WHERE d.status = ${status}
       ORDER BY
         CASE d.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
         d.created_at ASC
       LIMIT 200
    `;
  }

  @Get(':id')
  @Roles('super_admin', 'ops', 'fraud_analyst', 'support')
  async detail(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    const rows = await this.prisma.$queryRaw<Record<string, any>[]>`
      SELECT d.*, ru.name AS "raisedByName", ru.phone AS "raisedByPhone",
             su.name AS "subjectName", su.phone AS "subjectPhone",
             b.status AS "bookingStatus", b.total_amount AS "bookingTotal",
             b.scheduled_at AS "bookingScheduledAt", b.address_line AS "bookingAddress"
        FROM disputes d
        LEFT JOIN users ru ON ru.id = d.raised_by
        LEFT JOIN users su ON su.id = d.subject_user_id
        LEFT JOIN bookings b ON b.id = d.booking_id
        WHERE d.id = ${id}::uuid LIMIT 1
    `;
    if (rows.length === 0) throw new NotFoundException('Dispute tidak ditemukan.');
    const dispute = rows[0]!;

    // Sign URL untuk evidence (kalau format-nya { type, key })
    let signedEvidence: any[] = [];
    if (Array.isArray(dispute.evidence)) {
      signedEvidence = await Promise.all(
        (dispute.evidence as any[]).map(async (ev) => {
          if (ev?.key) {
            return { ...ev, url: await this.storage.getSignedReadUrl('private', ev.key, 600) };
          }
          return ev;
        }),
      );
    }

    await this.audit.log({
      adminId: admin.id,
      action: 'dispute.view',
      resourceType: 'dispute',
      resourceId: id,
      ipAddress: req.ip ?? null,
    });

    return { dispute: { ...dispute, evidence: signedEvidence } };
  }

  @Post(':id/assign')
  @Roles('super_admin', 'ops')
  async assign(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request) {
    await this.prisma.$executeRaw`
      UPDATE disputes
         SET assigned_to = ${admin.id}::uuid,
             status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'dispute.assign_self',
      resourceType: 'dispute',
      resourceId: id,
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // Resolve dispute. Action: refund_customer | debit_cleaner | warn_both | dismiss | suspend_subject
  @Post(':id/resolve')
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async resolve(
    @Param('id') id: string,
    @Body() body: {
      action: 'refund_customer' | 'debit_cleaner' | 'warn_both' | 'dismiss' | 'suspend_subject' | 'warranty_redo_approved';
      payoutAmount?: number;     // refund/debit amount in Rupiah
      resolution: string;         // explanation
      suspendDays?: number;       // for suspend_subject
    },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.action || !body?.resolution || body.resolution.trim().length < 10) {
      throw new BadRequestException('Action & resolution (min 10 char) wajib.');
    }
    const needsAmount = body.action === 'refund_customer' || body.action === 'debit_cleaner';
    if (needsAmount && (!body.payoutAmount || body.payoutAmount <= 0)) {
      throw new BadRequestException('payoutAmount wajib untuk refund/debit.');
    }

    // Idempotency guard: cegah double-refund kalau admin klik resolve dua kali.
    const disputeCheck = await this.prisma.$queryRaw<{ status: string }[]>`
      SELECT status FROM disputes WHERE id = ${id}::uuid LIMIT 1
    `;
    if (!disputeCheck[0] || disputeCheck[0].status === 'resolved') {
      throw new BadRequestException('Dispute sudah resolved.');
    }

    // Get dispute info to know subject
    const drow = await this.prisma.$queryRaw<{ subject_user_id: string | null; booking_id: string | null }[]>`
      SELECT subject_user_id, booking_id FROM disputes WHERE id = ${id}::uuid LIMIT 1
    `;
    const dispute = drow[0];
    if (!dispute) throw new NotFoundException('Dispute tidak ditemukan.');

    // Update dispute status
    await this.prisma.$executeRaw`
      UPDATE disputes
         SET status = 'resolved',
             resolution = ${body.resolution},
             payout_amount = ${body.payoutAmount ?? null}::bigint,
             resolved_by_admin = ${admin.id}::uuid,
             resolved_at = NOW()
       WHERE id = ${id}::uuid
    `;

    // Garansi disetujui — booking di-reopen ke status 'searching' biar cleaner balik (atau admin assign manual)
    if (body.action === 'warranty_redo_approved' && dispute.booking_id) {
      await this.prisma.$executeRaw`
        UPDATE bookings
           SET status = 'searching',
               cleaner_id = NULL,
               matched_at = NULL,
               admin_notes = COALESCE(admin_notes, '') || E'\n[garansi] ' || ${body.resolution}
         WHERE id = ${dispute.booking_id}::uuid
      `;
      // Reverse earning cleaner (kalau sudah CLEARED, balikin saldo platform via reversal entry)
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
         SELECT user_id, 'earnings_reversal', -amount, reference_type, reference_id, 'CLEARED', NOW(), 'Reversal — garansi bersihkan ulang approved'
           FROM wallet_ledger_entries
          WHERE reference_type = 'booking' AND reference_id = $1::uuid
            AND account_type = 'earnings' AND amount > 0
          LIMIT 1`,
        dispute.booking_id,
      );
    }

    // Credit refund ke wallet customer (raised_by) saat action = refund_customer
    if (body.action === 'refund_customer' && body.payoutAmount && body.payoutAmount > 0) {
      const r = await this.prisma.$queryRaw<{ raised_by: string | null }[]>`
        SELECT raised_by FROM disputes WHERE id = ${id}::uuid LIMIT 1
      `;
      const customerId = r[0]?.raised_by;
      if (customerId) {
        await this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${customerId}::uuid, 'refund_credit', ${body.payoutAmount}::bigint, 'dispute', ${id}::uuid, 'CLEARED', NOW(), ${'Refund dispute: ' + body.resolution.slice(0, 200)})
        `;
      }
    }

    // Debit cleaner + kompensasi ke customer saat action = debit_cleaner
    if (body.action === 'debit_cleaner' && body.payoutAmount && body.payoutAmount > 0) {
      const r = await this.prisma.$queryRaw<{ raised_by: string | null }[]>`
        SELECT raised_by FROM disputes WHERE id = ${id}::uuid LIMIT 1
      `;
      const customerId = r[0]?.raised_by;
      // Potong saldo cleaner (admin_debit dikurangi dari balance di formula wallet)
      if (dispute.subject_user_id) {
        await this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${dispute.subject_user_id}::uuid, 'admin_debit', ${body.payoutAmount}::bigint, 'dispute', ${id}::uuid,
                  'CLEARED', NOW(), ${'Potongan sengketa: ' + body.resolution.slice(0, 200)})
        `;
      }
      // Kompensasi langsung ke customer (uang dari potongan cleaner)
      if (customerId) {
        await this.prisma.$executeRaw`
          INSERT INTO wallet_ledger_entries (user_id, account_type, amount, reference_type, reference_id, status, cleared_at, description)
          VALUES (${customerId}::uuid, 'refund_credit', ${body.payoutAmount}::bigint, 'dispute', ${id}::uuid,
                  'CLEARED', NOW(), ${'Kompensasi sengketa: ' + body.resolution.slice(0, 200)})
        `;
      }
    }

    // Side effects per action
    if (body.action === 'suspend_subject' && dispute.subject_user_id) {
      const days = body.suspendDays ?? 14;
      await this.prisma.$executeRaw`
        UPDATE users
           SET status = 'suspended',
               suspended_until = NOW() + (${days}::int * INTERVAL '1 day'),
               suspend_reason = ${'Dispute resolved: ' + body.resolution.slice(0, 200)},
               suspended_by = ${admin.id}::uuid
         WHERE id = ${dispute.subject_user_id}::uuid
      `;
      // Force offline cleaner yang kena suspend supaya gak nongol di pool
      // broadcast & gak bisa accept job baru.
      await this.prisma.$executeRaw`
        UPDATE cleaner_profiles SET is_available = FALSE
         WHERE user_id = ${dispute.subject_user_id}::uuid
      `;
    }

    // Record fraud strike on subject if action = debit_cleaner / suspend / refund_customer
    if (dispute.subject_user_id && ['debit_cleaner', 'suspend_subject', 'refund_customer'].includes(body.action)) {
      await this.prisma.$executeRaw`
        INSERT INTO fraud_strikes (user_id, strike_type, reference_id, details)
        VALUES (
          ${dispute.subject_user_id}::uuid,
          ${'dispute_' + body.action},
          ${id}::uuid,
          ${JSON.stringify({ resolution: body.resolution, amount: body.payoutAmount ?? null })}::jsonb
        )
      `;
    }

    // CLEAR escrow earnings cleaner langsung setelah dispute resolved.
    // Sebelumnya pending entries nunggu cron 15-menitan -> cleaner liat saldo
    // masih pending walau dispute udh resolved. Sekarang flip PENDING -> CLEARED
    // utk booking yg disengketakan ini (skip kalau action=warranty_redo_approved
    // yg sengaja reverse earning).
    if (dispute.booking_id && body.action !== 'warranty_redo_approved') {
      await this.prisma.$executeRaw`
        UPDATE wallet_ledger_entries
           SET status = 'CLEARED', cleared_at = NOW()
         WHERE status = 'PENDING'
           AND account_type = 'earnings'
           AND reference_type = 'booking'
           AND reference_id = ${dispute.booking_id}::uuid
      `;
    }

    await this.audit.log({
      adminId: admin.id,
      action: 'dispute.resolve',
      resourceType: 'dispute',
      resourceId: id,
      changes: { action: body.action, payoutAmount: body.payoutAmount, resolution: body.resolution },
      ipAddress: req.ip ?? null,
    });

    // Notify both raised_by and subject
    const partyRows = await this.prisma.$queryRaw<{ raised_by: string | null; subject_user_id: string | null }[]>`
      SELECT raised_by, subject_user_id FROM disputes WHERE id = ${id}::uuid LIMIT 1
    `;
    const parties = partyRows[0];
    const summary = body.action === 'refund_customer' ? 'Refund disetujui' :
      body.action === 'debit_cleaner' ? 'Sengketa diputus — saldo cleaner dipotong' :
      body.action === 'suspend_subject' ? 'Akun di-suspend' :
      body.action === 'warn_both' ? 'Peringatan dikeluarkan' : 'Laporan ditolak';
    if (parties?.raised_by) {
      void this.push.send({ userId: parties.raised_by, channel: 'system', title: 'Sengketa selesai', body: summary, data: { type: 'dispute_resolved', disputeId: id } }).catch(() => {});
    }
    if (parties?.subject_user_id && parties.subject_user_id !== parties.raised_by) {
      void this.push.send({ userId: parties.subject_user_id, channel: 'system', title: 'Sengketa selesai', body: summary, data: { type: 'dispute_resolved', disputeId: id } }).catch(() => {});
    }

    return { ok: true };
  }

  @Post(':id/escalate')
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async escalate(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.reason) throw new BadRequestException('Alasan eskalasi wajib.');
    await this.prisma.$executeRaw`
      UPDATE disputes SET status = 'escalated', priority = 'urgent' WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'dispute.escalate',
      resourceType: 'dispute',
      resourceId: id,
      changes: { reason: body.reason },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }

  // Generate signed upload URL for admin to attach evidence (screenshots, etc)
  @Post(':id/evidence-upload-url')
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async evidenceUploadUrl(
    @Param('id') id: string,
    @Body() body: { contentType: string },
  ) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(body?.contentType)) {
      throw new BadRequestException(`contentType harus salah satu: ${allowed.join(', ')}`);
    }
    return this.storage.createUploadUrl({
      bucket: 'private',
      keyPrefix: `disputes/${id}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
  }

  // After upload, admin POSTs the key + caption to register it
  @Post(':id/evidence')
  @Roles('super_admin', 'ops', 'fraud_analyst')
  async addEvidence(
    @Param('id') id: string,
    @Body() body: { key: string; type: 'image' | 'pdf' | 'note'; caption?: string },
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    if (!body?.key || !body?.type) throw new BadRequestException('key & type wajib.');
    const newItem = {
      key: body.key,
      type: body.type,
      caption: body.caption ?? null,
      addedBy: admin.id,
      addedAt: new Date().toISOString(),
    };
    await this.prisma.$executeRaw`
      UPDATE disputes
         SET evidence = COALESCE(evidence, '[]'::jsonb) || ${JSON.stringify([newItem])}::jsonb
       WHERE id = ${id}::uuid
    `;
    await this.audit.log({
      adminId: admin.id,
      action: 'dispute.add_evidence',
      resourceType: 'dispute',
      resourceId: id,
      changes: { key: body.key, type: body.type },
      ipAddress: req.ip ?? null,
    });
    return { ok: true };
  }
}

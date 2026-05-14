import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AdminAuditService } from '../../common/admin-audit.service';
import { AdminJwtGuard, AdminRbacGuard, CurrentAdmin, Roles, type AdminPrincipal } from '../../common/admin-auth';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('admin-chat')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard, AdminRbacGuard)
@Controller('admin/chat')
export class AdminChatController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AdminAuditService) {}

  // List bookings dengan chat activity (latest first), termasuk count blocked.
  @Get('bookings')
  @Roles('super_admin', 'ops', 'support', 'fraud_analyst')
  async listBookings(@Query('q') q?: string, @Query('hasBlocked') hasBlocked?: string) {
    const search = q?.trim() ? `%${q.trim()}%` : null;
    const onlyBlocked = hasBlocked === 'true';
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        b.id AS "bookingId", b.status AS "bookingStatus",
        b.scheduled_at AS "scheduledAt", b.created_at AS "createdAt",
        cu.id AS "customerId", cu.name AS "customerName", cu.phone AS "customerPhone",
        cl.id AS "cleanerId", cl.name AS "cleanerName", cl.phone AS "cleanerPhone",
        COALESCE(
          pp.name,
          b.form_snapshot->>'packageName',
          b.form_snapshot->>'categoryName',
          s.name,
          sp.name,
          b.pricing_mode
        ) AS "serviceName",
        (SELECT COUNT(*)::int FROM chat_messages WHERE booking_id = b.id) AS "totalMessages",
        (SELECT COUNT(*)::int FROM chat_messages WHERE booking_id = b.id AND status = 'blocked') AS "blockedCount",
        (SELECT MAX(created_at) FROM chat_messages WHERE booking_id = b.id) AS "lastMessageAt"
      FROM bookings b
      LEFT JOIN users cu ON cu.id = b.customer_id
      LEFT JOIN users cl ON cl.id = b.cleaner_id
      LEFT JOIN services s ON s.id = b.service_id
      LEFT JOIN pricing_packages pp ON pp.id = b.package_id
      LEFT JOIN services sp ON sp.id = pp.service_id
      WHERE EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.booking_id = b.id)
        AND (${search}::text IS NULL OR cu.name ILIKE ${search} OR cu.phone ILIKE ${search} OR cl.name ILIKE ${search} OR cl.phone ILIKE ${search})
        AND (${!onlyBlocked} OR EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.booking_id = b.id AND cm.status = 'blocked'))
      ORDER BY "lastMessageAt" DESC NULLS LAST
      LIMIT 100
    `;
  }

  // Full chat thread untuk satu booking — admin view bisa lihat blocked juga.
  // Logged ke data_access_log + audit (UU PDP compliance).
  @Get('booking/:id/messages')
  @Roles('super_admin', 'ops', 'support', 'fraud_analyst')
  async messages(
    @Param('id') id: string,
    @Query('reason') accessReason: string | undefined,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ) {
    const messages = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT cm.id, cm.sender_id AS "senderId", cm.recipient_id AS "recipientId",
             cm.message_type AS "messageType", cm.content, cm.attachment_url AS "attachmentUrl",
             cm.status, cm.block_reason AS "blockReason", cm.created_at AS "createdAt",
             u.name AS "senderName", u.phone AS "senderPhone"
        FROM chat_messages cm
        LEFT JOIN users u ON u.id = cm.sender_id
       WHERE cm.booking_id = ${id}::uuid
       ORDER BY cm.created_at ASC
       LIMIT 1000
    `;

    // PDP compliance — log access to chat
    await this.prisma.$executeRaw`
      INSERT INTO data_access_log (accessor_id, accessor_type, resource_type, resource_id, access_reason)
      VALUES (${admin.id}::uuid, 'admin', 'chat_messages', ${id}::uuid, ${accessReason ?? 'review'})
    `;
    await this.prisma.$executeRaw`
      INSERT INTO admin_chat_access_log (admin_id, booking_id, access_reason)
      VALUES (${admin.id}::uuid, ${id}::uuid, ${accessReason ?? 'review'})
    `;
    await this.audit.log({
      adminId: admin.id, action: 'chat.view', resourceType: 'booking', resourceId: id,
      changes: { reason: accessReason ?? 'review', count: messages.length },
      ipAddress: req.ip ?? null,
    });

    return messages;
  }

  // List of all blocked messages — moderation queue
  @Get('blocked')
  @Roles('super_admin', 'fraud_analyst', 'ops')
  async blocked(@Query('limit') limitStr?: string) {
    const lim = Math.min(Number(limitStr ?? 100), 500);
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT cm.id, cm.booking_id AS "bookingId", cm.sender_id AS "senderId",
             cm.content, cm.block_reason AS "blockReason", cm.created_at AS "createdAt",
             u.name AS "senderName", u.phone AS "senderPhone", u.status AS "senderStatus",
             (SELECT COUNT(*)::int FROM fraud_strikes WHERE user_id = u.id) AS "totalStrikes"
        FROM chat_messages cm
        LEFT JOIN users u ON u.id = cm.sender_id
       WHERE cm.status = 'blocked'
       ORDER BY cm.created_at DESC
       LIMIT ${lim}::int
    `;
  }

  // Stats untuk dashboard fraud
  @Get('stats')
  @Roles('super_admin', 'fraud_analyst', 'ops')
  async stats() {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COUNT(*)::int AS "totalMessages",
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END)::int AS "blockedCount",
        COUNT(DISTINCT sender_id)::int AS "uniqueSenders",
        COUNT(DISTINCT booking_id)::int AS "activeChats"
      FROM chat_messages
      WHERE created_at > NOW() - INTERVAL '7 days'
    `;
    const byReason = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT block_reason AS "reason", COUNT(*)::int AS "count"
        FROM chat_messages
       WHERE status = 'blocked' AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY block_reason ORDER BY count DESC
    `;
    return { last7Days: rows[0], blockedByReason: byReason };
  }
}

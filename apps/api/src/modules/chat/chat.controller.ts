import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { StorageService } from '../storage/storage.service';
import { ChatGateway } from './chat.gateway';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly gateway: ChatGateway,
  ) {}

  // Presign upload URL untuk foto chat. Cuma participant booking yg boleh.
  @Post('booking/:id/image-upload-url')
  async imageUploadUrl(
    @Param('id') id: string,
    @Body() body: { contentType: string },
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(body?.contentType)) throw new BadRequestException('contentType invalid (JPG/PNG/WebP).');
    const rows = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_id: string | null }[]>`
      SELECT customer_id, cleaner_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new NotFoundException('booking not found');
    if (b.customer_id !== req.user.id && b.cleaner_id !== req.user.id) {
      throw new ForbiddenException('not a participant');
    }
    const presign = await this.storage.createUploadUrl({
      bucket: 'public',
      keyPrefix: `chat/${id}/${req.user.id}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
    return { ...presign, publicUrl: this.storage.getPublicUrl(presign.key) };
  }

  // List conversation per user — auto-pick partner (cleaner kalau user customer, customer kalau user cleaner)
  // Skip booking yang status 'completed' lebih dari 24 jam (chat sudah ke-prune)
  @Get('conversations')
  async conversations(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        b.id AS "bookingId",
        b.status,
        COALESCE(
          s.name,
          pp.name,
          ht.name,
          NULLIF(b.form_snapshot->>'packageName', ''),
          NULLIF(b.form_snapshot->>'tierName', ''),
          NULLIF(b.form_snapshot->>'categoryName', ''),
          CASE WHEN b.pricing_mode = 'hourly' THEN 'Layanan Per Jam' ELSE NULL END
        ) AS "packageName",
        CASE WHEN b.customer_id = ${req.user.id}::uuid THEN cl.id ELSE cu.id END AS "partnerId",
        CASE WHEN b.customer_id = ${req.user.id}::uuid THEN cl.name ELSE cu.name END AS "partnerName",
        CASE WHEN b.customer_id = ${req.user.id}::uuid THEN cl.photo_url ELSE cu.photo_url END AS "partnerPhotoUrl",
        CASE WHEN b.customer_id = ${req.user.id}::uuid THEN (cl.phone = '+62000000000001') ELSE (cu.phone = '+62000000000001') END AS "isAdmin",
        (SELECT CASE WHEN message_type = 'image' THEN '📷 Foto' ELSE content END FROM chat_messages WHERE booking_id = b.id AND status != 'blocked' ORDER BY created_at DESC LIMIT 1) AS "lastMessage",
        (SELECT created_at FROM chat_messages WHERE booking_id = b.id AND status != 'blocked' ORDER BY created_at DESC LIMIT 1) AS "lastTimestamp",
        (SELECT COUNT(*)::int FROM chat_messages WHERE booking_id = b.id AND recipient_id = ${req.user.id}::uuid AND status = 'sent' AND read_at IS NULL) AS "unread"
      FROM bookings b
      LEFT JOIN users cu ON cu.id = b.customer_id
      LEFT JOIN users cl ON cl.id = b.cleaner_id
      LEFT JOIN pricing_packages pp ON pp.id = b.package_id
      LEFT JOIN services s ON s.id = b.service_id
      LEFT JOIN pricing_hourly_tiers ht ON ht.id = b.hourly_tier_id
      WHERE (b.customer_id = ${req.user.id}::uuid OR b.cleaner_id = ${req.user.id}::uuid)
        AND b.cleaner_id IS NOT NULL
        AND b.status IN ('matched', 'cleaner_otw', 'on_the_way', 'in_progress', 'started', 'completed')
        AND (b.completed_at IS NULL OR b.completed_at > NOW() - INTERVAL '7 days')
        AND EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.booking_id = b.id)
      ORDER BY "lastTimestamp" DESC NULLS LAST
      LIMIT 50
    `;
  }

  // Hitung total pesan unread (status='sent', belum read, ditujukan ke user ini)
  @Get('unread-count')
  async unreadCount(@Req() req: Request & { user: AuthenticatedUser }) {
    const r = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM chat_messages
       WHERE recipient_id = ${req.user.id}::uuid
         AND status = 'sent'
         AND read_at IS NULL
    `;
    return { count: Number(r[0]?.c ?? 0) };
  }

  // Mark all chat msg untuk satu booking sebagai read
  @Post('booking/:id/read')
  async markRead(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    await this.prisma.$executeRaw`
      UPDATE chat_messages SET read_at = NOW()
       WHERE booking_id = ${id}::uuid
         AND recipient_id = ${req.user.id}::uuid
         AND read_at IS NULL
    `;
    // Broadcast 'read' event ke room booking supaya sender bisa langsung update
    // checkmark jadi double-check biru (real-time read receipt).
    this.gateway.broadcastRead(id, req.user.id);
    return { ok: true };
  }

  // History — paginate by createdAt desc, return latest first.
  @Get('booking/:id')
  async history(
    @Param('id') id: string,
    @Query('before') before: string | undefined,
    @Query('limit') limitStr: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const rows = await this.prisma.$queryRaw<{ customer_id: string | null; cleaner_id: string | null }[]>`
      SELECT customer_id, cleaner_id FROM bookings WHERE id = ${id}::uuid LIMIT 1
    `;
    const b = rows[0];
    if (!b) throw new NotFoundException('booking not found');
    if (b.customer_id !== req.user.id && b.cleaner_id !== req.user.id) {
      throw new ForbiddenException('not a participant');
    }
    const limit = Math.min(Number(limitStr ?? 50), 100);

    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT cm.id, cm.sender_id AS "senderId", cm.recipient_id AS "recipientId",
             cm.message_type AS "messageType", cm.content, cm.attachment_url AS "attachmentUrl",
             cm.status, cm.created_at AS "createdAt", cm.read_at AS "readAt",
             (u.phone = '+62000000000001') AS "isAdmin"
        FROM chat_messages cm
        LEFT JOIN users u ON u.id = cm.sender_id
       WHERE cm.booking_id = ${id}::uuid
         AND cm.status != 'blocked'
         AND (${before ?? null}::timestamptz IS NULL OR cm.created_at < ${before ?? null}::timestamptz)
       ORDER BY cm.created_at DESC
       LIMIT ${limit}::int
    `;
  }
}

import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly prisma: PrismaService) {}

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
      SELECT id, sender_id AS "senderId", recipient_id AS "recipientId",
             message_type AS "messageType", content, attachment_url AS "attachmentUrl",
             status, created_at AS "createdAt"
        FROM chat_messages
       WHERE booking_id = ${id}::uuid
         AND status != 'blocked'
         AND (${before ?? null}::timestamptz IS NULL OR created_at < ${before ?? null}::timestamptz)
       ORDER BY created_at DESC
       LIMIT ${limit}::int
    `;
  }
}

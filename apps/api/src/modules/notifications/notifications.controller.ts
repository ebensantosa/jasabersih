import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  // Register Expo push token (atau FCM langsung). Dipanggil mobile saat boot setelah auth.
  @Post('register-token')
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { token: string; deviceId: string; platform?: string; deviceFingerprint?: string },
  ) {
    if (!body?.token || !body?.deviceId) throw new BadRequestException('token & deviceId wajib.');
    await this.prisma.$executeRaw`
      INSERT INTO user_devices (user_id, device_id, fcm_token, platform, device_fingerprint, last_active_at)
      VALUES (${user.id}::uuid, ${body.deviceId}, ${body.token}, ${body.platform ?? null}, ${body.deviceFingerprint ?? null}, NOW())
      ON CONFLICT DO NOTHING
    `;
    // Update token kalau device sudah ada
    await this.prisma.$executeRaw`
      UPDATE user_devices
         SET fcm_token = ${body.token}, last_active_at = NOW(),
             platform = COALESCE(${body.platform ?? null}, platform),
             device_fingerprint = COALESCE(${body.deviceFingerprint ?? null}, device_fingerprint)
       WHERE user_id = ${user.id}::uuid AND device_id = ${body.deviceId}
    `;
    return { ok: true };
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, type, title, body, data, is_read AS "isRead", read_at AS "readAt", created_at AS "createdAt"
        FROM notifications WHERE user_id = ${user.id}::uuid
        ORDER BY created_at DESC LIMIT 100
    `;
  }

  @Post('mark-all-read')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    await this.prisma.$executeRaw`
      UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE user_id = ${user.id}::uuid AND is_read = FALSE
    `;
    return { ok: true };
  }
}

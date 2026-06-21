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
    @Body() body: { token: string; deviceId: string; platform?: string; deviceFingerprint?: string; mode?: 'customer' | 'freelancer' },
  ) {
    if (!body?.token || !body?.deviceId) throw new BadRequestException('token & deviceId wajib.');
    const mode = body.mode ?? null;
    // 1 token = 1 user — pindah ownership ke user terakhir login.
    await this.prisma.$executeRaw`
      DELETE FROM user_devices
       WHERE fcm_token = ${body.token} AND user_id <> ${user.id}::uuid
    `;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO user_devices (user_id, device_id, fcm_token, platform, device_fingerprint, current_mode, last_active_at)
        VALUES (${user.id}::uuid, ${body.deviceId}, ${body.token}, ${body.platform ?? null}, ${body.deviceFingerprint ?? null}, ${mode}, NOW())
        ON CONFLICT (user_id, fcm_token) WHERE fcm_token IS NOT NULL
        DO UPDATE SET
          last_active_at = NOW(),
          device_id = EXCLUDED.device_id,
          platform = COALESCE(EXCLUDED.platform, user_devices.platform),
          device_fingerprint = COALESCE(EXCLUDED.device_fingerprint, user_devices.device_fingerprint),
          current_mode = COALESCE(EXCLUDED.current_mode, user_devices.current_mode)
      `;
    } catch {
      // Kolom current_mode belum ada di DB — fallback tanpa kolom itu
      await this.prisma.$executeRaw`
        INSERT INTO user_devices (user_id, device_id, fcm_token, platform, device_fingerprint, last_active_at)
        VALUES (${user.id}::uuid, ${body.deviceId}, ${body.token}, ${body.platform ?? null}, ${body.deviceFingerprint ?? null}, NOW())
        ON CONFLICT (user_id, fcm_token) WHERE fcm_token IS NOT NULL
        DO UPDATE SET
          last_active_at = NOW(),
          device_id = EXCLUDED.device_id,
          platform = COALESCE(EXCLUDED.platform, user_devices.platform),
          device_fingerprint = COALESCE(EXCLUDED.device_fingerprint, user_devices.device_fingerprint)
      `;
    }
    return { ok: true };
  }

  // Unregister push token saat logout - cegah notif bocor ke device setelah
  // logout. Frontend wajib panggil ini SEBELUM clear local tokens.
  @Post('unregister-token')
  async unregister(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { token: string },
  ) {
    if (!body?.token) throw new BadRequestException('token wajib.');
    await this.prisma.$executeRaw`
      DELETE FROM user_devices
       WHERE user_id = ${user.id}::uuid AND fcm_token = ${body.token}
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

import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class PresenceController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /v1/users/:id/presence → { lastSeenAt, isOnline }
  // isOnline = last_seen_at <= 60 detik lalu
  @Get(':id/presence')
  async presence(@Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<{ last_seen_at: Date | null }[]>`
      SELECT last_seen_at FROM users WHERE id = ${id}::uuid LIMIT 1
    `;
    if (rows.length === 0) throw new NotFoundException('User tidak ditemukan');
    const lastSeen = rows[0]!.last_seen_at;
    const isOnline = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 60_000 : false;
    return { lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null, isOnline };
  }
}

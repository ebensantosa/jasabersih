import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { AdminJwtGuard } from '../../common/admin-auth';

@ApiTags('admin-call')
@Controller('admin/call')
@UseGuards(AdminJwtGuard)
export class AdminCallController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /admin/call/sessions — active calls + recent 50 calls
  @Get('sessions')
  async sessions() {
    const active = await this.prisma.$queryRaw<any[]>`
      SELECT cs.id, cs.booking_id AS "bookingId",
             cs.started_at AS "startedAt", cs.answered_at AS "answeredAt",
             cs.end_reason AS "endReason",
             EXTRACT(EPOCH FROM (NOW() - cs.started_at))::int AS "elapsedSec",
             ui.name AS "initiatorName", ur.name AS "recipientName"
        FROM call_sessions cs
        LEFT JOIN users ui ON ui.id = cs.initiator_id
        LEFT JOIN users ur ON ur.id = cs.recipient_id
       WHERE cs.ended_at IS NULL
       ORDER BY cs.started_at DESC
    `;

    const recent = await this.prisma.$queryRaw<any[]>`
      SELECT cs.id, cs.booking_id AS "bookingId",
             cs.started_at AS "startedAt", cs.answered_at AS "answeredAt",
             cs.ended_at AS "endedAt", cs.duration_sec AS "durationSec",
             cs.end_reason AS "endReason",
             ui.name AS "initiatorName", ur.name AS "recipientName"
        FROM call_sessions cs
        LEFT JOIN users ui ON ui.id = cs.initiator_id
        LEFT JOIN users ur ON ur.id = cs.recipient_id
       WHERE cs.ended_at IS NOT NULL
       ORDER BY cs.started_at DESC
       LIMIT 50
    `;

    return { active, recent };
  }
}

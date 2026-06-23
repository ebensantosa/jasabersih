import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CleanerGuard } from '../auth/role.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

type SlotInput = { dayOfWeek: number; startMinute: number; endMinute: number };

@ApiTags('cleaner-schedule')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CleanerGuard)
@Controller('cleaner/schedule')
export class CleanerScheduleController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /v1/cleaner/schedule — list jam kerja cleaner ini.
  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT day_of_week AS "dayOfWeek", start_minute AS "startMinute", end_minute AS "endMinute"
        FROM cleaner_working_hours WHERE user_id = ${user.id}::uuid
        ORDER BY day_of_week ASC, start_minute ASC
    `;
  }

  // PUT /v1/cleaner/schedule — replace full schedule (atomic).
  @Put()
  async set(@CurrentUser() user: AuthenticatedUser, @Body() body: { slots: SlotInput[] }) {
    if (!Array.isArray(body?.slots)) throw new BadRequestException('slots harus array.');
    for (const s of body.slots) {
      if (!Number.isInteger(s.dayOfWeek) || s.dayOfWeek < 0 || s.dayOfWeek > 6) {
        throw new BadRequestException('dayOfWeek 0-6.');
      }
      if (!Number.isInteger(s.startMinute) || s.startMinute < 0 || s.startMinute > 1440) {
        throw new BadRequestException('startMinute 0-1440.');
      }
      if (!Number.isInteger(s.endMinute) || s.endMinute <= s.startMinute || s.endMinute > 1440) {
        throw new BadRequestException('endMinute > startMinute, ≤ 1440.');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM cleaner_working_hours WHERE user_id = ${user.id}::uuid`;
      for (const s of body.slots) {
        await tx.$executeRaw`
          INSERT INTO cleaner_working_hours (user_id, day_of_week, start_minute, end_minute)
          VALUES (${user.id}::uuid, ${s.dayOfWeek}, ${s.startMinute}, ${s.endMinute})
          ON CONFLICT (user_id, day_of_week) DO UPDATE
            SET start_minute = EXCLUDED.start_minute, end_minute = EXCLUDED.end_minute
        `;
      }
    });
    return { ok: true, count: body.slots.length };
  }
}

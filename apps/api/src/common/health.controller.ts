import { Body, Controller, Get, Inject, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';

import { PrismaService } from './prisma.service';
import { REDIS_CLIENT } from './redis.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly log = new Logger('HealthTrace');
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // Public - no auth. Used by mobile to confirm OTA bundle loaded + API reachable.
  @Post('trace')
  trace(@Body() body: Record<string, unknown>): { ok: boolean } {
    this.log.log(`[trace] ${JSON.stringify(body)}`);
    return { ok: true };
  }

  @Get()
  async health(): Promise<{ status: string; db: boolean; redis: boolean }> {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping().then((r) => r === 'PONG').catch(() => false),
    ]);
    return { status: db && redis ? 'ok' : 'degraded', db, redis };
  }
}

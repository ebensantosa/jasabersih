import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { PrismaService } from '../../common/prisma.service';

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type JwtPayload = {
  sub: string;
  phone: string;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issueForUser(
    userId: string,
    phone: string,
    meta: { deviceId?: string; ipAddress?: string; userAgent?: string } = {},
  ): Promise<IssuedTokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';

    const payload: JwtPayload = { sub: userId, phone };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    const refreshHash = await bcrypt.hash(refreshToken, 12);
    const expiresAt = new Date(Date.now() + parseDurationMs(refreshTtl));

    await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash: refreshHash,
        deviceId: meta.deviceId ?? null,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresIn: parseDurationMs(accessTtl) / 1000 };
  }

  // Admin login: admin_users.id is NOT in users table, so skip user_sessions row.
  // Token revocation for admin relies on JWT expiry only (no DB-backed session).
  async issueForAdmin(adminId: string, email: string): Promise<IssuedTokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';
    const payload: JwtPayload = { sub: adminId, phone: email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });
    return { accessToken, refreshToken, expiresIn: parseDurationMs(accessTtl) / 1000 };
  }

  async rotate(refreshToken: string, meta: { deviceId?: string; ipAddress?: string; userAgent?: string }): Promise<IssuedTokens> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
    });

    const sessions = await this.prisma.userSession.findMany({
      where: { userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    let matched: (typeof sessions)[number] | null = null;
    for (const s of sessions) {
      if (await bcrypt.compare(refreshToken, s.refreshTokenHash)) {
        matched = s;
        break;
      }
    }
    if (!matched) {
      throw new Error('REFRESH_TOKEN_INVALID');
    }

    await this.prisma.userSession.update({
      where: { id: matched.id },
      data: { revokedAt: new Date() },
    });

    return this.issueForUser(payload.sub, payload.phone, meta);
  }

  async revoke(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const sessions = await this.prisma.userSession.findMany({
        where: { userId: payload.sub, revokedAt: null },
      });
      for (const s of sessions) {
        if (await bcrypt.compare(refreshToken, s.refreshTokenHash)) {
          await this.prisma.userSession.update({
            where: { id: s.id },
            data: { revokedAt: new Date() },
          });
          return;
        }
      }
    } catch {
      // Idempotent: revoke non-existent token tetap OK
    }
  }

  hashSecret(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

function parseDurationMs(input: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid duration: ${input}`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 'ms':
      return n;
    case 's':
      return n * 1000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    case 'd':
    case undefined:
      return n * 86_400_000;
    default:
      throw new Error(`Invalid duration unit: ${m[2]}`);
  }
}

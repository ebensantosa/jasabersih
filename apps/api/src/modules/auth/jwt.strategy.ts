import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../common/prisma.service';
import type { JwtPayload } from './token.service';

export type AuthenticatedUser = { id: string; phone: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Check user status — block suspended/banned/deleted accounts walaupun token masih valid
    const rows = await this.prisma.$queryRaw<{ status: string | null; suspended_until: Date | null; deleted_at: Date | null; suspend_reason: string | null }[]>`
      SELECT status, suspended_until, deleted_at, suspend_reason
        FROM users WHERE id = ${payload.sub}::uuid LIMIT 1
    `;
    const u = rows[0];
    // Kalau row gak ada di users table, kemungkinan ini admin token (admins di tabel admin_users).
    // Skip enforcement — endpoint admin punya AdminJwtGuard sendiri yang validate token-nya.
    if (!u) {
      return { id: payload.sub, phone: payload.phone };
    }
    if (u.deleted_at) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DELETED', message: 'Akun sudah dihapus.' });
    }
    if (u.status === 'banned') {
      throw new UnauthorizedException({ code: 'ACCOUNT_BANNED', message: u.suspend_reason || 'Akun kamu telah di-banned. Hubungi support.' });
    }
    if (u.status === 'suspended') {
      // Auto-unsuspend kalau suspended_until sudah lewat
      if (u.suspended_until && new Date(u.suspended_until).getTime() < Date.now()) {
        await this.prisma.$executeRaw`
          UPDATE users SET status = 'active', suspended_until = NULL, suspend_reason = NULL
           WHERE id = ${payload.sub}::uuid
        `;
      } else {
        const until = u.suspended_until ? new Date(u.suspended_until).toLocaleString('id-ID') : null;
        throw new UnauthorizedException({
          code: 'ACCOUNT_SUSPENDED',
          message: u.suspend_reason
            ? `Akun di-suspend: ${u.suspend_reason}${until ? ` (sampai ${until})` : ''}`
            : `Akun kamu di-suspend${until ? ` sampai ${until}` : ''}. Hubungi support.`,
        });
      }
    }
    return { id: payload.sub, phone: payload.phone };
  }
}

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';

type RequestMeta = { ipAddress?: string; userAgent?: string; deviceId?: string };

const WINDOW_MINUTES = 10;

@Injectable()
export class LoginProtectionService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(identifier: string, meta: RequestMeta = {}): Promise<void> {
    const scopes = this.buildScopes(identifier, meta);
    if (scopes.length === 0) return;

    let activeLock = 0;
    for (const scope of scopes) {
      const rows = await this.prisma.$queryRaw<{ lock_until: Date | null }[]>`
        SELECT lock_until
          FROM auth_login_attempts
         WHERE scope_type = ${scope.scopeType}
           AND scope_value = ${scope.scopeValue}
         LIMIT 1
      `;
      const ts = rows[0]?.lock_until ? new Date(rows[0].lock_until).getTime() : 0;
      if (ts > activeLock) activeLock = ts;
    }

    if (!activeLock) return;

    const remainingSec = Math.max(1, Math.ceil((activeLock - Date.now()) / 1000));
    throw new HttpException(
      {
        code: 'LOGIN_TEMP_LOCKED',
        message: `Terlalu banyak percobaan login. Coba lagi dalam ${this.humanizeSeconds(remainingSec)}.`,
        details: { remainingSeconds: remainingSec },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async recordFailure(identifier: string, meta: RequestMeta = {}): Promise<void> {
    const scopes = this.buildScopes(identifier, meta);
    for (const scope of scopes) {
      await this.prisma.$queryRawUnsafe(
        `
        INSERT INTO auth_login_attempts (
          scope_type, scope_value, failed_count, window_started_at, last_failed_at, lock_until, created_at, updated_at
        )
        VALUES ($1, $2, 1, NOW(), NOW(), NULL, NOW(), NOW())
        ON CONFLICT (scope_type, scope_value) DO UPDATE
           SET failed_count = CASE
                 WHEN auth_login_attempts.last_failed_at < NOW() - ($3::int * INTERVAL '1 minute') THEN 1
                 ELSE auth_login_attempts.failed_count + 1
               END,
               window_started_at = CASE
                 WHEN auth_login_attempts.last_failed_at < NOW() - ($3::int * INTERVAL '1 minute') THEN NOW()
                 ELSE auth_login_attempts.window_started_at
               END,
               last_failed_at = NOW(),
               lock_until = CASE
                 WHEN auth_login_attempts.last_failed_at < NOW() - ($3::int * INTERVAL '1 minute') THEN NULL
                 WHEN auth_login_attempts.failed_count + 1 >= 10 THEN NOW() + INTERVAL '15 minutes'
                 WHEN auth_login_attempts.failed_count + 1 >= 8 THEN NOW() + INTERVAL '5 minutes'
                 WHEN auth_login_attempts.failed_count + 1 >= 5 THEN NOW() + INTERVAL '1 minute'
                 ELSE auth_login_attempts.lock_until
               END,
               updated_at = NOW()
        `,
        scope.scopeType,
        scope.scopeValue,
        WINDOW_MINUTES,
      );
    }
  }

  async clearFailures(identifier: string, meta: RequestMeta = {}): Promise<void> {
    const scopes = this.buildScopes(identifier, meta);
    if (scopes.length === 0) return;
    for (const scope of scopes) {
      await this.prisma.$executeRaw`
        DELETE FROM auth_login_attempts
         WHERE scope_type = ${scope.scopeType}
           AND scope_value = ${scope.scopeValue}
      `;
    }
  }

  private buildScopes(identifier: string, meta: RequestMeta) {
    const scopes = [
      { scopeType: 'identifier', scopeValue: identifier },
    ];
    if (meta.ipAddress) scopes.push({ scopeType: 'ip', scopeValue: meta.ipAddress });
    if (meta.deviceId) scopes.push({ scopeType: 'device', scopeValue: meta.deviceId });
    return scopes;
  }

  private humanizeSeconds(seconds: number) {
    if (seconds < 60) return `${seconds} detik`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} menit`;
    const hours = Math.ceil(minutes / 60);
    return `${hours} jam`;
  }
}

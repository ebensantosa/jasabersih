import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from './prisma.service';

export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'fraud_analyst' | 'support';

export type AdminPrincipal = {
  id: string;
  email: string;
  role: AdminRole;
  name: string | null;
};

// Attach decoded admin to request. Verifies JWT, looks up admin_users row,
// rejects if account is_active = false.
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; admin?: AdminPrincipal; ip?: string }>();
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException({ code: 'NO_TOKEN', message: 'Token tidak ada.' });

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Sesi expired, silakan login ulang.' });
    }

    const rows = await this.prisma.$queryRaw<
      { id: string; email: string; name: string | null; role: AdminRole; is_active: boolean }[]
    >`SELECT id, email, name, role, is_active FROM admin_users WHERE id = ${payload.sub}::uuid LIMIT 1`;
    const admin = rows[0];
    if (!admin || !admin.is_active) {
      throw new UnauthorizedException({ code: 'ADMIN_NOT_FOUND', message: 'Akun admin tidak aktif.' });
    }

    req.admin = { id: admin.id, email: admin.email, role: admin.role, name: admin.name };
    return true;
  }
}

// Mark which roles can access an endpoint.
// Usage: @Roles('super_admin', 'fraud_analyst')
export const ROLES_KEY = 'admin_roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AdminRbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required || required.length === 0) return true; // no @Roles → any authenticated admin
    const req = ctx.switchToHttp().getRequest<{ admin?: AdminPrincipal }>();
    if (!req.admin) throw new UnauthorizedException();
    if (req.admin.role === 'super_admin') return true; // super_admin bypass
    if (!required.includes(req.admin.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Role kamu tidak punya akses ke action ini.' });
    }
    return true;
  }
}

// @CurrentAdmin() admin: AdminPrincipal
export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): AdminPrincipal => {
  const req = ctx.switchToHttp().getRequest<{ admin?: AdminPrincipal }>();
  if (!req.admin) throw new UnauthorizedException();
  return req.admin;
});

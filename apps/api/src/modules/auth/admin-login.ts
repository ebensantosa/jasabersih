import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';

import { TokenService, type IssuedTokens } from './token.service';

export const AdminLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type AdminLoginRequest = z.infer<typeof AdminLoginRequestSchema>;

export type AdminLoginResponse = IssuedTokens & {
  admin: { id: string; email: string; name: string; role: string };
};

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async login(input: AdminLoginRequest, meta: { ipAddress?: string; userAgent?: string } = {}): Promise<AdminLoginResponse> {
    // admin_users sudah ada di schema baseline (migration init)
    const result = await this.prisma.$queryRaw<
      { id: string; email: string; password_hash: string; name: string | null; role: string; is_active: boolean }[]
    >`SELECT id, email, password_hash, name, role, is_active
       FROM admin_users
       WHERE email = ${input.email} LIMIT 1`;

    const admin = result[0];
    if (!admin || !admin.is_active) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email atau password salah.' });
    }
    const ok = await bcrypt.compare(input.password, admin.password_hash);
    if (!ok) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email atau password salah.' });
    }

    // Update last_login_at
    await this.prisma.$executeRaw`UPDATE admin_users SET last_login_at = NOW() WHERE id = ${admin.id}::uuid`;

    // Issue JWT pakai TokenService yang sudah ada — userId pakai admin.id (treated as user)
    const tokens = await this.tokens.issueForUser(admin.id, admin.email, meta);
    return {
      ...tokens,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name ?? admin.email,
        role: admin.role,
      },
    };
  }
}

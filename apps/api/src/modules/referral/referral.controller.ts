import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 (ambiguous)
function genCode(len = 7): string {
  let c = '';
  for (let i = 0; i < len; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return c;
}

@ApiTags('referral')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('referral')
export class ReferralController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /v1/referral/me — get my code (auto-create kalau belum ada)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    let rows = await this.prisma.$queryRaw<{ code: string; total_referrals: number; total_paid: number }[]>`
      SELECT code, total_referrals, total_paid FROM referral_codes WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    if (rows.length === 0) {
      // Generate unique code (max 5 attempts)
      let code = '';
      for (let i = 0; i < 5; i++) {
        const candidate = genCode(7);
        const dup = await this.prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM referral_codes WHERE code = ${candidate}`;
        if (Number(dup[0]?.c ?? 0) === 0) { code = candidate; break; }
      }
      if (!code) throw new BadRequestException('Gagal generate kode unik. Coba lagi.');
      await this.prisma.$executeRaw`
        INSERT INTO referral_codes (user_id, code) VALUES (${user.id}::uuid, ${code})
        ON CONFLICT (user_id) DO NOTHING
      `;
      rows = await this.prisma.$queryRaw<{ code: string; total_referrals: number; total_paid: number }[]>`
        SELECT code, total_referrals, total_paid FROM referral_codes WHERE user_id = ${user.id}::uuid LIMIT 1
      `;
    }

    const r = rows[0]!;
    // Stats: pending vs qualified
    const stats = await this.prisma.$queryRaw<{ pending: number; qualified: number; paid: number }[]>`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::int AS pending,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END)::int AS qualified,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END)::int AS paid
      FROM referrals WHERE referrer_id = ${user.id}::uuid
    `;
    return {
      code: r.code,
      shareUrl: `https://api.jasabersih.com/r/${r.code}`,
      shareText: `Pesan jasa bersih lewat JasaBersih, pake kode ${r.code} biar order kamu enak & aku dapat komisi 5% dari pesananmu. Download di sini:`,
      totalReferrals: Number(r.total_referrals),
      totalPaid: Number(r.total_paid),
      stats: { pending: Number(stats[0]?.pending ?? 0), qualified: Number(stats[0]?.qualified ?? 0), paid: Number(stats[0]?.paid ?? 0) },
    };
  }

  @Get('history')
  async history(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT r.id, r.referred_id AS "referredId",
             u.name AS "referredName", u.phone AS "referredPhone",
             r.status, r.bonus_amount AS "bonusAmount",
             r.qualified_at AS "qualifiedAt", r.paid_at AS "paidAt",
             r.created_at AS "createdAt"
        FROM referrals r
        LEFT JOIN users u ON u.id = r.referred_id
       WHERE r.referrer_id = ${user.id}::uuid
       ORDER BY r.created_at DESC LIMIT 100
    `;
  }

  // POST /v1/referral/apply — saat user baru pakai code (idempotent — sekali per user).
  // Bisa dipanggil dari mobile setelah register, atau saat checkout pertama.
  @Post('apply')
  async apply(@CurrentUser() user: AuthenticatedUser, @Body() body: { code: string }) {
    if (!body?.code) throw new BadRequestException('Code wajib.');
    const code = body.code.trim().toUpperCase();

    // Cek code valid
    const ref = await this.prisma.$queryRaw<{ user_id: string; is_customer: boolean; is_freelancer: boolean }[]>`
      SELECT rc.user_id, u.is_customer, u.is_freelancer
        FROM referral_codes rc
        JOIN users u ON u.id = rc.user_id
       WHERE rc.code = ${code}
       LIMIT 1
    `;
    if (ref.length === 0) throw new BadRequestException('Kode tidak valid.');
    const referrerId = ref[0]!.user_id;
    const referrerRole = ref[0]!.is_freelancer ? 'freelancer' : 'customer';
    if (referrerId === user.id) throw new BadRequestException('Tidak bisa pakai kode sendiri.');

    // Cek user ini sudah pernah pakai code referral
    const existing = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM referrals WHERE referred_id = ${user.id}::uuid LIMIT 1
    `;
    if (existing.length > 0) throw new BadRequestException('Kamu sudah pernah pakai kode referral.');

    // User harus baru (belum punya completed booking)
    const completed = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM bookings WHERE customer_id = ${user.id}::uuid AND status = 'completed'
    `;
    if (Number(completed[0]?.c ?? 0) > 0) throw new BadRequestException('Hanya untuk customer baru (belum ada order selesai).');

    // Insert referral pending
    await this.prisma.$executeRaw`
      INSERT INTO referrals (referrer_id, referred_id, referrer_role, referred_role, status)
      VALUES (${referrerId}::uuid, ${user.id}::uuid, ${referrerRole}, 'customer', 'pending')
    `;

    return {
      ok: true,
      message: 'Kode berlaku! Setiap order kamu, yang ngajak dapat komisi 5%.',
    };
  }
}

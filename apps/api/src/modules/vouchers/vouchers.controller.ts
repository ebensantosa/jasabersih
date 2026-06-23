import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CustomerGuard } from '../auth/role.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const ValidateVoucherSchema = z.object({
  code: z.string().min(1).max(50),
  orderAmount: z.number().int().positive(),
});

@ApiTags('vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CustomerGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly prisma: PrismaService) {}

  // List voucher yg user pernah pakai (history)
  @Get('my-history')
  async myHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT vu.id, vu.discount_amount AS "discountAmount", vu.used_at AS "usedAt",
             v.code, v.type, v.value, v.max_discount AS "maxDiscount",
             vu.booking_id AS "bookingId"
        FROM voucher_usage vu
        INNER JOIN vouchers v ON v.id = vu.voucher_id
       WHERE vu.user_id = ${user.id}::uuid
       ORDER BY vu.used_at DESC LIMIT 50
    `;
  }

  // List voucher aktif yg masih bisa di-claim user (active + not yet used by this user + within window)
  @Get('available')
  async available(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT v.id, v.code, v.type, v.value, v.max_discount AS "maxDiscount",
             v.min_order_amount AS "minOrder", v.valid_until AS "validUntil",
             v.total_quota AS "totalQuota", v.used_count AS "usedCount",
             v.per_user_limit AS "perUserLimit"
        FROM vouchers v
       WHERE v.is_active = TRUE
         AND v.valid_from <= NOW() AND v.valid_until > NOW()
         AND (v.total_quota IS NULL OR v.used_count < v.total_quota)
         AND (
           SELECT COUNT(*) FROM voucher_usage vu
            WHERE vu.voucher_id = v.id AND vu.user_id = ${user.id}::uuid
         ) < v.per_user_limit
       ORDER BY v.valid_until ASC LIMIT 50
    `;
  }

  // Validate code + return discount calculation. Doesn't reserve quota.
  @Post('validate')
  async validate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ValidateVoucherSchema)) body: { code: string; orderAmount: number },
  ) {
    const code = body.code.trim().toUpperCase();
    const rows = await this.prisma.$queryRaw<Record<string, any>[]>`
      SELECT id, code, type, value, max_discount AS "maxDiscount",
             min_order_amount AS "minOrder", total_quota AS "totalQuota",
             used_count AS "usedCount", per_user_limit AS "perUserLimit",
             valid_from AS "validFrom", valid_until AS "validUntil", is_active AS "isActive"
        FROM vouchers WHERE code = ${code} LIMIT 1
    `;
    const v = rows[0];
    if (!v) throw new BadRequestException('Kode voucher tidak ditemukan.');
    if (!v.isActive) throw new BadRequestException('Voucher sudah dinonaktifkan.');

    const now = new Date();
    if (new Date(v.validFrom) > now) throw new BadRequestException('Voucher belum berlaku.');
    if (new Date(v.validUntil) < now) throw new BadRequestException('Voucher sudah expired.');
    if (body.orderAmount < Number(v.minOrder ?? 0)) {
      throw new BadRequestException(`Min order Rp ${Number(v.minOrder).toLocaleString('id-ID')} untuk voucher ini.`);
    }
    if (v.totalQuota != null && Number(v.usedCount) >= Number(v.totalQuota)) {
      throw new BadRequestException('Voucher sudah habis.');
    }

    // Per-user limit check
    const usageRows = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM voucher_usage WHERE voucher_id = ${v.id}::uuid AND user_id = ${user.id}::uuid
    `;
    if (Number(usageRows[0]?.c ?? 0) >= Number(v.perUserLimit ?? 1)) {
      throw new BadRequestException('Kamu sudah pakai voucher ini sebelumnya.');
    }

    // Calculate discount
    let discount: number;
    if (v.type === 'percentage') {
      discount = Math.floor(body.orderAmount * (Number(v.value) / 100));
      if (v.maxDiscount && discount > Number(v.maxDiscount)) discount = Number(v.maxDiscount);
    } else {
      discount = Number(v.value);
    }
    if (discount > body.orderAmount) discount = body.orderAmount;

    return {
      voucherId: v.id,
      code: v.code,
      type: v.type,
      value: Number(v.value),
      discount,
      finalAmount: body.orderAmount - discount,
    };
  }
}

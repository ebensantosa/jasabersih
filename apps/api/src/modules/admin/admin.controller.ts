import { Controller, Get, Param, Patch, Query, UseGuards, Body, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('bookings')
  async listBookings(@Query('status') status?: string) {
    // Pakai raw query karena Booking model belum lengkap di Prisma
    const where = status ? `WHERE b.status = '${status.replace(/'/g, '')}'` : '';
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        b.id,
        b.status,
        b.pricing_mode AS "pricingMode",
        b.total_amount AS total,
        b.scheduled_at AS "scheduledAt",
        b.address_line AS address,
        b.created_at AS "createdAt",
        cu.name AS "customerName",
        cu.phone AS "customerPhone",
        cl.name AS "cleanerName",
        s.name AS service
      FROM bookings b
      LEFT JOIN users cu ON cu.id = b.customer_id
      LEFT JOIN users cl ON cl.id = b.cleaner_id
      LEFT JOIN services s ON s.id = b.service_id
      ${where}
      ORDER BY b.created_at DESC
      LIMIT 100
    `);
    return rows;
  }

  @Get('cleaners')
  async listCleaners(@Query('status') status?: string) {
    const where = status
      ? `WHERE u.is_freelancer = TRUE AND cp.kyc_status = '${status.replace(/'/g, '')}'`
      : `WHERE u.is_freelancer = TRUE`;
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        u.id, u.name, u.phone, u.created_at AS "joinedAt",
        cp.kyc_status AS status,
        cp.tier,
        cp.brings_tools AS "bringsTools",
        cp.rating_avg AS rating,
        cp.total_jobs_done AS "jobsDone",
        cp.service_areas AS "serviceAreas"
      FROM users u
      LEFT JOIN cleaner_profiles cp ON cp.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    return rows;
  }

  @Get('users')
  async listUsers() {
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        u.id, u.name, u.email, u.phone, u.created_at AS "joinedAt",
        u.is_customer AS "isCustomer",
        u.is_freelancer AS "isFreelancer",
        (SELECT COUNT(*) FROM bookings WHERE customer_id = u.id) AS "totalOrders"
      FROM users u
      WHERE u.is_customer = TRUE
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    return rows;
  }

  @Patch('bookings/:id/assign')
  async assignCleaner(
    @Param('id') id: string,
    @Body() body: { cleanerId: string },
  ): Promise<{ ok: true }> {
    if (!body.cleanerId) throw new BadRequestException('cleanerId wajib');
    await this.prisma.$executeRawUnsafe(
      `UPDATE bookings SET cleaner_id = $1::uuid, status = 'matched', matched_at = NOW() WHERE id = $2::uuid`,
      body.cleanerId,
      id,
    );
    return { ok: true };
  }
}

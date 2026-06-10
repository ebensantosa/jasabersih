import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const CATEGORIES = ['akses', 'hewan', 'alergi', 'catatan'] as const;
type Category = typeof CATEGORIES[number];

@ApiTags('customer-notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CustomerNotesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('customer/notes')
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw`
      SELECT id, category, content, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM customer_notes
       WHERE customer_id = ${user.id}::uuid AND source = 'customer'
       ORDER BY category ASC, created_at DESC
    `;
  }

  @Post('customer/notes')
  async createMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { category: Category; content: string },
  ) {
    if (!CATEGORIES.includes(body.category)) throw new BadRequestException('Category tidak valid');
    const content = (body.content ?? '').trim();
    if (content.length < 3 || content.length > 500) throw new BadRequestException('Content 3-500 karakter');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO customer_notes (customer_id, author_id, source, category, content)
      VALUES (${user.id}::uuid, ${user.id}::uuid, 'customer', ${body.category}, ${content})
      RETURNING id
    `;
    return { id: rows[0]!.id };
  }

  @Delete('customer/notes/:id')
  async deleteMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const r = await this.prisma.$executeRaw`
      DELETE FROM customer_notes
       WHERE id = ${id}::uuid AND customer_id = ${user.id}::uuid AND source = 'customer'
    `;
    if (r === 0) throw new NotFoundException('Note tidak ditemukan');
    return { ok: true };
  }

  @Get('cleaner/customer-notes/:customerId')
  async getForCleaner(@CurrentUser() user: AuthenticatedUser, @Param('customerId') customerId: string) {
    const hasRelation = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM bookings
       WHERE cleaner_id = ${user.id}::uuid AND customer_id = ${customerId}::uuid LIMIT 1
    `;
    if (Number(hasRelation[0]?.c ?? 0) === 0) {
      throw new BadRequestException('Kamu belum pernah handle customer ini');
    }
    return this.prisma.$queryRaw`
      SELECT id, source, category, content, author_id AS "authorId",
             created_at AS "createdAt", updated_at AS "updatedAt"
        FROM customer_notes
       WHERE customer_id = ${customerId}::uuid
         AND (source = 'customer' OR (source = 'cleaner' AND author_id = ${user.id}::uuid))
       ORDER BY source DESC, category ASC, created_at DESC
    `;
  }

  @Post('cleaner/customer-notes/:customerId')
  async createCleanerNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
    @Body() body: { category: Category; content: string },
  ) {
    const hasRelation = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM bookings
       WHERE cleaner_id = ${user.id}::uuid AND customer_id = ${customerId}::uuid LIMIT 1
    `;
    if (Number(hasRelation[0]?.c ?? 0) === 0) {
      throw new BadRequestException('Kamu belum pernah handle customer ini');
    }
    if (!CATEGORIES.includes(body.category)) throw new BadRequestException('Category tidak valid');
    const content = (body.content ?? '').trim();
    if (content.length < 3 || content.length > 500) throw new BadRequestException('Content 3-500 karakter');
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO customer_notes (customer_id, author_id, source, category, content)
      VALUES (${customerId}::uuid, ${user.id}::uuid, 'cleaner', ${body.category}, ${content})
      RETURNING id
    `;
    return { id: rows[0]!.id };
  }

  @Delete('cleaner/customer-notes/:id')
  async deleteCleanerNote(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const r = await this.prisma.$executeRaw`
      DELETE FROM customer_notes
       WHERE id = ${id}::uuid AND author_id = ${user.id}::uuid AND source = 'cleaner'
    `;
    if (r === 0) throw new NotFoundException('Note tidak ditemukan');
    return { ok: true };
  }
}

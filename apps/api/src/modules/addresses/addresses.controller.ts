import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

const CreateAddressSchema = z.object({
  label: z.string().min(1).max(50),
  recipientName: z.string().min(1).max(255),
  recipientPhone: z.string().min(8).max(20),
  addressLine: z.string().min(5),
  city: z.string().min(1).max(100).default('Jakarta'),
  postalCode: z.string().max(10).optional(),
  detailNote: z.string().max(500).optional(),
  lat: z.number(),
  lng: z.number(),
  isDefault: z.boolean().optional(),
});
type CreateAddressDto = z.infer<typeof CreateAddressSchema>;

const UpdateAddressSchema = CreateAddressSchema.partial();
type UpdateAddressDto = z.infer<typeof UpdateAddressSchema>;

@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id,
             tag AS label,
             recipient_name AS "recipientName",
             recipient_phone AS "recipientPhone",
             address_line AS "addressLine",
             city, postal_code AS "postalCode",
             notes AS "detailNote",
             ST_Y(location::geometry) AS lat,
             ST_X(location::geometry) AS lng,
             is_default AS "isDefault",
             created_at AS "createdAt"
        FROM addresses
       WHERE user_id = ${user.id}::uuid AND deleted_at IS NULL
       ORDER BY is_default DESC, created_at DESC
    `;
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateAddressSchema)) body: CreateAddressDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Hitung berapa alamat existing — kalau 0, paksa jadi default
      const countRows = await tx.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM addresses WHERE user_id = ${user.id}::uuid AND deleted_at IS NULL`;
      const count = countRows[0]?.c ?? 0;
      // Enforce max alamat (config: feature.max_addresses, default 5)
      const maxRow = await tx.$queryRaw<{ value: any }[]>`SELECT value FROM app_config WHERE key = 'feature.max_addresses' LIMIT 1`;
      const max = Number(typeof maxRow[0]?.value === 'string' ? maxRow[0]!.value.replace(/"/g, '') : maxRow[0]?.value ?? 5) || 5;
      if (count >= max) {
        throw new BadRequestException({
          code: 'MAX_ADDRESSES_REACHED',
          message: `Maksimal ${max} alamat tersimpan. Hapus alamat lama untuk tambah baru.`,
          details: { max, current: count },
        });
      }
      const isDefault = body.isDefault || count === 0;

      // Kalau set default, unset existing
      if (isDefault) {
        await tx.$executeRaw`UPDATE addresses SET is_default = FALSE WHERE user_id = ${user.id}::uuid AND deleted_at IS NULL`;
      }

      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO addresses (user_id, tag, recipient_name, recipient_phone, address_line, city, postal_code, location, notes, is_default)
        VALUES (
          ${user.id}::uuid,
          ${body.label}, ${body.recipientName}, ${body.recipientPhone},
          ${body.addressLine}, ${body.city}, ${body.postalCode ?? null},
          ST_SetSRID(ST_MakePoint(${body.lng}, ${body.lat}), 4326)::geography,
          ${body.detailNote ?? null},
          ${isDefault}
        ) RETURNING id
      `;
      return { id: rows[0]?.id, isDefault };
    });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAddressSchema)) body: UpdateAddressDto,
  ) {
    // Verify ownership
    const owned = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM addresses WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!owned[0]) throw new NotFoundException('Alamat tidak ditemukan.');

    if (body.isDefault === true) {
      await this.prisma.$executeRaw`UPDATE addresses SET is_default = FALSE WHERE user_id = ${user.id}::uuid AND deleted_at IS NULL`;
    }

    if (body.label !== undefined) await this.prisma.$executeRaw`UPDATE addresses SET tag = ${body.label} WHERE id = ${id}::uuid`;
    if (body.recipientName !== undefined) await this.prisma.$executeRaw`UPDATE addresses SET recipient_name = ${body.recipientName} WHERE id = ${id}::uuid`;
    if (body.recipientPhone !== undefined) await this.prisma.$executeRaw`UPDATE addresses SET recipient_phone = ${body.recipientPhone} WHERE id = ${id}::uuid`;
    if (body.addressLine !== undefined) await this.prisma.$executeRaw`UPDATE addresses SET address_line = ${body.addressLine} WHERE id = ${id}::uuid`;
    if (body.city !== undefined) await this.prisma.$executeRaw`UPDATE addresses SET city = ${body.city} WHERE id = ${id}::uuid`;
    if (body.postalCode !== undefined) await this.prisma.$executeRaw`UPDATE addresses SET postal_code = ${body.postalCode} WHERE id = ${id}::uuid`;
    if (body.detailNote !== undefined) await this.prisma.$executeRaw`UPDATE addresses SET notes = ${body.detailNote} WHERE id = ${id}::uuid`;
    if (body.lat !== undefined && body.lng !== undefined) {
      await this.prisma.$executeRaw`UPDATE addresses SET location = ST_SetSRID(ST_MakePoint(${body.lng}, ${body.lat}), 4326)::geography WHERE id = ${id}::uuid`;
    }
    if (body.isDefault !== undefined) await this.prisma.$executeRaw`UPDATE addresses SET is_default = ${body.isDefault} WHERE id = ${id}::uuid`;

    return { ok: true };
  }

  @Post(':id/set-default')
  async setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const owned = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM addresses WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (!owned[0]) throw new NotFoundException('Alamat tidak ditemukan.');
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE addresses SET is_default = FALSE WHERE user_id = ${user.id}::uuid AND deleted_at IS NULL`,
      this.prisma.$executeRaw`UPDATE addresses SET is_default = TRUE WHERE id = ${id}::uuid`,
    ]);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.prisma.$queryRaw<{ is_default: boolean }[]>`
      SELECT is_default FROM addresses WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Alamat tidak ditemukan.');
    await this.prisma.$executeRaw`UPDATE addresses SET deleted_at = NOW() WHERE id = ${id}::uuid`;
    // Kalau yg dihapus adalah default, set yg paling baru jadi default
    if (rows[0].is_default) {
      await this.prisma.$executeRaw`
        UPDATE addresses SET is_default = TRUE
         WHERE id = (SELECT id FROM addresses WHERE user_id = ${user.id}::uuid AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)
      `;
    }
    return { ok: true };
  }
}

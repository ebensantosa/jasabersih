import { BadRequestException, Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { StorageService } from '../storage/storage.service';

const UpdateProfileSchema = z.object({
  bio: z.string().max(1000).optional(),
  serviceAreas: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  isAvailable: z.boolean().optional(),
  photoUrl: z.string().url().optional(),
  domicileCity: z.string().min(2).max(100).optional(),
});
type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

@ApiTags('cleaner-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cleaner/profile')
export class CleanerProfileController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  // Presigned PUT URL untuk upload foto profil ke public bucket.
  @Post('photo-upload-url')
  async photoUploadUrl(@CurrentUser() user: AuthenticatedUser, @Body() body: { contentType: string }) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(body?.contentType)) {
      throw new BadRequestException(`contentType harus salah satu: ${allowed.join(', ')}`);
    }
    const r = await this.storage.createUploadUrl({
      bucket: 'public',
      keyPrefix: `profile-photos/${user.id}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
    return { ...r, publicUrl: this.storage.getPublicUrl(r.key) };
  }

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    // Auto-create profile row kalau belum ada
    await this.prisma.$executeRaw`
      INSERT INTO cleaner_profiles (user_id) VALUES (${user.id}::uuid)
      ON CONFLICT (user_id) DO NOTHING
    `;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT user_id AS "userId", bio, brings_tools AS "bringsTools",
             service_areas AS "serviceAreas", languages, domicile_city AS "domicileCity",
             is_available AS "isAvailable", kyc_status AS "kycStatus", tier,
             rating_avg AS "ratingAvg", rating_count AS "ratingCount",
             acceptance_rate AS "acceptanceRate", completion_rate AS "completionRate",
             total_jobs_done AS "totalJobsDone",
             approved_at AS "approvedAt", suspended_until AS "suspendedUntil"
        FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    return rows[0];
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileDto,
  ) {
    // Pastikan row ada
    await this.prisma.$executeRaw`
      INSERT INTO cleaner_profiles (user_id) VALUES (${user.id}::uuid)
      ON CONFLICT (user_id) DO NOTHING
    `;

    if (body.bio !== undefined) await this.prisma.$executeRaw`UPDATE cleaner_profiles SET bio = ${body.bio}, updated_at = NOW() WHERE user_id = ${user.id}::uuid`;
    // serviceAreas LOCKED untuk cleaner: cuma bisa di-set saat profile masih kosong (initial dari register).
    // Setelah ada minimal 1 area, cleaner gak boleh ubah - admin yang assign via dashboard.
    if (body.serviceAreas !== undefined) {
      const cur = await this.prisma.$queryRaw<{ service_areas: any }[]>`SELECT service_areas FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1`;
      const existing = Array.isArray(cur[0]?.service_areas) ? cur[0]!.service_areas as string[] : [];
      if (existing.length === 0) {
        await this.prisma.$executeRaw`UPDATE cleaner_profiles SET service_areas = ${JSON.stringify(body.serviceAreas)}::jsonb, updated_at = NOW() WHERE user_id = ${user.id}::uuid`;
      } else {
        throw new BadRequestException('Area layanan dikelola admin. Kirim request tambah area lewat halaman Area Layananku.');
      }
    }
    if (body.domicileCity !== undefined) await this.prisma.$executeRaw`UPDATE cleaner_profiles SET domicile_city = ${body.domicileCity.trim()}, updated_at = NOW() WHERE user_id = ${user.id}::uuid`;
    if (body.languages !== undefined) {
      // text[] requires array literal — use raw param
      await this.prisma.$executeRawUnsafe(`UPDATE cleaner_profiles SET languages = $1::text[], updated_at = NOW() WHERE user_id = $2::uuid`, body.languages, user.id);
    }
    if (body.photoUrl !== undefined) {
      await this.prisma.$executeRaw`UPDATE users SET photo_url = ${body.photoUrl} WHERE id = ${user.id}::uuid`;
    }
    if (body.isAvailable !== undefined) {
      // Guard: gak boleh online tanpa foto profil (wajah cleaner wajib utk trust customer)
      if (body.isAvailable === true) {
        const effective = body.photoUrl !== undefined ? body.photoUrl : (await this.prisma.$queryRaw<{ photo_url: string | null }[]>`SELECT photo_url FROM users WHERE id = ${user.id}::uuid LIMIT 1`)[0]?.photo_url;
        if (!effective) {
          throw new BadRequestException({
            code: 'NEED_PROFILE_PHOTO',
            message: 'Upload foto profil dulu sebelum bisa online. Foto wajah membantu customer percaya.',
          });
        }
      }
      await this.prisma.$executeRaw`UPDATE cleaner_profiles SET is_available = ${body.isAvailable}, updated_at = NOW() WHERE user_id = ${user.id}::uuid`;
    }

    return { ok: true };
  }

  // List request area cleaner sendiri (pending - history udah ke-delete)
  @Get('area-requests')
  async listAreaRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw`
      SELECT id, city, notes, action, status, created_at AS "createdAt"
        FROM cleaner_area_requests
       WHERE cleaner_id = ${user.id}::uuid
       ORDER BY created_at DESC LIMIT 50
    `;
  }

  // Cleaner kirim request: action='add' utk tambah area, 'remove' utk hapus.
  @Post('area-requests')
  async createAreaRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { city: string; notes?: string; action?: 'add' | 'remove' },
  ) {
    const city = body?.city?.trim();
    const action = body?.action === 'remove' ? 'remove' : 'add';
    if (!city || city.length < 2) throw new BadRequestException('Nama kota wajib (min 2 karakter).');
    if (city.length > 100) throw new BadRequestException('Nama kota terlalu panjang.');

    const profRows = await this.prisma.$queryRaw<{ service_areas: any }[]>`
      SELECT service_areas FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    const existing = Array.isArray(profRows[0]?.service_areas) ? (profRows[0]!.service_areas as string[]) : [];
    const hasArea = existing.map((s) => s.toLowerCase().trim()).includes(city.toLowerCase());

    if (action === 'add') {
      const areaRows = await this.prisma.$queryRawUnsafe<{ c: number }[]>(
        `SELECT COUNT(*)::int AS c FROM service_areas WHERE is_active = TRUE AND lower(trim(city)) = lower(trim($1))`,
        city,
      );
      if (Number(areaRows[0]?.c ?? 0) === 0) {
        throw new BadRequestException('Kota belum dibuka. Kalau mau usul buka kota, pakai menu "Request Kota Baru".');
      }
      if (hasArea) throw new BadRequestException('Kota ini sudah ada di area kerja kamu.');
    } else {
      // remove: harus area yang udah ada
      if (!hasArea) throw new BadRequestException('Kota ini bukan area kerja kamu.');
    }

    try {
      await this.prisma.$executeRaw`
        INSERT INTO cleaner_area_requests (cleaner_id, city, action, notes)
        VALUES (${user.id}::uuid, ${city}, ${action}, ${body.notes ?? null})
      `;
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new BadRequestException(`Kamu sudah submit request ${action === 'add' ? 'tambah' : 'hapus'} kota ini, masih menunggu review admin.`);
      }
      throw e;
    }
    return { ok: true };
  }
}

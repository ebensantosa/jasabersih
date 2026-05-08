import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { StorageService } from '../storage/storage.service';

const ALLOWED_DOC_TYPES = ['ktp', 'selfie_ktp', 'bank_book'] as const;
type DocType = typeof ALLOWED_DOC_TYPES[number];

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('cleaner-kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cleaner/kyc')
export class CleanerKycController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  // Status per dokumen + overall kyc_status. Auto-create cleaner_profiles row kalau belum ada.
  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    await this.ensureProfile(user.id);
    const profile = await this.prisma.$queryRaw<{ kyc_status: string; rejection_reason: string | null }[]>`
      SELECT kyc_status, rejection_reason FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    const docs = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, doc_type AS "docType", status, uploaded_at AS "uploadedAt",
             verified_at AS "verifiedAt", rejected_reason AS "rejectedReason"
        FROM kyc_documents WHERE user_id = ${user.id}::uuid
        ORDER BY uploaded_at DESC
    `;
    return {
      kycStatus: profile[0]?.kyc_status ?? 'pending',
      rejectionReason: profile[0]?.rejection_reason ?? null,
      documents: docs,
      requiredDocTypes: ALLOWED_DOC_TYPES,
    };
  }

  // Generate signed PUT URL untuk upload langsung ke R2 private bucket.
  @Post('upload-url')
  async uploadUrl(@CurrentUser() user: AuthenticatedUser, @Body() body: { docType: string; contentType: string }) {
    if (!ALLOWED_DOC_TYPES.includes(body?.docType as DocType)) {
      throw new BadRequestException(`docType harus salah satu: ${ALLOWED_DOC_TYPES.join(', ')}`);
    }
    if (!ALLOWED_MIME.includes(body?.contentType)) {
      throw new BadRequestException(`contentType harus salah satu: ${ALLOWED_MIME.join(', ')}`);
    }
    return this.storage.createUploadUrl({
      bucket: 'private',
      keyPrefix: `kyc/${user.id}/${body.docType}`,
      contentType: body.contentType,
      expiresInSec: 300,
    });
  }

  // Register hasil upload — simpan key + set status pending review.
  // Replace existing pending doc dgn type yang sama (cleaner re-upload sebelum review).
  @Post('documents')
  async registerDoc(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { docType: string; storagePath: string },
  ) {
    if (!ALLOWED_DOC_TYPES.includes(body?.docType as DocType)) {
      throw new BadRequestException(`docType invalid.`);
    }
    if (!body?.storagePath) throw new BadRequestException('storagePath wajib (key dari upload-url).');
    await this.ensureProfile(user.id);

    // Upsert: kalau sudah ada doc pending/rejected dengan type sama → replace, kalau approved → reject create.
    const existing = await this.prisma.$queryRaw<{ id: string; status: string | null }[]>`
      SELECT id, status FROM kyc_documents WHERE user_id = ${user.id}::uuid AND doc_type = ${body.docType} ORDER BY uploaded_at DESC LIMIT 1
    `;
    if (existing[0]?.status === 'approved') {
      throw new BadRequestException('Dokumen sudah approved — tidak bisa di-replace.');
    }
    if (existing[0]) {
      await this.prisma.$executeRaw`
        UPDATE kyc_documents
           SET storage_path = ${body.storagePath},
               status = 'pending',
               uploaded_at = NOW(),
               rejected_reason = NULL
         WHERE id = ${existing[0].id}::uuid
      `;
    } else {
      await this.prisma.$executeRaw`
        INSERT INTO kyc_documents (user_id, doc_type, storage_path, status)
        VALUES (${user.id}::uuid, ${body.docType}, ${body.storagePath}, 'pending')
      `;
    }

    // Kalau semua 3 doc sudah uploaded → set profile under_review
    const counts = await this.prisma.$queryRaw<{ uploaded: number }[]>`
      SELECT COUNT(DISTINCT doc_type)::int AS uploaded
        FROM kyc_documents
       WHERE user_id = ${user.id}::uuid AND doc_type IN ('ktp', 'selfie_ktp', 'bank_book')
    `;
    if ((counts[0]?.uploaded ?? 0) >= 3) {
      await this.prisma.$executeRaw`
        UPDATE cleaner_profiles SET kyc_status = 'under_review' WHERE user_id = ${user.id}::uuid AND kyc_status NOT IN ('approved')
      `;
    }
    return { ok: true };
  }

  private async ensureProfile(userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO cleaner_profiles (user_id, kyc_status)
      VALUES (${userId}::uuid, 'pending')
      ON CONFLICT (user_id) DO NOTHING
    `;
    // Mark user as freelancer too (idempotent)
    await this.prisma.$executeRaw`UPDATE users SET is_freelancer = TRUE WHERE id = ${userId}::uuid AND is_freelancer = FALSE`;
  }
}

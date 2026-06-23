import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CleanerGuard } from '../auth/role.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { StorageService } from '../storage/storage.service';

// Selfie+KTP dihapus dari requirement - sekarang cukup KTP + buku tabungan.
// `selfie_ktp` masih diterima sebagai value valid biar dokumen historis lama gak bermasalah,
// tapi bukan bagian dari requirement aktif cleaner.
const ALLOWED_DOC_TYPES = ['ktp', 'selfie_ktp', 'bank_book'] as const;
type DocType = typeof ALLOWED_DOC_TYPES[number];
const REQUIRED_DOC_TYPES = ['ktp', 'bank_book'] as const;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('cleaner-kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CleanerGuard)
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
    const docs = await this.prisma.$queryRaw<Array<{
      id: string; docType: string; status: string | null; uploadedAt: Date;
      verifiedAt: Date | null; rejectedReason: string | null; storage_path: string;
    }>>`
      SELECT id, doc_type AS "docType", status, uploaded_at AS "uploadedAt",
             verified_at AS "verifiedAt", rejected_reason AS "rejectedReason",
             storage_path
        FROM kyc_documents WHERE user_id = ${user.id}::uuid
        ORDER BY uploaded_at DESC
    `;
    // Generate signed preview URL per doc (private bucket, expires 5min)
    const docsWithPreview = await Promise.all(docs.map(async (d) => ({
      id: d.id,
      docType: d.docType,
      status: d.status,
      uploadedAt: d.uploadedAt,
      verifiedAt: d.verifiedAt,
      rejectedReason: d.rejectedReason,
      previewUrl: d.storage_path ? await this.storage.getSignedReadUrl('private', d.storage_path, 300).catch(() => null) : null,
    })));
    return {
      kycStatus: profile[0]?.kyc_status ?? 'pending',
      rejectionReason: profile[0]?.rejection_reason ?? null,
      documents: docsWithPreview,
      requiredDocTypes: REQUIRED_DOC_TYPES,
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
    // Block upload kalau status under_review atau approved (cegah race condition)
    const profile = await this.prisma.$queryRaw<{ kyc_status: string }[]>`
      SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    const status = profile[0]?.kyc_status;
    if (status === 'under_review') {
      throw new BadRequestException({ code: 'KYC_UNDER_REVIEW', message: 'KYC kamu sedang direview admin. Tunggu hasil review sebelum upload ulang.' });
    }
    if (status === 'approved') {
      throw new BadRequestException({ code: 'KYC_APPROVED', message: 'KYC kamu sudah disetujui. Hubungi CS jika perlu update dokumen.' });
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

    // Auto-set under_review DIHAPUS — sekarang harus explicit POST /submit dari user
    return { ok: true };
  }

  // Cleaner explicit submit: cek semua dokumen wajib ada sebelum masuk review
  @Post('submit')
  async submit(@CurrentUser() user: AuthenticatedUser) {
    const counts = await this.prisma.$queryRaw<{ uploaded: number }[]>`
      SELECT COUNT(DISTINCT doc_type)::int AS uploaded
        FROM kyc_documents
       WHERE user_id = ${user.id}::uuid AND doc_type IN ('ktp', 'bank_book')
    `;
    if ((counts[0]?.uploaded ?? 0) < 2) {
      throw new BadRequestException({ code: 'KYC_INCOMPLETE', message: 'Lengkapi KTP & Buku Tabungan sebelum submit.' });
    }
    const profile = await this.prisma.$queryRaw<{ kyc_status: string }[]>`
      SELECT kyc_status FROM cleaner_profiles WHERE user_id = ${user.id}::uuid LIMIT 1
    `;
    const status = profile[0]?.kyc_status;
    if (status === 'approved') {
      throw new BadRequestException({ code: 'KYC_APPROVED', message: 'KYC sudah disetujui.' });
    }
    if (status === 'under_review') {
      throw new BadRequestException({ code: 'KYC_UNDER_REVIEW', message: 'KYC sudah disubmit. Tunggu hasil review.' });
    }
    await this.prisma.$executeRaw`
      UPDATE cleaner_profiles SET kyc_status = 'under_review', rejection_reason = NULL
       WHERE user_id = ${user.id}::uuid
    `;
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

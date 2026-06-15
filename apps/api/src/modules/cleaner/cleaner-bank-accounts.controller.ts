import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { FlipService } from '../payments/flip.service';

// Codes diterima Flip disbursement: bank besar + e-wallet utama.
// Bank: lowercase ISO-ish. E-wallet: nama wallet (gopay, ovo, dana, dst).
const ALLOWED_BANK_CODES = [
  // Bank besar
  'bca', 'mandiri', 'bri', 'bni', 'cimb', 'permata', 'bsi', 'danamon', 'btn', 'mega',
  // Digital bank
  'jago', 'jenius', 'seabank', 'neo', 'allo', 'blu',
  // E-wallet (Flip support disbursement ke wallet)
  'gopay', 'ovo', 'dana', 'shopeepay', 'linkaja',
];

const EWALLET_CODES = new Set(['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja']);

const AddBankSchema = z.object({
  bankCode: z.string().toLowerCase().refine((v) => ALLOWED_BANK_CODES.includes(v), 'Kode bank/e-wallet tidak didukung.'),
  // E-wallet pakai nomor HP (10-13 digit, prefix 08/62/+62). Bank pakai nomor
  // rekening (6-20 digit). Validasi spesifik di superRefine biar pesan jelas.
  accountNumber: z.string().min(6).max(20).regex(/^[\d+]+$/, 'Nomor rekening / HP harus angka.'),
}).superRefine((data, ctx) => {
  if (EWALLET_CODES.has(data.bankCode)) {
    // E-wallet: harus format nomor HP Indonesia
    const phone = data.accountNumber.replace(/^\+?62/, '0');
    if (!/^08[1-9]\d{7,11}$/.test(phone)) {
      ctx.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Untuk e-wallet, masukkan nomor HP terdaftar (08...).' });
    }
  } else {
    // Bank: digit only
    if (!/^\d+$/.test(data.accountNumber)) {
      ctx.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Nomor rekening harus angka.' });
    }
  }
});
type AddBankDto = z.infer<typeof AddBankSchema>;

@ApiTags('cleaner-bank-accounts')
@Controller('cleaner/bank-accounts')
export class CleanerBankAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flip: FlipService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<any[]>`
      SELECT id, bank_code AS "bankCode", account_number AS "accountNumber",
             account_holder_name AS "accountHolderName", is_verified AS "isVerified",
             is_default AS "isDefault", verified_at AS "verifiedAt"
        FROM cleaner_bank_accounts
       WHERE user_id = ${user.id}::uuid
       ORDER BY is_default DESC, created_at DESC
    `;
  }

  // POST — tambah rekening + langsung verify via Flip Inquiry (sync, return result)
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(AddBankSchema)) body: AddBankDto,
  ) {
    // Cek duplicate
    const existing = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM cleaner_bank_accounts
       WHERE user_id = ${user.id}::uuid
         AND bank_code = ${body.bankCode}
         AND account_number = ${body.accountNumber}
       LIMIT 1
    `;
    if (existing[0]) throw new BadRequestException('Rekening ini sudah terdaftar.');

    const isEwallet = EWALLET_CODES.has(body.bankCode);

    // Inquiry Flip - verify nama pemilik & rekening valid.
    // E-wallet: Flip sometimes return empty account_holder (OVO privacy), tetep
    // accept asal status=SUCCESS. Nama yg disimpen = nama user di profile.
    let inquiry: any;
    try {
      inquiry = await this.flip.inquiryBankAccount({
        bankCode: body.bankCode,
        accountNumber: body.accountNumber,
      });
    } catch (e: any) {
      throw new BadRequestException(`Verifikasi ${isEwallet ? 'e-wallet' : 'rekening'} gagal: ${e?.message ?? 'Coba lagi'}`);
    }

    if (inquiry?.status !== 'SUCCESS' && !inquiry?.account_holder) {
      throw new BadRequestException(
        isEwallet
          ? 'E-wallet tidak ditemukan / belum terdaftar. Cek nomor HP & pastikan wallet aktif.'
          : 'Rekening tidak ditemukan atau tidak aktif. Cek nomor & bank.',
      );
    }

    // Verify nama pemilik match nama user (case-insensitive substring).
    // Skip kalau e-wallet & Flip gak return holder name (privacy).
    const u = await this.prisma.$queryRaw<{ name: string | null }[]>`SELECT name FROM users WHERE id = ${user.id}::uuid`;
    const userName = (u[0]?.name ?? '').toLowerCase().replace(/\s+/g, '');
    const holderName = (inquiry.account_holder ?? '').toLowerCase().replace(/\s+/g, '');
    if (userName && holderName && !holderName.includes(userName) && !userName.includes(holderName)) {
      throw new BadRequestException(`Nama pemilik ${isEwallet ? 'e-wallet' : 'rekening'} (${inquiry.account_holder}) tidak sesuai akun. Gunakan ${isEwallet ? 'e-wallet' : 'rekening'} atas nama sendiri.`);
    }
    // Kalau e-wallet & holder name kosong (OVO privacy), pakai nama user.
    if (isEwallet && !inquiry.account_holder) {
      inquiry.account_holder = u[0]?.name ?? 'Cleaner';
    }

    // Save
    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO cleaner_bank_accounts (
        user_id, bank_code, account_number, account_holder_name,
        is_verified, flip_inquiry_id, inquiry_result, verified_at
      ) VALUES (
        ${user.id}::uuid, ${body.bankCode}, ${body.accountNumber}, ${inquiry.account_holder},
        TRUE, ${inquiry.inquiry_key ?? null}, ${JSON.stringify(inquiry)}::jsonb, NOW()
      )
      RETURNING id
    `;
    const id = inserted[0]!.id;

    // Kalau ini rekening pertama, set as default
    await this.prisma.$executeRaw`
      UPDATE cleaner_bank_accounts SET is_default = TRUE
       WHERE id = ${id}::uuid
         AND NOT EXISTS (SELECT 1 FROM cleaner_bank_accounts WHERE user_id = ${user.id}::uuid AND is_default = TRUE AND id <> ${id}::uuid)
    `;

    return { id, isVerified: true, accountHolderName: inquiry.account_holder };
  }

  @Patch(':id/set-default')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const ok = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM cleaner_bank_accounts WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid LIMIT 1
    `;
    if (!ok[0]) throw new NotFoundException('Rekening tidak ditemukan.');
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE cleaner_bank_accounts SET is_default = FALSE WHERE user_id = ${user.id}::uuid`,
      this.prisma.$executeRaw`UPDATE cleaner_bank_accounts SET is_default = TRUE WHERE id = ${id}::uuid`,
    ]);
    return { id, isDefault: true };
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // Cek gak ada withdrawal in-flight pakai rekening ini
    const inFlight = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE bank_account_id = ${id}::uuid AND status IN ('pending', 'processing')
    `;
    if (Number(inFlight[0]?.c ?? 0) > 0) {
      throw new ForbiddenException('Masih ada penarikan diproses dengan rekening ini.');
    }
    const del = await this.prisma.$executeRaw`
      DELETE FROM cleaner_bank_accounts WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
    `;
    if (!del) throw new NotFoundException('Rekening tidak ditemukan.');
    return { ok: true };
  }
}

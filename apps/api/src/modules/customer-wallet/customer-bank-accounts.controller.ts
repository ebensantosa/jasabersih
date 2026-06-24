import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma.service';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { FlipService } from '../payments/flip.service';

const ALLOWED_BANK_CODES = [
  'bca', 'mandiri', 'bri', 'bni', 'cimb', 'permata', 'bsi', 'danamon', 'btn', 'mega',
  'panin', 'ocbc', 'uob', 'maybank', 'btpn', 'sinarmas', 'bukopin',
  'bca_syr', 'muamalat', 'btn_syr', 'mega_syr',
  'dki', 'jatim', 'jateng', 'jabar', 'jambi', 'jogja', 'bali', 'aceh',
  'sumut', 'sumsel', 'sumbar', 'riau', 'kalbar', 'kalsel', 'kaltim',
  'sulselbar', 'sulteng', 'sulut', 'maluku', 'nusa_tenggara_barat',
  'nusa_tenggara_timur', 'papua',
  'jago', 'jenius', 'seabank', 'neo', 'allo', 'blu', 'mestika', 'mestika_dharma',
  'commonwealth', 'bumiarta', 'multiarta', 'amar',
  'gopay', 'ovo', 'dana', 'shopeepay', 'linkaja',
];

const EWALLET_CODES = new Set(['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja']);

const HOLDER_NAME_NOISE = new Set([
  'dana',
  'gopay',
  'gopaylater',
  'ovo',
  'ovopremier',
  'shopeepay',
  'shopee',
  'linkaja',
  'ewallet',
  'wallet',
  'topup',
  'top',
  'up',
  'transfer',
  'disbursement',
]);

function isMaskedToken(token: string): boolean {
  return token.length >= 4 && /x{2,}/i.test(token);
}

function normalizeName(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !HOLDER_NAME_NOISE.has(part))
    .filter((part) => !isMaskedToken(part));
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return false;
}

function namesLikelyMatch(userName: string | null | undefined, holderName: string | null | undefined): boolean {
  const userTokens = normalizeName(userName);
  const holderTokens = normalizeName(holderName);
  if (userTokens.length === 0 || holderTokens.length === 0) return true;

  const matched = userTokens.filter((userToken) => holderTokens.some((holderToken) => tokenMatches(userToken, holderToken)));
  if (matched.length === userTokens.length) return true;

  const firstToken = userTokens[0];
  const secondToken = userTokens[1];
  const firstMatched = firstToken ? holderTokens.some((holderToken) => tokenMatches(firstToken, holderToken)) : false;
  const secondMatched = secondToken ? holderTokens.some((holderToken) => tokenMatches(secondToken, holderToken)) : false;

  if (firstMatched && (secondMatched || userTokens.length === 1)) return true;
  if (matched.length >= 1 && holderTokens.length === 1) return true;
  return matched.length / userTokens.length >= 0.6;
}

const AddBankSchema = z.object({
  bankCode: z.string().toLowerCase().refine((v) => ALLOWED_BANK_CODES.includes(v), 'Kode bank/e-wallet tidak didukung.'),
  accountNumber: z.string().min(6).max(20).regex(/^[\d+]+$/, 'Nomor rekening / HP harus angka.'),
}).superRefine((data, ctx) => {
  if (EWALLET_CODES.has(data.bankCode)) {
    const phone = data.accountNumber.replace(/^\+?62/, '0');
    if (!/^08[1-9]\d{7,11}$/.test(phone)) {
      ctx.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Untuk e-wallet, masukkan nomor HP terdaftar (08...).' });
    }
  } else if (!/^\d+$/.test(data.accountNumber)) {
    ctx.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Nomor rekening harus angka.' });
  }
});
type AddBankDto = z.infer<typeof AddBankSchema>;

@ApiTags('customer-bank-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customer/bank-accounts')
export class CustomerBankAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flip: FlipService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.$queryRaw<any[]>`
      SELECT id, bank_code AS "bankCode", account_number AS "accountNumber",
             account_holder_name AS "accountHolderName", is_verified AS "isVerified",
             is_default AS "isDefault", verified_at AS "verifiedAt"
        FROM customer_bank_accounts
       WHERE user_id = ${user.id}::uuid
       ORDER BY is_default DESC, created_at DESC
    `;
  }

  @Post()
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(AddBankSchema)) body: AddBankDto,
  ) {
    const countRows = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM customer_bank_accounts WHERE user_id = ${user.id}::uuid
    `;
    if (Number(countRows[0]?.c ?? 0) >= 5) throw new BadRequestException('Maksimal 5 rekening/e-wallet.');

    const existing = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer_bank_accounts
       WHERE user_id = ${user.id}::uuid
         AND bank_code = ${body.bankCode}
         AND account_number = ${body.accountNumber}
       LIMIT 1
    `;
    if (existing[0]) throw new BadRequestException('Rekening ini sudah terdaftar.');

    const isEwallet = EWALLET_CODES.has(body.bankCode);

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

    const u = await this.prisma.$queryRaw<{ name: string | null }[]>`SELECT name FROM users WHERE id = ${user.id}::uuid`;
    const userName = u[0]?.name ?? '';
    const holderName = inquiry.account_holder ?? '';
    if (userName && holderName && !namesLikelyMatch(userName, holderName)) {
      throw new BadRequestException(`Nama pemilik ${isEwallet ? 'e-wallet' : 'rekening'} (${inquiry.account_holder}) tidak sesuai akun. Gunakan ${isEwallet ? 'e-wallet' : 'rekening'} atas nama sendiri.`);
    }
    if (isEwallet && !inquiry.account_holder) {
      inquiry.account_holder = u[0]?.name ?? 'Customer';
    }

    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO customer_bank_accounts (
        user_id, bank_code, account_number, account_holder_name,
        is_verified, flip_inquiry_id, inquiry_result, verified_at
      ) VALUES (
        ${user.id}::uuid, ${body.bankCode}, ${body.accountNumber}, ${inquiry.account_holder},
        TRUE, ${inquiry.inquiry_key ?? null}, ${JSON.stringify(inquiry)}::jsonb, NOW()
      )
      RETURNING id
    `;
    const id = inserted[0]!.id;

    await this.prisma.$executeRaw`
      UPDATE customer_bank_accounts SET is_default = TRUE
       WHERE id = ${id}::uuid
         AND NOT EXISTS (SELECT 1 FROM customer_bank_accounts WHERE user_id = ${user.id}::uuid AND is_default = TRUE AND id <> ${id}::uuid)
    `;

    return { id, isVerified: true, accountHolderName: inquiry.account_holder };
  }

  @Patch(':id/set-default')
  async setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const ok = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer_bank_accounts WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid LIMIT 1
    `;
    if (!ok[0]) throw new NotFoundException('Rekening tidak ditemukan.');
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE customer_bank_accounts SET is_default = FALSE WHERE user_id = ${user.id}::uuid`,
      this.prisma.$executeRaw`UPDATE customer_bank_accounts SET is_default = TRUE WHERE id = ${id}::uuid`,
    ]);
    return { id, isDefault: true };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const inFlight = await this.prisma.$queryRaw<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM withdrawals
       WHERE customer_bank_account_id = ${id}::uuid AND status IN ('pending', 'processing')
    `;
    if (Number(inFlight[0]?.c ?? 0) > 0) {
      throw new ForbiddenException('Masih ada penarikan diproses dengan rekening ini.');
    }
    const own = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer_bank_accounts WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid LIMIT 1
    `;
    if (!own[0]) throw new NotFoundException('Rekening tidak ditemukan.');
    await this.prisma.$executeRaw`
      UPDATE withdrawals SET customer_bank_account_id = NULL WHERE customer_bank_account_id = ${id}::uuid
    `;
    await this.prisma.$executeRaw`
      DELETE FROM customer_bank_accounts WHERE id = ${id}::uuid
    `;
    return { ok: true };
  }
}

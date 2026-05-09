import { Controller, Get, Header, Param, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { PrismaService } from '../../common/prisma.service';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.jasabersih.app';
const APP_STORE_URL = 'https://apps.apple.com/id/app/jasabersih/id000000000';
const APP_DEEP_LINK_SCHEME = 'jasabersih://referral';

/**
 * Public smart-redirect untuk link referral (https://api.jasabersih.com/r/:code).
 * Mobile (Android/iOS): coba buka app via deep link, fallback ke store kalau app belum install.
 * Desktop / lainnya: tampilin landing page dengan QR + tombol download.
 */
@ApiTags('referral-redirect')
@Controller('r')
export class ReferralRedirectController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':code')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async redirect(
    @Param('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('utm') _utm?: string,
  ) {
    const safeCode = String(code || '').replace(/[^A-Z0-9]/gi, '').slice(0, 20);

    // Validate code exists (gak fatal — link masih di-render walau invalid biar user gak bingung 404)
    let isValid = false;
    if (safeCode) {
      const rows = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM referral_codes WHERE code = ${safeCode}
      `;
      isValid = Number(rows[0]?.c ?? 0) > 0;
    }

    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const isAndroid = /android/.test(ua);
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const storeUrl = isIOS ? APP_STORE_URL : PLAY_STORE_URL;

    const html = renderLandingHtml({ code: safeCode, isValid, isAndroid, isIOS, storeUrl });
    res.send(html);
  }
}

function renderLandingHtml(opts: { code: string; isValid: boolean; isAndroid: boolean; isIOS: boolean; storeUrl: string }): string {
  const { code, isValid, isAndroid, isIOS, storeUrl } = opts;
  const deepLink = `${APP_DEEP_LINK_SCHEME}/${code}`;
  const isMobile = isAndroid || isIOS;

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${isValid ? `Pakai kode ${code} - Diskon Rp 25.000` : 'JasaBersih - Cleaning Service Profesional'}</title>
<meta property="og:title" content="${isValid ? `Pakai kode ${code} di JasaBersih` : 'JasaBersih'}" />
<meta property="og:description" content="${isValid ? `Diskon Rp 25.000 buat order pertama kamu di JasaBersih.` : 'Cleaning Service Profesional & Terpercaya'}" />
<meta property="og:type" content="website" />
<style>
  *,*::before,*::after { box-sizing: border-box }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(160deg, #0B2A6F 0%, #1D4ED8 100%); color: #0F172A; min-height: 100vh; }
  .wrap { max-width: 460px; margin: 0 auto; padding: 32px 20px; min-height: 100vh; display: flex; flex-direction: column; }
  .brand { color: white; font-weight: 800; font-size: 24px; text-align: center; margin-bottom: 4px; }
  .tagline { color: rgba(255,255,255,0.85); text-align: center; font-size: 13px; margin-bottom: 24px; }
  .card { background: white; border-radius: 24px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); }
  .badge { display: inline-block; background: #F59E0B; color: white; font-weight: 700; font-size: 11px; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; }
  .code { font-family: 'SF Mono', Menlo, monospace; font-weight: 800; font-size: 32px; letter-spacing: 4px; color: #1D4ED8; background: #EFF6FF; padding: 16px; border-radius: 12px; text-align: center; margin: 16px 0; border: 2px dashed #1D4ED8; }
  h1 { font-size: 22px; margin: 8px 0; }
  p { color: #475569; line-height: 1.5; font-size: 14px; }
  .cta { display: block; background: #1D4ED8; color: white; text-align: center; padding: 16px; border-radius: 14px; text-decoration: none; font-weight: 700; margin-top: 16px; box-shadow: 0 4px 12px rgba(29,78,216,0.3); }
  .cta-secondary { display: block; background: white; color: #1D4ED8; text-align: center; padding: 14px; border-radius: 14px; text-decoration: none; font-weight: 700; margin-top: 8px; border: 2px solid #1D4ED8; }
  .stores { display: flex; gap: 12px; margin-top: 16px; }
  .stores a { flex: 1; text-align: center; }
  .stores img { height: 48px; }
  ul { padding-left: 20px; color: #475569; font-size: 13px; line-height: 1.6; }
  li { margin: 4px 0 }
  .footer { color: rgba(255,255,255,0.7); text-align: center; font-size: 11px; margin-top: 24px; padding-bottom: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">🧹 JasaBersih</div>
  <div class="tagline">Cleaning Service Profesional &amp; Terpercaya</div>
  <div class="card">
    ${isValid ? `
      <span class="badge">⚡ Bonus Referral</span>
      <h1>Diskon Rp 25.000 buat kamu!</h1>
      <p>Pakai kode di bawah saat order pertama di aplikasi JasaBersih.</p>
      <div class="code">${code}</div>
      <p style="font-size:12px;color:#94A3B8">Kode auto-apply kalau kamu install &amp; daftar lewat link ini.</p>
    ` : `
      <h1>Pesan Cleaner Profesional</h1>
      <p>Booking layanan kebersihan dengan harga jelas, cleaner tervalidasi, &amp; bayar lewat e-wallet/VA.</p>
    `}
    ${isMobile ? `
      <a href="${deepLink}" class="cta">Buka di Aplikasi</a>
      <a href="${storeUrl}" class="cta-secondary">Belum punya app? Download</a>
      <script>
        // Coba buka app via deep link; setelah 1.5 detik kalau masih di halaman ini, redirect ke store
        setTimeout(function() {
          if (!document.hidden) window.location.href = '${storeUrl}';
        }, 1500);
        window.location.href = '${deepLink}';
      </script>
    ` : `
      <ul>
        <li>📱 Tersedia di Android &amp; iOS</li>
        <li>🏠 Layanan: kamar, dapur, pasca renovasi, full house</li>
        <li>💰 Bayar via QRIS, Gopay, OVO, VA &amp; e-wallet</li>
        <li>⭐ Cleaner tervalidasi via KYC</li>
      </ul>
      <div class="stores">
        <a href="${PLAY_STORE_URL}"><strong style="color:#1D4ED8">▶ Google Play</strong></a>
        <a href="${APP_STORE_URL}"><strong style="color:#1D4ED8">🍎 App Store</strong></a>
      </div>
      <p style="font-size:12px;color:#94A3B8;margin-top:12px;text-align:center">Buka link ini di HP kamu untuk download otomatis.</p>
    `}
  </div>
  <div class="footer">© JasaBersih.com · Yogyakarta &amp; sekitarnya</div>
</div>
</body>
</html>`;
}

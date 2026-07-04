import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

@Injectable()
export class TelegramService {
  private readonly log = new Logger(TelegramService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(text: string): Promise<void> {
    if (!BOT_TOKEN || !CHAT_ID) return;
    try {
      const rows = await this.prisma.$queryRaw<{ value: unknown }[]>`
        SELECT value FROM app_config WHERE key = 'feature.telegram_notif' LIMIT 1
      `;
      const enabled = rows.length === 0 || rows[0]?.value !== false;
      if (!enabled) return;
    } catch { /* kalau DB error, tetap kirim */ }
    try {
      await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
      });
    } catch (e) {
      this.log.warn(`Telegram send failed: ${e}`);
    }
  }
}

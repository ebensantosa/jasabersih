import { Injectable, Logger } from '@nestjs/common';

const TELEGRAM_API = 'https://api.telegram.org';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

@Injectable()
export class TelegramService {
  private readonly log = new Logger(TelegramService.name);

  async send(text: string): Promise<void> {
    if (!BOT_TOKEN || !CHAT_ID) return;
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

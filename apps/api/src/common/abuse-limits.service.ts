import { Injectable } from '@nestjs/common';

import { PrismaService } from './prisma.service';

type Limits = {
  chatMsgPerMin: number;
  maxActiveBookings: number;
  maxOpenDisputesSameCleaner: number;
  ratingEditWindowHours: number;
  voucherMaxUsesPerPhone: number;
  rescheduleMaxPerBooking: number;
};

const DEFAULTS: Limits = {
  chatMsgPerMin: 15,
  maxActiveBookings: 0, // 0 = no limit; admin bisa override via app_config
  maxOpenDisputesSameCleaner: 1,
  ratingEditWindowHours: 24,
  voucherMaxUsesPerPhone: 1,
  rescheduleMaxPerBooking: 1,
};

const CACHE_TTL_MS = 30_000;

@Injectable()
export class AbuseLimitsService {
  private cache: { at: number; data: Limits } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<Limits> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.data;
    const rows = await this.prisma.$queryRaw<{ key: string; value: unknown }[]>`
      SELECT key, value FROM app_config WHERE category = 'abuse'
    `;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (k: string, d: number) => {
      const v = map.get(k);
      if (v == null) return d;
      const n = Number(typeof v === 'string' ? v.replace(/"/g, '') : v);
      return Number.isFinite(n) && n >= 0 ? n : d;
    };
    const data: Limits = {
      chatMsgPerMin: num('abuse.chat_msg_per_min', DEFAULTS.chatMsgPerMin),
      maxActiveBookings: num('abuse.max_active_bookings', DEFAULTS.maxActiveBookings),
      maxOpenDisputesSameCleaner: num('abuse.max_open_disputes_same_cleaner', DEFAULTS.maxOpenDisputesSameCleaner),
      ratingEditWindowHours: num('abuse.rating_edit_window_hours', DEFAULTS.ratingEditWindowHours),
      voucherMaxUsesPerPhone: num('abuse.voucher_max_uses_per_phone', DEFAULTS.voucherMaxUsesPerPhone),
      rescheduleMaxPerBooking: num('abuse.reschedule_max_per_booking', DEFAULTS.rescheduleMaxPerBooking),
    };
    this.cache = { at: Date.now(), data };
    return data;
  }

  invalidate(): void {
    this.cache = null;
  }
}

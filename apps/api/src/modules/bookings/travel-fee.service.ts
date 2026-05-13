import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';

export type TravelQuote = {
  enabled: boolean;
  distanceKm: number;
  travelFee: number;
  freeKm: number;
  perKmIdr: number;
  maxKm: number;
  nearestAreaId: string | null;
  nearestAreaName: string | null;
};

@Injectable()
export class TravelFeeService {
  constructor(private readonly prisma: PrismaService) {}

  private async readConfig(): Promise<{ enabled: boolean; perKm: number; freeKm: number; maxKm: number }> {
    const rows = await this.prisma.$queryRaw<{ key: string; value: any }[]>`
      SELECT key, value FROM app_config
       WHERE key IN ('travel.enabled', 'travel.per_km_idr', 'travel.free_km', 'travel.max_km')
    `;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const parseN = (v: any, d: number) => {
      if (v == null) return d;
      const n = Number(typeof v === 'string' ? v.replace(/"/g, '') : v);
      return Number.isFinite(n) ? n : d;
    };
    const parseB = (v: any, d: boolean) => {
      if (v == null) return d;
      const s = typeof v === 'string' ? v.replace(/"/g, '').toLowerCase() : String(v).toLowerCase();
      return s === 'true' || s === '1';
    };
    return {
      enabled: parseB(map.get('travel.enabled'), true),
      perKm: parseN(map.get('travel.per_km_idr'), 1000),
      freeKm: parseN(map.get('travel.free_km'), 5),
      maxKm: parseN(map.get('travel.max_km'), 15),
    };
  }

  /**
   * Hitung travel fee untuk lokasi booking.
   * - Cari service_area aktif terdekat (by ST_Distance ke centroid)
   * - Distance dalam km, dibulatkan ke atas
   * - fee = max(0, ceil(distance) - free_km) × per_km
   * - Throw BadRequest kalau distance > max_km
   */
  async quote(lat: number, lng: number): Promise<TravelQuote> {
    const cfg = await this.readConfig();
    if (!cfg.enabled) {
      return { enabled: false, distanceKm: 0, travelFee: 0, freeKm: cfg.freeKm, perKmIdr: cfg.perKm, maxKm: cfg.maxKm, nearestAreaId: null, nearestAreaName: null };
    }

    const rows = await this.prisma.$queryRawUnsafe<{ id: string; name: string; distance_m: number }[]>(
      `SELECT id, name,
              ST_Distance(centroid, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
         FROM service_areas
        WHERE is_active = TRUE
        ORDER BY centroid <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        LIMIT 1`,
      lng, lat,
    );
    if (rows.length === 0) {
      throw new BadRequestException({
        code: 'NO_SERVICE_AREA',
        message: 'Lokasi kamu belum dilayani. Mau kerja sama? Hubungi admin.',
      });
    }
    const distanceKm = Math.ceil(Number(rows[0]!.distance_m) / 1000 * 100) / 100; // 2 decimal
    if (distanceKm > cfg.maxKm) {
      throw new BadRequestException({
        code: 'OUT_OF_RANGE',
        message: `Jarak lokasi ${distanceKm.toFixed(1)} km lebih dari batas ${cfg.maxKm} km. Gunakan konsultasi WA untuk quote khusus.`,
        details: { distanceKm, maxKm: cfg.maxKm },
      });
    }
    const billableKm = Math.max(0, Math.ceil(distanceKm) - cfg.freeKm);
    const travelFee = billableKm * cfg.perKm;
    return {
      enabled: true,
      distanceKm,
      travelFee,
      freeKm: cfg.freeKm,
      perKmIdr: cfg.perKm,
      maxKm: cfg.maxKm,
      nearestAreaId: rows[0]!.id,
      nearestAreaName: rows[0]!.name,
    };
  }
}

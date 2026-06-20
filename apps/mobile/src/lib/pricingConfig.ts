// Helper untuk baca pricing configs dari API (admin-controlled) dengan
// fallback ke hardcoded catalog.ts. Admin edit di /admin/app-settings,
// mobile auto-pull saat fetchAppContent.
import { useConfig } from '../stores/appContent';
import {
  DIRT_LEVELS,
  LARGE_SCALE_BATHROOM_RATE,
  LARGE_SCALE_MAX_M2,
  LARGE_SCALE_TARGETS,
  POST_RENO_BATHROOM_RATE,
  POST_RENO_KITCHEN_FLAT,
  POST_RENO_LEVELS,
  POST_RENO_MAX_M2,
  POST_RENO_TARGETS,
} from '../data/catalog';

type PostRenoLevel = { code: string; label: string; desc: string; multiplier: number };
type RateTarget = { code: string; label: string; ratePerM2: number; desc: string };
type DirtLevel = { level: 1 | 2 | 3 | 4 | 5; label: string; desc: string; multiplier: number };

// Parse number config dengan fallback. Tolerate string/number/null.
function num(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(typeof v === 'string' ? v.replace(/"/g, '') : v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function arr<T>(v: unknown, fallback: T[]): T[] {
  if (Array.isArray(v) && v.length > 0) return v as T[];
  return fallback;
}

export function usePostRenoLevels(): PostRenoLevel[] {
  const v = useConfig('pricing.post_reno.levels' as any, null as any);
  return arr<PostRenoLevel>(v, POST_RENO_LEVELS);
}

export function usePostRenoTargets(): RateTarget[] {
  const v = useConfig('pricing.post_reno.targets' as any, null as any);
  return arr<RateTarget>(v, POST_RENO_TARGETS);
}

export function usePostRenoBathroomRate(): number {
  const v = useConfig('pricing.post_reno.bathroom_rate' as any, null as any);
  return num(v, POST_RENO_BATHROOM_RATE);
}

export function usePostRenoKitchenFlat(): number {
  const v = useConfig('pricing.post_reno.kitchen_flat' as any, null as any);
  return num(v, POST_RENO_KITCHEN_FLAT);
}

export function usePostRenoMaxM2(): number {
  const v = useConfig('pricing.post_reno.max_m2' as any, null as any);
  return num(v, POST_RENO_MAX_M2);
}

export function useLargeScaleTargets(): RateTarget[] {
  const v = useConfig('pricing.large_scale.targets' as any, null as any);
  return arr<RateTarget>(v, LARGE_SCALE_TARGETS);
}

export function useLargeScaleBathroomRate(): number {
  const v = useConfig('pricing.large_scale.bathroom_rate' as any, null as any);
  return num(v, LARGE_SCALE_BATHROOM_RATE);
}

export function useLargeScaleMaxM2(): number {
  const v = useConfig('pricing.large_scale.max_m2' as any, null as any);
  return num(v, LARGE_SCALE_MAX_M2);
}

export function useDirtLevels(): DirtLevel[] {
  const v = useConfig('pricing.dirt_levels' as any, null as any);
  return arr<DirtLevel>(v, DIRT_LEVELS);
}

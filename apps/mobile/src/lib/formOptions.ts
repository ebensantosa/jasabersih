// Form options dari app_config admin-controlled, fallback ke hardcoded
// catalog.ts kalau API kosong (offline / belum migrate).
import { useConfig } from '../stores/appContent';
import {
  DIRT_CHARACTERS,
  FLOOR_OPTIONS,
  FLOOR_TYPES,
  FURNITURE_DENSITY,
  LARGE_SCALE_PROPERTY_TYPES,
  POST_RENO_PROPERTY_TYPES,
  PROPERTY_TYPES,
  ROOM_FACILITIES,
  SUBSCRIPTION_DAYS,
} from '../data/catalog';

function arrStr(v: unknown, fallback: readonly string[]): readonly string[] {
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')) return v as string[];
  return fallback;
}

function arrObj<T>(v: unknown, fallback: T[]): T[] {
  if (Array.isArray(v) && v.length > 0) return v as T[];
  return fallback;
}

export function usePropertyTypes(): readonly string[] {
  const v = useConfig('forms.property_types' as any, null as any);
  return arrStr(v, PROPERTY_TYPES);
}

export function useLargeScalePropertyTypes(): readonly string[] {
  const v = useConfig('forms.property_types.large_scale' as any, null as any);
  return arrStr(v, LARGE_SCALE_PROPERTY_TYPES);
}

export function usePostRenoPropertyTypes(): readonly string[] {
  const v = useConfig('forms.property_types.post_reno' as any, null as any);
  return arrStr(v, POST_RENO_PROPERTY_TYPES);
}

export function useFloorOptions(): readonly string[] {
  const v = useConfig('forms.floor_options' as any, null as any);
  return arrStr(v, FLOOR_OPTIONS);
}

export function useFloorTypes(): readonly string[] {
  const v = useConfig('forms.floor_types' as any, null as any);
  return arrStr(v, FLOOR_TYPES);
}

export function useRoomFacilities(): readonly string[] {
  const v = useConfig('forms.room_facilities' as any, null as any);
  return arrStr(v, ROOM_FACILITIES);
}

export function useDirtCharacters(): readonly string[] {
  const v = useConfig('forms.dirt_characters' as any, null as any);
  return arrStr(v, DIRT_CHARACTERS);
}

export function useFurnitureDensity(): readonly string[] {
  const v = useConfig('forms.furniture_density' as any, null as any);
  return arrStr(v, FURNITURE_DENSITY);
}

export function useSubscriptionDays(): readonly string[] {
  const v = useConfig('forms.subscription_days' as any, null as any);
  return arrStr(v, SUBSCRIPTION_DAYS);
}

type BathroomSize = { code: string; label: string; desc: string; mult: number };
const DEFAULT_BATHROOM_SIZES: BathroomSize[] = [
  { code: 'kecil', label: 'Kecil', desc: '≤4m²', mult: 1.0 },
  { code: 'sedang', label: 'Sedang', desc: '4–8m²', mult: 1.25 },
  { code: 'besar', label: 'Besar', desc: '>8m²', mult: 1.5 },
];

export function useBathroomSizes(): BathroomSize[] {
  const v = useConfig('pricing.bathroom_sizes' as any, null as any);
  return arrObj<BathroomSize>(v, DEFAULT_BATHROOM_SIZES);
}

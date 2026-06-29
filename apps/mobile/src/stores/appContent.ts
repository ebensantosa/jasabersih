import { useMemo } from 'react';
import { create } from 'zustand';

import { api } from '../lib/api';

// Mirror server response. Catatan: nilai apapun yg defined di app_config dipake;
// fallback hardcoded di getter (di-consume hook) untuk safety kalau API down saat boot.
export type AppConfig = Partial<{
  'brand.app_name': string;
  'brand.tagline': string;
  'brand.logo_url': string;
  'brand.primary_color': string;
  'brand.secondary_color': string;
  'typography.font_family': string;
  'typography.base_size': number;
  'contact.whatsapp': string;
  'contact.email': string;
  'contact.phone': string;
  'feature.cancel_window_sec': number;
  'feature.cancel_penalty_pct': number;
  'feature.min_withdrawal': number;
  'feature.max_addresses': number;
  'feature.call_enabled': boolean;
  'hero.subtitle': string;
  'hero.cta_label': string;
  'safety.chat_banner': string;
  'payment.maintenance_notice': string;
}> & Record<string, unknown>;

export type Banner = { id: string; title: string; subtitle: string | null; imageUrl: string; linkUrl: string | null; placement: string; sortOrder: number };
export type ServiceItem = { id: string; code: string; name: string; description: string | null; iconUrl: string | null; displayOrder: number | null; showOnHome?: boolean };
export type Addon = { id: string; code: string | null; name: string; price: number; durationMin: number; description: string | null };
export type HourlyTier = { id: string; code: string | null; name: string | null; description?: string | null; pricePerHour: number; minHours: number; maxHours?: number; cleanerSharePct: number };
export type SubscriptionTier = { id: string; code: 'basic' | 'standard' | 'premium' | 'ultimate'; label: string; tagline: string | null; multiplier: number; scope: string[]; displayOrder: number };
export type PackageItem = { id: string; serviceId: string; name: string; price: number; durationMin: number; scope: any };
export type Announcement = { id: string; title: string; body: string; severity: 'info' | 'warning' | 'critical'; audience: string };
export type CommissionTier = { id: string; rangeMin: number | null; rangeMax: number | null; shareNoTools: number; shareWithTools: number };
export type ServiceArea = { id: string; name: string; city: string; radiusM: number; surgeMultiplier: number; lat: number; lng: number };

export type AppContent = {
  config: AppConfig;
  banners: Banner[];
  services: ServiceItem[];
  addons: Addon[];
  hourlyTiers: HourlyTier[];
  subscriptionTiers: SubscriptionTier[];
  packages: PackageItem[];
  announcement: Announcement | null;
  commissionTiers: CommissionTier[];
  serviceAreas: ServiceArea[];
};

const EMPTY: AppContent = {
  config: {},
  banners: [],
  services: [],
  addons: [],
  hourlyTiers: [],
  subscriptionTiers: [],
  packages: [],
  announcement: null,
  commissionTiers: [],
  serviceAreas: [],
};

type AppContentStore = {
  content: AppContent;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  fetch: (force?: boolean) => Promise<void>;
};

const TTL_MS = 30_000; // 30s - keeps mobile in sync with admin CMS edits without forcing manual refresh

export const useAppContent = create<AppContentStore>((set, get) => ({
  content: EMPTY,
  loading: false,
  error: null,
  lastFetchedAt: null,

  async fetch(force = false) {
    const last = get().lastFetchedAt;
    if (!force && last && Date.now() - last < TTL_MS) return;
    set({ loading: true, error: null });
    try {
      const res = await api.get('/app/content');
      // API wraps in { data, error }
      const data = res.data?.data ?? res.data ?? EMPTY;
      // Coerce numeric strings (BIGINT serialized as string by api)
      const coerce = (v: any) => (v == null ? v : Number(v));
      set({
        content: {
          config: data.config ?? {},
          banners: data.banners ?? [],
          services: data.services ?? [],
          addons: (data.addons ?? []).map((a: any) => ({ ...a, price: coerce(a.price) })),
          hourlyTiers: (data.hourlyTiers ?? []).map((t: any) => ({ ...t, pricePerHour: coerce(t.pricePerHour), minHours: coerce(t.minHours), maxHours: t.maxHours == null ? 8 : coerce(t.maxHours), cleanerSharePct: coerce(t.cleanerSharePct) })),
          subscriptionTiers: (data.subscriptionTiers ?? []).map((t: any) => ({ id: t.id, code: t.code, label: t.label, tagline: t.tagline ?? null, multiplier: Number(t.multiplier ?? 1), scope: Array.isArray(t.scope) ? t.scope : [], displayOrder: Number(t.displayOrder ?? 0) })),
          packages: (data.packages ?? []).map((p: any) => ({ ...p, price: coerce(p.price) })),
          announcement: data.announcement ?? null,
          commissionTiers: (data.commissionTiers ?? []).map((c: any) => ({ ...c, rangeMin: c.rangeMin == null ? null : coerce(c.rangeMin), rangeMax: c.rangeMax == null ? null : coerce(c.rangeMax), shareNoTools: coerce(c.shareNoTools), shareWithTools: coerce(c.shareWithTools) })),
          serviceAreas: (data.serviceAreas ?? []).map((a: any) => ({ ...a, radiusM: coerce(a.radiusM), surgeMultiplier: Number(a.surgeMultiplier ?? 1), lat: Number(a.lat), lng: Number(a.lng) })),
        },
        loading: false,
        lastFetchedAt: Date.now(),
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'gagal' });
    }
  },
}));

// Convenience hooks
export function useConfig<K extends keyof AppConfig>(key: K, fallback: AppConfig[K]): NonNullable<AppConfig[K]> {
  const v = useAppContent((s) => s.content.config[key]);
  return ((v ?? fallback) as NonNullable<AppConfig[K]>);
}

export function useBanners(placement?: string): Banner[] {
  const banners = useAppContent((s) => s.content.banners);
  return useMemo(
    () => (placement ? banners.filter((b) => b.placement === placement) : banners),
    [banners, placement],
  );
}

export function useApiServices(): ServiceItem[] {
  return useAppContent((s) => s.content.services);
}

export function useApiAddons(): Addon[] {
  return useAppContent((s) => s.content.addons);
}

export function useApiHourlyTiers(): HourlyTier[] {
  return useAppContent((s) => s.content.hourlyTiers);
}

export function useApiSubscriptionTiers(): SubscriptionTier[] {
  return useAppContent((s) => s.content.subscriptionTiers);
}

export function useApiPackagesForService(serviceCode: string): PackageItem[] {
  const services = useAppContent((s) => s.content.services);
  const packages = useAppContent((s) => s.content.packages);
  return useMemo(() => {
    const svc = services.find((x) => x.code === serviceCode);
    if (!svc) return [];
    return packages.filter((p) => p.serviceId === svc.id);
  }, [services, packages, serviceCode]);
}

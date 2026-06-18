import { create } from 'zustand';

import { SERVICE_CATEGORIES } from '../data/catalog';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import { useModeStore } from './mode';

const BOOKINGS_KEY = 'bookings.list';

function safeIsoDate(v: any): string {
  if (typeof v === 'string' && v) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  return new Date().toISOString();
}

function safeTimestamp(v: any): number {
  if (typeof v === 'string' && v) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return Date.now();
}

function pickBookingTitle(source: any): string {
  return source?.categoryName
    ?? source?.packageName
    ?? source?.hourlyTierName
    ?? source?.serviceName
    ?? source?.service_name
    ?? source?.formSnapshot?.categoryName
    ?? source?.formSnapshot?.packageName
    ?? source?.formSnapshot?.hourlyTierName
    ?? source?.form_snapshot?.categoryName
    ?? source?.form_snapshot?.packageName
    ?? source?.form_snapshot?.hourlyTierName
    ?? 'Layanan';
}

function resolveBookingImage(source: any, fallback?: string): string {
  const direct = source?.serviceIcon
    ?? source?.service_icon
    ?? source?.categoryImage
    ?? fallback;
  if (typeof direct === 'string' && direct.trim().length > 0) return direct;

  const categoryCode = source?.categoryCode
    ?? source?.category_code
    ?? source?.formSnapshot?.categoryCode
    ?? source?.form_snapshot?.categoryCode;
  if (typeof categoryCode === 'string' && categoryCode) {
    const byCode = SERVICE_CATEGORIES.find((item) => item.code === categoryCode);
    if (byCode?.imageUrl) return byCode.imageUrl;
  }

  const title = String(pickBookingTitle(source)).toLowerCase();
  const byName = SERVICE_CATEGORIES.find((item) =>
    item.name.toLowerCase() === title || title.includes(item.name.toLowerCase()),
  );
  if (byName?.imageUrl) return byName.imageUrl;

  return SERVICE_CATEGORIES[0]?.imageUrl ?? '';
}

export type PricingMode = 'package' | 'hourly' | 'wa_survey';

export type BookingStatus =
  | 'pending_payment'
  | 'searching'
  | 'matched'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'wa_survey_pending' // menunggu CS contact untuk WA Survey
  | 'subscription_parent' // parent subscription booking - liat child untuk detail per visit
  | 'scheduled_future'; // child subscription visit yg belum jadwalnya (h-1 baru wake up via cron)

export type ChatMessage = {
  id: string;
  senderId: 'me' | 'cleaner' | 'system';
  text: string;
  createdAt: number;
};

/** Snapshot form yang customer submit - immutable, untuk anti-fraud audit. */
export type FormSnapshot = {
  propertyType?: string;
  floor?: string;
  hasLift?: boolean;
  bedrooms?: number;
  bathrooms?: number;
  facilities?: string[];
  areaM2?: number;
  dirtLevel?: 1 | 2 | 3 | 4 | 5;
  dirtCharacters?: string[];
  floorType?: string;
  furnitureDensity?: string;
  hasWater?: boolean;
  hasElectricity?: boolean;
  hasPet?: boolean;
  petNote?: string;
  notes?: string;
  photoCount?: number;
};

export type Booking = {
  id: string;
  pricingMode: PricingMode;
  // Common
  categoryCode: string;
  categoryName: string;
  categoryImage: string;
  addressLine: string;
  scheduledAt: string;
  status: BookingStatus;
  createdAt: number;
  paidAt?: number;
  startedAt?: number;
  pauseStartedAt?: number;
  pausedTotalSec?: number;
  completedAt?: number;
  cancelRefund?: number;
  // Mode-specific
  packageId?: string;
  packageName?: string;
  hourlyTierId?: string;
  hourlyTierCode?: string;
  hourlyTierName?: string;
  hours?: number;
  surveyDescription?: string;
  // Add-ons & price
  addOns: { code: string; name: string; price: number }[];
  basePrice: number;
  dirtSurcharge: number;
  totalPrice: number;
  cleanerPayout?: number;
  // Anti-fraud snapshot
  formSnapshot?: FormSnapshot;
  // Cleaner (assigned later)
  cleanerId?: string;
  cleanerName?: string;
  cleanerPhotoUrl?: string;
  messages: ChatMessage[];
};

type State = {
  list: Booking[];
  hydrated: boolean;
  create: (
    b: Omit<Booking, 'id' | 'createdAt' | 'messages' | 'status'> & { initialStatus?: BookingStatus },
  ) => Promise<Booking>;
  setStatus: (id: string, status: BookingStatus) => void;
  markPaid: (id: string) => void;
  cancel: (id: string, refund?: number) => void;
  appendMessage: (id: string, msg: Omit<ChatMessage, 'id' | 'createdAt'>) => void;
  hydrate: () => void;
  setListInternal: (list: Booking[]) => void;
  // API integration - pull server state, push local mutations
  syncFromApi: () => Promise<void>;
  /** Fetch a single booking by id from server (works for cleaner too) and seed into list. */
  fetchOne: (id: string) => Promise<void>;
  syncing: boolean;
  syncError: string | null;
  clearLocal: () => void;
};

function persist(list: Booking[]): void {
  storage.set(BOOKINGS_KEY, JSON.stringify(list));
}

// Map server status (from API) to mobile UI status
function mapServerStatus(s: string | null | undefined): BookingStatus {
  switch (s) {
    case 'pending_payment': return 'pending_payment';
    case 'searching':
    case 'searching_cleaner': return 'searching';
    case 'matched':
    case 'confirmed': return 'matched';
    case 'cleaner_otw':
    case 'on_the_way': return 'on_the_way';
    case 'in_progress':
    case 'started': return 'in_progress';
    case 'completed': return 'completed';
    case 'cancelled':
    case 'canceled': return 'canceled';
    default: return 'searching';
  }
}

export const useBookingsStore = create<State>((set, get) => ({
  list: [],
  hydrated: false,
  syncing: false,
  syncError: null,
  clearLocal() {
    storage.delete(BOOKINGS_KEY);
    set({ list: [], hydrated: true, syncError: null });
  },
  async syncFromApi() {
    set({ syncing: true, syncError: null });
    try {
      const mode = useModeStore.getState().mode;
      const items: any[] = mode === 'freelancer'
        ? await (async () => {
            const [activeRes, historyRes] = await Promise.all([
              api.get('/cleaner/jobs/active'),
              api.get('/cleaner/jobs/history'),
            ]);
            const activeItems: any[] = activeRes.data?.data ?? activeRes.data ?? [];
            const historyItems: any[] = historyRes.data?.data ?? historyRes.data ?? [];
            const seen = new Set<string>();
            return [...activeItems, ...historyItems].filter((item) => {
              const id = String(item?.id ?? '');
              if (!id || seen.has(id)) return false;
              seen.add(id);
              return true;
            });
          })()
        : await (async () => {
            const res = await api.get('/bookings');
            return res.data?.data ?? [];
          })();
      // Merge with local list - server entries take precedence on conflict (id match);
      // entries that exist only locally (not yet pushed) stay.
      const local = get().list;
      const serverIds = new Set(items.map((i) => i.id));
      const serverMapped: Booking[] = items.map((s) => {
        const existing = local.find((b) => b.id === s.id);
        const total = Number(s.total ?? existing?.totalPrice ?? 0);
        const cleanerPayout = (s as any).cleanerPayout != null
          ? Number((s as any).cleanerPayout)
          : existing?.cleanerPayout;
        return existing ? { ...existing, status: mapServerStatus(s.status), totalPrice: total, cleanerPayout, cleanerId: (s as any).cleanerId ?? (s as any).cleaner_id ?? existing.cleanerId, cleanerName: s.cleanerName ?? existing.cleanerName, cleanerPhotoUrl: (s as any).cleanerPhotoUrl ?? (s as any).cleaner_photo_url ?? existing.cleanerPhotoUrl, scheduledAt: s.scheduledAt ?? existing.scheduledAt, categoryImage: resolveBookingImage(s, existing.categoryImage) }
          : {
              id: s.id,
              pricingMode: (s.pricingMode ?? 'package') as PricingMode,
              categoryCode: s.categoryCode ?? s.category_code ?? s.formSnapshot?.categoryCode ?? s.form_snapshot?.categoryCode ?? '',
              categoryName: pickBookingTitle(s),
              categoryImage: resolveBookingImage(s),
              addressLine: s.addressLine ?? s.address_line ?? s.address ?? '',
              scheduledAt: safeIsoDate(s.scheduledAt),
              status: mapServerStatus(s.status),
              createdAt: safeTimestamp(s.createdAt),
              addOns: [], basePrice: total, dirtSurcharge: 0, totalPrice: total,
              cleanerPayout,
              cleanerId: (s as any).cleanerId ?? (s as any).cleaner_id ?? undefined,
              cleanerName: s.cleanerName ?? undefined,
              cleanerPhotoUrl: (s as any).cleanerPhotoUrl ?? (s as any).cleaner_photo_url ?? undefined,
              messages: [],
            } as Booking;
      });
      // Keep local-only (not yet on server - likely fresh creates not synced)
      const localOnly = local.filter((b) => !serverIds.has(b.id));
      const merged = [...serverMapped, ...localOnly];
      persist(merged);
      set({ list: merged, syncing: false });
    } catch (e: any) {
      set({ syncing: false, syncError: e?.message ?? 'gagal sync' });
    }
  },
  hydrate: () => {
    const raw = storage.getString(BOOKINGS_KEY);
    if (raw) {
      try {
        const list = JSON.parse(raw) as Booking[];
        set({ list, hydrated: true });
        return;
      } catch {
        storage.delete(BOOKINGS_KEY);
      }
    }
    set({ hydrated: true });
  },
  setListInternal: (list) => {
    persist(list);
    set({ list });
  },
  fetchOne: async (id: string) => {
    try {
      const r = await api.get(`/bookings/${id}`);
      const s: any = r.data?.data ?? r.data;
      if (!s?.id) return;
      const total = Number(s.total_amount ?? s.total ?? 0);
      const snapshot = s.form_snapshot ?? s.formSnapshot ?? {};
      const mapped: Booking = {
        id: s.id,
        pricingMode: (s.pricing_mode ?? s.pricingMode ?? 'package') as PricingMode,
        categoryCode: s.category_code ?? s.categoryCode ?? snapshot.categoryCode ?? '',
        categoryName: pickBookingTitle({ ...s, formSnapshot: snapshot }),
        categoryImage: resolveBookingImage({ ...s, formSnapshot: snapshot }),
        addressLine: s.address_line ?? s.address ?? '',
        scheduledAt: safeIsoDate(s.scheduled_at ?? s.scheduledAt),
        status: mapServerStatus(s.status),
        createdAt: safeTimestamp(s.created_at),
        addOns: [], basePrice: total, dirtSurcharge: 0, totalPrice: total,
        cleanerPayout: (s.cleaner_payout ?? s.cleanerPayout) != null ? Number(s.cleaner_payout ?? s.cleanerPayout) : undefined,
        cleanerId: s.cleaner_id ?? s.cleanerId ?? undefined,
        cleanerName: s.cleaner_name ?? s.cleanerName ?? undefined,
        cleanerPhotoUrl: s.cleaner_photo_url ?? s.cleanerPhotoUrl ?? undefined,
        paidAt: s.paid_at ? (Number.isFinite(Date.parse(s.paid_at)) ? Date.parse(s.paid_at) : undefined) : undefined,
        startedAt: (s.started_at ?? s.startedAt) ? (Number.isFinite(Date.parse(s.started_at ?? s.startedAt)) ? Date.parse(s.started_at ?? s.startedAt) : undefined) : undefined,
        pauseStartedAt: (s.pause_started_at ?? s.pauseStartedAt) ? (Number.isFinite(Date.parse(s.pause_started_at ?? s.pauseStartedAt)) ? Date.parse(s.pause_started_at ?? s.pauseStartedAt) : undefined) : undefined,
        pausedTotalSec: (s.paused_total_sec ?? s.pausedTotalSec) != null ? Number(s.paused_total_sec ?? s.pausedTotalSec) : 0,
        completedAt: (s.completed_at ?? s.completedAt) ? (Number.isFinite(Date.parse(s.completed_at ?? s.completedAt)) ? Date.parse(s.completed_at ?? s.completedAt) : undefined) : undefined,
        hours: (s.hoursBooked ?? s.hours_booked) != null ? Number(s.hoursBooked ?? s.hours_booked) : undefined,
        hourlyTierId: s.hourlyTierId ?? undefined,
        hourlyTierName: s.hourlyTierName ?? snapshot.hourlyTierName ?? undefined,
        packageName: s.packageName ?? snapshot.packageName ?? undefined,
        formSnapshot: snapshot,
        messages: [],
      };
      const cur = get().list;
      const without = cur.filter((b) => b.id !== mapped.id);
      const next = [mapped, ...without];
      persist(next);
      set({ list: next });
    } catch { /* silent */ }
  },
  create: async ({ initialStatus, ...b }) => {
    const tempId = 'bk_' + Math.random().toString(36).slice(2, 10);
    const status: BookingStatus = initialStatus ?? 'searching';
    const booking: Booking = {
      ...b,
      id: tempId,
      status,
      createdAt: Date.now(),
      messages: [],
    };
    const next = [booking, ...get().list];
    persist(next);
    set({ list: next });

    // Await POST ke API so caller can navigate with the FINAL server UUID
    // (avoids race where store swaps id but caller still has tempId).
    if (b.pricingMode !== 'wa_survey') {
      // Only forward UUID-shaped IDs to API (local catalog uses string codes
      // like "pkg_kamar_standard" that fail backend Zod uuid validation).
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const safePackageId = b.packageId && UUID_RE.test(b.packageId) ? b.packageId : undefined;
      const safeHourlyTierId = b.hourlyTierId && UUID_RE.test(b.hourlyTierId) ? b.hourlyTierId : undefined;
      const payload = {
        pricingMode: b.pricingMode,
        packageId: safePackageId,
        hourlyTierId: safeHourlyTierId,
        hoursBooked: b.hours,
        scheduledAt: b.scheduledAt,
        addressLine: b.addressLine,
        baseAmount: Math.round(b.basePrice),
        totalAmount: Math.round(b.totalPrice),
        formSnapshot: {
          ...(b.formSnapshot ?? {}),
          localPackageCode: safePackageId ? undefined : b.packageId,
          packageName: b.packageName ?? null,
          categoryName: b.categoryName ?? null,
          categoryCode: b.categoryCode ?? null,
        },
        voucherCode: (b.formSnapshot as any)?.voucherCode ?? undefined,
        customerNotes: undefined,
      };
      try {
        const res = await api.post('/bookings', payload);
        const serverId = res.data?.data?.id ?? res.data?.id;
        if (serverId) {
          const updated = get().list.map((row) => row.id === tempId ? { ...row, id: serverId } : row);
          persist(updated);
          set({ list: updated });
          return { ...booking, id: serverId };
        }
      } catch (err: any) {
        const msg = err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err?.message ?? 'Gagal kirim ke server';
        try {
          const { toast } = await import('./ui');
          toast.error(`Pesanan belum tersimpan: ${msg}`);
        } catch {}
        // Drop the local-only stub so user gets clean retry instead of stuck bk_ booking
        const cleaned = get().list.filter((row) => row.id !== tempId);
        persist(cleaned);
        set({ list: cleaned });
        throw err;
      }
    }

    return booking;
  },
  setStatus: (id, status) => {
    const before = get().list.find((b) => b.id === id);
    const next = get().list.map((b) => (b.id === id ? { ...b, status } : b));
    persist(next);
    set({ list: next });
    // Auto-credit cleaner wallet saat job baru saja completed
    if (status === 'completed' && before && before.status !== 'completed' && before.cleanerName) {
      // Lazy import untuk hindari circular dependency
      Promise.all([import('./cleanerWallet'), import('./cleaner')])
        .then(([{ useCleanerWalletStore }, { useCleanerStore }]) => {
          const bringsTools = useCleanerStore.getState().bringsTools;
          useCleanerWalletStore
            .getState()
            .addEarning(
              before.id,
              before.totalPrice,
              bringsTools,
              `${before.categoryName} · ${before.id.toUpperCase()}`,
            );
        })
        .catch(() => {});
    }
  },
  markPaid: (id) => {
    const next = get().list.map((b) =>
      b.id === id ? { ...b, paidAt: Date.now(), status: 'searching' as const } : b,
    );
    persist(next);
    set({ list: next });
    // Push to API (server-side: status 'pending_payment' → 'searching')
    if (!id.startsWith('bk_')) {
      api.post(`/bookings/${id}/pay`).catch(() => {});
    }
  },
  cancel: (id, refund) => {
    const next = get().list.map((b) =>
      b.id === id ? { ...b, status: 'canceled' as const, cancelRefund: refund } : b,
    );
    persist(next);
    set({ list: next });
    if (!id.startsWith('bk_')) {
      api.post(`/bookings/${id}/cancel`).catch(async (e: any) => {
        const { toast } = await import('./ui');
        // Rollback optimistic update kalau server tolak
        const rolled = get().list.map((b) => b.id === id ? { ...b, status: 'pending_payment' as const, cancelRefund: undefined } : b);
        persist(rolled);
        set({ list: rolled });
        toast.error(e?.response?.data?.error?.message ?? 'Gagal batalkan pesanan');
      });
    }
  },
  appendMessage: (id, msg) => {
    const next = get().list.map((b) =>
      b.id === id
        ? {
            ...b,
            messages: [
              ...b.messages,
              { ...msg, id: 'm' + Math.random().toString(36).slice(2, 8), createdAt: Date.now() },
            ],
          }
        : b,
    );
    persist(next);
    set({ list: next });
  },
}));

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: 'Menunggu Pembayaran',
  searching: 'Mencari Cleaner',
  matched: 'Cleaner Ditemukan',
  on_the_way: 'Cleaner Menuju Lokasi',
  in_progress: 'Sedang Dikerjakan',
  completed: 'Selesai',
  canceled: 'Dibatalkan',
  wa_survey_pending: 'Menunggu CS Hubungi',
  subscription_parent: 'Paket Langganan',
  scheduled_future: 'Terjadwal',
};

export const STATUS_COLOR: Record<BookingStatus, { bg: string; fg: string }> = {
  pending_payment: { bg: '#FEF3C7', fg: '#B45309' },
  searching: { bg: '#DBEAFE', fg: '#1D4ED8' },
  matched: { bg: '#D1FAE5', fg: '#047857' },
  on_the_way: { bg: '#DBEAFE', fg: '#1D4ED8' },
  in_progress: { bg: '#FEF3C7', fg: '#B45309' },
  completed: { bg: '#D1FAE5', fg: '#047857' },
  canceled: { bg: '#FEE2E2', fg: '#B91C1C' },
  wa_survey_pending: { bg: '#FEF3C7', fg: '#B45309' },
  subscription_parent: { bg: '#EDE9FE', fg: '#5B21B6' }, // ungu, beda dari status biasa
  scheduled_future: { bg: '#F1F5F9', fg: '#475569' },
};

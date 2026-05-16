import { create } from 'zustand';

import { api } from '../lib/api';
import { storage } from '../lib/storage';

const BOOKINGS_KEY = 'bookings.list';

export type PricingMode = 'package' | 'hourly' | 'wa_survey';

export type BookingStatus =
  | 'pending_payment'
  | 'searching'
  | 'matched'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'wa_survey_pending'; // menunggu CS contact untuk WA Survey

export type ChatMessage = {
  id: string;
  senderId: 'me' | 'cleaner' | 'system';
  text: string;
  createdAt: number;
};

/** Snapshot form yang customer submit — immutable, untuk anti-fraud audit. */
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
  cancelRefund?: number;
  // Mode-specific
  packageId?: string;
  packageName?: string;
  hourlyTierCode?: string;
  hourlyTierName?: string;
  hours?: number;
  surveyDescription?: string;
  // Add-ons & price
  addOns: { code: string; name: string; price: number }[];
  basePrice: number;
  dirtSurcharge: number;
  totalPrice: number;
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
  // API integration — pull server state, push local mutations
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
      const res = await api.get('/bookings');
      const items: any[] = res.data?.data ?? [];
      // Merge with local list — server entries take precedence on conflict (id match);
      // entries that exist only locally (not yet pushed) stay.
      const local = get().list;
      const serverIds = new Set(items.map((i) => i.id));
      const serverMapped: Booking[] = items.map((s) => {
        const existing = local.find((b) => b.id === s.id);
        const total = Number(s.total ?? 0);
        return existing ? { ...existing, status: mapServerStatus(s.status), totalPrice: total, cleanerId: (s as any).cleanerId ?? (s as any).cleaner_id ?? existing.cleanerId, cleanerName: s.cleanerName ?? existing.cleanerName, cleanerPhotoUrl: (s as any).cleanerPhotoUrl ?? (s as any).cleaner_photo_url ?? existing.cleanerPhotoUrl, scheduledAt: s.scheduledAt ?? existing.scheduledAt, categoryImage: s.serviceIcon ?? existing.categoryImage }
          : {
              id: s.id,
              pricingMode: (s.pricingMode ?? 'package') as PricingMode,
              categoryCode: '',
              categoryName: s.packageName ?? s.serviceName ?? 'Layanan',
              categoryImage: s.serviceIcon ?? '',
              addressLine: s.address ?? '',
              scheduledAt: s.scheduledAt ?? new Date().toISOString(),
              status: mapServerStatus(s.status),
              createdAt: s.createdAt ? new Date(s.createdAt).getTime() : Date.now(),
              addOns: [], basePrice: total, dirtSurcharge: 0, totalPrice: total,
              cleanerId: (s as any).cleanerId ?? (s as any).cleaner_id ?? undefined,
              cleanerName: s.cleanerName ?? undefined,
              cleanerPhotoUrl: (s as any).cleanerPhotoUrl ?? (s as any).cleaner_photo_url ?? undefined,
              messages: [],
            } as Booking;
      });
      // Keep local-only (not yet on server — likely fresh creates not synced)
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
      const mapped: Booking = {
        id: s.id,
        pricingMode: (s.pricing_mode ?? s.pricingMode ?? 'package') as PricingMode,
        categoryCode: '',
        categoryName: s.service_name ?? s.serviceName ?? 'Layanan',
        categoryImage: s.service_icon ?? s.serviceIcon ?? '',
        addressLine: s.address_line ?? s.address ?? '',
        scheduledAt: s.scheduled_at ?? s.scheduledAt ?? new Date().toISOString(),
        status: mapServerStatus(s.status),
        createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now(),
        addOns: [], basePrice: total, dirtSurcharge: 0, totalPrice: total,
        cleanerId: s.cleaner_id ?? s.cleanerId ?? undefined,
        cleanerName: s.cleaner_name ?? s.cleanerName ?? undefined,
        cleanerPhotoUrl: s.cleaner_photo_url ?? s.cleanerPhotoUrl ?? undefined,
        paidAt: s.paid_at ? new Date(s.paid_at).getTime() : undefined,
        formSnapshot: s.form_snapshot ?? s.formSnapshot ?? {},
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
      const payload = {
        pricingMode: b.pricingMode,
        packageId: safePackageId,
        hourlyTierId: undefined,
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
};

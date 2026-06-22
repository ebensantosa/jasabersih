import { create } from 'zustand';

import { api } from '../lib/api';
import { storage } from '../lib/storage';

const KEY = 'addresses.list';
const ADDRESSES_SYNC_STALE_MS = 10_000;

let addressesSyncPromise: Promise<void> | null = null;
let addressesLastSyncedAt = 0;

export type SavedAddress = {
  id: string;
  label: string; // "Rumah", "Kantor", "Kos", custom
  recipientName: string;
  recipientPhone: string;
  addressLine: string; // alamat full dari peta
  detailNote?: string; // patokan, kode pintu, lantai
  lat: number;
  lng: number;
  isDefault: boolean;
};

type State = {
  list: SavedAddress[];
  hydrated: boolean;
  add: (a: Omit<SavedAddress, 'id'>) => SavedAddress;
  update: (id: string, patch: Partial<SavedAddress>) => void;
  remove: (id: string) => void;
  setDefault: (id: string) => void;
  getDefault: () => SavedAddress | null;
  hydrate: () => void;
  syncFromApi: (force?: boolean) => Promise<void>;
  syncing: boolean;
  clearLocal: () => void;
};

function persist(list: SavedAddress[]): void {
  storage.set(KEY, JSON.stringify(list));
}

export const useAddressesStore = create<State>((set, get) => ({
  list: [],
  hydrated: false,
  syncing: false,
  clearLocal() {
    storage.delete(KEY);
    set({ list: [], hydrated: true });
    addressesLastSyncedAt = 0;
    addressesSyncPromise = null;
  },
  async syncFromApi(force = false) {
    if (!force && addressesSyncPromise) return addressesSyncPromise;
    if (!force && addressesLastSyncedAt && Date.now() - addressesLastSyncedAt < ADDRESSES_SYNC_STALE_MS) return;
    set({ syncing: true });
    addressesSyncPromise = (async () => {
      try {
        const res = await api.get('/addresses');
        const items: any[] = res.data?.data ?? [];
        const list: SavedAddress[] = items.map((a) => ({
          id: a.id,
          label: a.label ?? 'Alamat',
          recipientName: a.recipientName ?? '',
          recipientPhone: a.recipientPhone ?? '',
          addressLine: a.addressLine ?? '',
          detailNote: a.detailNote ?? undefined,
          lat: Number(a.lat ?? 0),
          lng: Number(a.lng ?? 0),
          isDefault: !!a.isDefault,
        }));
        persist(list);
        addressesLastSyncedAt = Date.now();
        set({ list, syncing: false });
      } catch {
        set({ syncing: false });
      } finally {
        addressesSyncPromise = null;
      }
    })();
    await addressesSyncPromise;
  },
  hydrate: () => {
    const raw = storage.getString(KEY);
    if (raw) {
      try {
        const list = JSON.parse(raw) as SavedAddress[];
        set({ list, hydrated: true });
        return;
      } catch {
        storage.delete(KEY);
      }
    }
    set({ hydrated: true });
  },
  add: (a) => {
    const tempId = 'addr_' + Math.random().toString(36).slice(2, 10);
    let list = get().list;
    const isDefault = a.isDefault || list.length === 0;
    if (isDefault) list = list.map((x) => ({ ...x, isDefault: false }));
    const next: SavedAddress = { ...a, id: tempId, isDefault };
    const newList = [...list, next];
    persist(newList);
    set({ list: newList });
    // Tandai sync fresh supaya syncFromApi yg dipanggil booking/new saat mount
    // tidak langsung overwrite optimistic state dengan GET yg masih return kosong.
    addressesLastSyncedAt = Date.now();

    // Push to API in background, replace tempId with server uuid
    api.post('/addresses', {
      label: a.label, recipientName: a.recipientName, recipientPhone: a.recipientPhone,
      addressLine: a.addressLine, city: 'Jakarta', detailNote: a.detailNote,
      lat: a.lat, lng: a.lng, isDefault,
    }).then((res) => {
      const serverId = res.data?.data?.id ?? res.data?.id;
      if (!serverId) return;
      const updated = get().list.map((x) => x.id === tempId ? { ...x, id: serverId } : x);
      persist(updated);
      set({ list: updated });
    }).catch(async (e: any) => {
      const { toast } = await import('./ui');
      toast.error(e?.response?.data?.error?.message ?? 'Gagal simpan alamat ke server');
    });

    return next;
  },
  update: (id, patch) => {
    let list = get().list;
    if (patch.isDefault) list = list.map((x) => ({ ...x, isDefault: false }));
    const newList = list.map((a) => (a.id === id ? { ...a, ...patch } : a));
    persist(newList);
    set({ list: newList });
    // Push to API kalau bukan local-only (tempId)
    if (!id.startsWith('addr_')) {
      api.patch(`/addresses/${id}`, patch).catch(async (e: any) => {
        const { toast } = await import('./ui');
        toast.error(e?.response?.data?.error?.message ?? 'Gagal update alamat');
      });
    }
  },
  remove: (id) => {
    const newList = get().list.filter((a) => a.id !== id);
    if (newList.length > 0 && !newList.some((a) => a.isDefault)) {
      newList[0]!.isDefault = true;
    }
    persist(newList);
    set({ list: newList });
    if (!id.startsWith('addr_')) {
      api.delete(`/addresses/${id}`).catch(async (e: any) => {
        const { toast } = await import('./ui');
        toast.error(e?.response?.data?.error?.message ?? 'Gagal hapus alamat di server');
      });
    }
  },
  setDefault: (id) => {
    const newList = get().list.map((a) => ({ ...a, isDefault: a.id === id }));
    persist(newList);
    set({ list: newList });
    if (!id.startsWith('addr_')) {
      api.post(`/addresses/${id}/set-default`).catch(async (e: any) => {
        const { toast } = await import('./ui');
        toast.error(e?.response?.data?.error?.message ?? 'Gagal set default');
      });
    }
  },
  getDefault: () => get().list.find((a) => a.isDefault) ?? get().list[0] ?? null,
}));

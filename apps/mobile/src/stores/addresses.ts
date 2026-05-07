import { create } from 'zustand';

import { storage } from '../lib/storage';

const KEY = 'addresses.list';

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
};

function persist(list: SavedAddress[]): void {
  storage.set(KEY, JSON.stringify(list));
}

export const useAddressesStore = create<State>((set, get) => ({
  list: [],
  hydrated: false,
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
    const id = 'addr_' + Math.random().toString(36).slice(2, 10);
    let list = get().list;
    // Kalau ini alamat pertama → otomatis default
    const isDefault = a.isDefault || list.length === 0;
    if (isDefault) list = list.map((x) => ({ ...x, isDefault: false }));
    const next: SavedAddress = { ...a, id, isDefault };
    const newList = [...list, next];
    persist(newList);
    set({ list: newList });
    return next;
  },
  update: (id, patch) => {
    let list = get().list;
    if (patch.isDefault) list = list.map((x) => ({ ...x, isDefault: false }));
    const newList = list.map((a) => (a.id === id ? { ...a, ...patch } : a));
    persist(newList);
    set({ list: newList });
  },
  remove: (id) => {
    const newList = get().list.filter((a) => a.id !== id);
    // Kalau yang di-remove adalah default & masih ada list → set yg pertama jadi default
    if (newList.length > 0 && !newList.some((a) => a.isDefault)) {
      newList[0]!.isDefault = true;
    }
    persist(newList);
    set({ list: newList });
  },
  setDefault: (id) => {
    const newList = get().list.map((a) => ({ ...a, isDefault: a.id === id }));
    persist(newList);
    set({ list: newList });
  },
  getDefault: () => get().list.find((a) => a.isDefault) ?? get().list[0] ?? null,
}));

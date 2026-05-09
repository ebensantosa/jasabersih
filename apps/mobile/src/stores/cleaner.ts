import { create } from 'zustand';

import { storage } from '../lib/storage';

const CLEANER_KEY = 'cleaner.profile';

type State = {
  name: string;
  serviceAreas: string[];
  /** True kalau cleaner punya & bawa alat sendiri (vacuum, mop, dll). Mempengaruhi tier komisi. */
  bringsTools: boolean;
  hydrated: boolean;
  setName: (name: string) => void;
  toggleArea: (area: string) => void;
  setAreas: (areas: string[]) => void;
  setBringsTools: (v: boolean) => void;
  hydrate: () => void;
  clearLocal: () => void;
};

type Persistable = Pick<State, 'name' | 'serviceAreas' | 'bringsTools'>;

function snapshot(s: State): Persistable {
  return { name: s.name, serviceAreas: s.serviceAreas, bringsTools: s.bringsTools };
}

function persist(p: Persistable): void {
  storage.set(CLEANER_KEY, JSON.stringify(p));
}

export const useCleanerStore = create<State>((set, get) => ({
  name: 'Mitra Cleaner',
  serviceAreas: [],
  bringsTools: false,
  hydrated: false,
  setName: (name) => {
    persist({ ...snapshot(get()), name });
    set({ name });
  },
  toggleArea: (area) => {
    const cur = get().serviceAreas;
    const next = cur.includes(area) ? cur.filter((a) => a !== area) : [...cur, area];
    persist({ ...snapshot(get()), serviceAreas: next });
    set({ serviceAreas: next });
  },
  setAreas: (areas) => {
    persist({ ...snapshot(get()), serviceAreas: areas });
    set({ serviceAreas: areas });
  },
  setBringsTools: (v) => {
    persist({ ...snapshot(get()), bringsTools: v });
    set({ bringsTools: v });
  },
  hydrate: () => {
    const raw = storage.getString(CLEANER_KEY);
    if (raw) {
      try {
        const p = JSON.parse(raw) as Partial<Persistable>;
        set({
          name: p.name ?? 'Mitra Cleaner',
          serviceAreas: p.serviceAreas ?? [],
          bringsTools: p.bringsTools ?? false,
          hydrated: true,
        });
        return;
      } catch {
        storage.delete(CLEANER_KEY);
      }
    }
    set({ hydrated: true });
  },
  clearLocal: () => {
    storage.delete(CLEANER_KEY);
    set({ name: 'Mitra Cleaner', serviceAreas: [], bringsTools: false, hydrated: true });
  },
}));

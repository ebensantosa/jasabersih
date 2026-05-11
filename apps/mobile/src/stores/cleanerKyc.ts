import { create } from 'zustand';

import { persistKeys, storage } from '../lib/storage';

const KEY = 'cleaner.kycStatus';

type State = {
  /** null = unknown (not yet fetched), otherwise current status */
  status: string | null;
  setStatus: (s: string | null) => void;
  hydrate: () => void;
  clear: () => void;
};

export const useCleanerKycStore = create<State>((set) => ({
  status: null,
  setStatus: (s) => {
    if (s === null) storage.delete(KEY);
    else storage.set(KEY, s);
    set({ status: s });
  },
  hydrate: () => {
    const raw = storage.getString(KEY);
    if (raw) set({ status: raw });
  },
  clear: () => {
    storage.delete(KEY);
    set({ status: null });
  },
}));

void persistKeys;

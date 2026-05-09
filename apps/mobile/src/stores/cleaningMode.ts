import { create } from 'zustand';

import { persistKeys, storage } from '../lib/storage';

export type CleaningMode = 'general' | 'deep';

type State = {
  mode: CleaningMode;
  hydrated: boolean;
  setMode: (m: CleaningMode) => void;
  hydrate: () => void;
};

export const useCleaningModeStore = create<State>((set) => ({
  mode: 'general',
  hydrated: false,
  setMode: (m) => {
    storage.set('app.cleaning_mode', m);
    set({ mode: m });
  },
  hydrate: () => {
    const raw = storage.getString('app.cleaning_mode');
    if (raw === 'general' || raw === 'deep') set({ mode: raw, hydrated: true });
    else set({ hydrated: true });
  },
}));

/** Round price UP to nearest 1000 IDR. */
export function roundUp1000(n: number): number {
  return Math.ceil(n / 1000) * 1000;
}

/** Apply cleaning-mode multiplier to a base package price, rounded up to nearest 1000. */
export function applyCleanMode(basePrice: number, mode: CleaningMode, deepMultiplier = 1.45): number {
  if (mode === 'general') return basePrice;
  return roundUp1000(basePrice * deepMultiplier);
}

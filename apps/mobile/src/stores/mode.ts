import type { UserMode } from '@jasabersih/shared-types';
import { create } from 'zustand';

import { persistKeys, storage } from '../lib/storage';
import { registerForPushAsync } from '../lib/pushSetup';

type State = {
  mode: UserMode;
  setMode: (m: UserMode) => void;
  toggle: () => void;
  hydrate: () => void;
};

export const useModeStore = create<State>((set, get) => ({
  mode: 'customer',
  setMode: (m) => {
    storage.set(persistKeys.mode, m);
    set({ mode: m });
    // Re-register push token dengan mode baru agar notif tidak bocor lintas mode
    void registerForPushAsync(m === 'customer' ? 'customer' : 'freelancer');
  },
  toggle: () => get().setMode(get().mode === 'customer' ? 'freelancer' : 'customer'),
  hydrate: () => {
    const raw = storage.getString(persistKeys.mode);
    if (raw === 'customer' || raw === 'freelancer') set({ mode: raw });
  },
}));

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
  toggle: () => {
    const { useUserStore } = require('./user');
    const profile = useUserStore.getState().profile;
    const next = get().mode === 'customer' ? 'freelancer' : 'customer';
    // Only allow toggle if user actually has the target role
    if (next === 'freelancer' && !profile?.isFreelancer) return;
    if (next === 'customer' && !profile?.isCustomer) return;
    get().setMode(next);
  },
  hydrate: () => {
    const raw = storage.getString(persistKeys.mode);
    if (raw === 'customer' || raw === 'freelancer') set({ mode: raw });
  },
}));

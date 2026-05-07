import type { AuthTokens } from '@jasabersih/shared-types';
import { create } from 'zustand';

import { persistKeys, storage } from '../lib/storage';

type State = {
  tokens: AuthTokens | null;
  hydrated: boolean;
  setTokens: (t: AuthTokens | null) => void;
  refresh: () => Promise<void>;
  logout: () => void;
  hydrate: () => void;
};

export const useAuthStore = create<State>((set, get) => ({
  tokens: null,
  hydrated: false,
  setTokens: (t) => {
    if (t) storage.set(persistKeys.authTokens, JSON.stringify(t));
    else storage.delete(persistKeys.authTokens);
    set({ tokens: t });
  },
  refresh: async () => {
    const current = get().tokens;
    if (!current) throw new Error('NO_REFRESH_TOKEN');
    // lazy import to avoid cycle
    const { api } = await import('../lib/api');
    const res = await api.post<{ data: AuthTokens }>('/auth/refresh', {
      refreshToken: current.refreshToken,
    });
    get().setTokens(res.data.data);
  },
  logout: () => get().setTokens(null),
  hydrate: () => {
    const raw = storage.getString(persistKeys.authTokens);
    if (raw) {
      try {
        set({ tokens: JSON.parse(raw) as AuthTokens });
      } catch {
        storage.delete(persistKeys.authTokens);
      }
    }
    set({ hydrated: true });
  },
}));

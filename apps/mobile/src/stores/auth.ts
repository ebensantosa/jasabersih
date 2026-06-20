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
  logout: () => {
    // Unregister push token DULU sebelum clear tokens - perlu JWT valid.
    void import('../lib/pushSetup').then(async (m) => {
      try { await m.unregisterPushAsync(); } catch {}
    }).catch(() => {});

    // Disconnect socket connections - cegah kebocoran event jobs/chat
    // ke session berikutnya (next user di device sama bisa kena event
    // yg ditujukan ke user lama).
    void Promise.all([
      import('../lib/jobsSocket').then((m) => m.disconnectJobsSocket?.()),
      import('../lib/chatSocket').then((m) => m.disconnectChatSocket?.()),
    ]).catch(() => {});

    get().setTokens(null);
    // Wipe all user-bound caches so next session starts clean.
    void Promise.all([
      import('./mode').then((m) => m.useModeStore.getState().setMode('customer')),
      import('./addresses').then((m) => m.useAddressesStore.getState().clearLocal?.()),
      import('./bookings').then((m) => m.useBookingsStore.getState().clearLocal?.()),
      import('./cleanerWallet').then((m) => m.useCleanerWalletStore.getState().clearLocal?.()),
      import('./cleaner').then((m) => m.useCleanerStore.getState().clearLocal?.()),
      import('./user').then((m) => m.useUserStore.getState().clear()),
      import('./suspended').then((m) => m.useSuspendedStore.getState().clear()),
      import('./cleanerKyc').then((m) => m.useCleanerKycStore.getState().clear()),
      import('./notifications').then((m) => m.useNotifications.getState().clear?.()),
    ]).catch(() => {});
  },
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

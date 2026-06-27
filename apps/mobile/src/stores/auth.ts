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
    // Cek lagi setelah await — user mungkin logout saat request berlangsung.
    // Kalau tokens sudah null (logout), jangan restore.
    if (!get().tokens) throw new Error('NO_REFRESH_TOKEN');
    get().setTokens(res.data.data);
  },
  logout: () => {
    // Snapshot JWT sebelum clear — unregister butuh token valid di header
    // (interceptor tidak override Authorization kalau store sudah null).
    const accessToken = get().tokens?.accessToken;

    // Clear store segera supaya UI langsung ke login screen.
    get().setTokens(null);

    // Unregister push token dengan snapshotted JWT — cegah notif bocor ke device.
    void import('../lib/pushSetup').then(async (m) => {
      try { await m.unregisterPushAsync(accessToken); } catch {}
    }).catch(() => {});

    // Disconnect socket connections - cegah kebocoran event jobs/chat
    // ke session berikutnya (next user di device sama bisa kena event
    // yg ditujukan ke user lama).
    void Promise.all([
      import('../lib/jobsSocket').then((m) => m.disconnectJobsSocket?.()),
      import('../lib/chatSocket').then((m) => m.disconnectChatSocket?.()),
    ]).catch(() => {});
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

import axios, { type AxiosInstance } from 'axios';
import Constants from 'expo-constants';

import { useAuthStore } from '../stores/auth';
import { getDeviceId } from './deviceIdentity';

const baseURL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/v1';

export const api: AxiosInstance = axios.create({ baseURL, timeout: 15_000 });

api.interceptors.request.use(async (req) => {
  const token = useAuthStore.getState().tokens?.accessToken;
  if (token && req.headers) req.headers.Authorization = `Bearer ${token}`;
  if (req.headers) req.headers['x-device-id'] = await getDeviceId();
  return req;
});

// Retry network errors (ECONNREFUSED, ETIMEDOUT, etc.) up to 3x with backoff.
// Happens when API restarts mid-deploy and app already has a pending request.
api.interceptors.response.use(undefined, async (error) => {
  const cfg = error.config as any;
  if (!error.response && cfg && !cfg._retryCount) {
    cfg._retryCount = 0;
  }
  if (!error.response && cfg && cfg._retryCount < 3) {
    cfg._retryCount += 1;
    await new Promise((r) => setTimeout(r, cfg._retryCount * 800));
    return api(cfg);
  }
  return Promise.reject(error);
});

let refreshing: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Network error / timeout (no server response) — jangan logout, ini transient
    if (!error.response) return Promise.reject(error);

    const errorCode = error.response?.data?.error?.code;
    const errorMsg = error.response?.data?.error?.message;

    // Account-level rejection - set global store, root layout akan render overlay <SuspendedOverlay />
    if (error.response?.status === 401 && (errorCode === 'ACCOUNT_SUSPENDED' || errorCode === 'ACCOUNT_BANNED' || errorCode === 'ACCOUNT_DELETED')) {
      const kind = errorCode === 'ACCOUNT_BANNED' ? 'banned' : errorCode === 'ACCOUNT_DELETED' ? 'deleted' : 'suspended';
      const details = error.response?.data?.error?.details ?? {};
      const { useSuspendedStore } = await import('../stores/suspended');
      useSuspendedStore.getState().set({
        kind,
        reason: details.reason ?? errorMsg ?? null,
        until: details.suspendedUntil ?? null,
      });
      return Promise.reject(error);
    }

    // Jangan intercept 401 dari endpoint refresh itu sendiri — hindari recursive refresh
    const isRefreshEndpoint = typeof original?.url === 'string' && original.url.includes('/auth/refresh');

    if (error.response?.status === 401 && !original?._retry && !isRefreshEndpoint) {
      const hasTokens = !!useAuthStore.getState().tokens;
      // No tokens = anonymous user, don't try refresh - caller handles "not logged in"
      if (!hasTokens) return Promise.reject(error);
      original._retry = true;
      try {
        if (!refreshing) refreshing = useAuthStore.getState().refresh();
        await refreshing;
        refreshing = null;
        return api(original);
      } catch (refreshErr) {
        refreshing = null;
        // Hanya logout kalau server explicitly menolak token (401) — bukan network/timeout error
        const tokenRejected = axios.isAxiosError(refreshErr) && refreshErr.response?.status === 401;
        if (tokenRejected) {
          // logout() now wipes addresses/bookings/wallet/cleaner/user caches too
          useAuthStore.getState().logout();
        }
      }
    }
    return Promise.reject(error);
  },
);

import axios, { type AxiosInstance } from 'axios';
import Constants from 'expo-constants';

import { useAuthStore } from '../stores/auth';

const baseURL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/v1';

export const api: AxiosInstance = axios.create({ baseURL, timeout: 15_000 });

api.interceptors.request.use((req) => {
  const token = useAuthStore.getState().tokens?.accessToken;
  if (token && req.headers) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

let refreshing: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original?._retry) {
      const hasTokens = !!useAuthStore.getState().tokens;
      // No tokens = anonymous user, don't try refresh — caller handles "not logged in"
      if (!hasTokens) return Promise.reject(error);
      original._retry = true;
      try {
        if (!refreshing) refreshing = useAuthStore.getState().refresh();
        await refreshing;
        refreshing = null;
        return api(original);
      } catch {
        refreshing = null;
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  },
);

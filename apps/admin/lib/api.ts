'use client';

import { ApiOffline, createClient } from '@jasabersih/api-client';

import { getSession } from './auth';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/v1';

export const api = createClient({
  baseUrl,
  getAccessToken: () => getSession()?.token ?? null,
  onUnauthorized: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('admin.auth');
      window.location.href = '/login';
    }
  },
});

/** Try API call, fallback ke mock kalau backend offline */
export async function tryApi<T>(call: () => Promise<T>, mockFallback: () => T): Promise<{
  data: T;
  source: 'api' | 'mock';
}> {
  try {
    const data = await call();
    return { data, source: 'api' };
  } catch (e) {
    if (e instanceof ApiOffline) {
      // eslint-disable-next-line no-console
      console.warn('[api] offline → using mock data');
      return { data: mockFallback(), source: 'mock' };
    }
    throw e;
  }
}

export { ApiOffline };

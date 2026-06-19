import Constants from 'expo-constants';

import type { AuthTokens } from '@jasabersih/shared-types';
import { getDeviceId } from './deviceIdentity';
import { api } from './api';

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/v1';

export type AuthResult = {
  tokens: AuthTokens;
  user: { email: string; name: string; mode: 'customer' | 'freelancer'; kycStatus?: string | null };
};

/** Login real ke backend NestJS - no mock. */
export async function login(email: string, password: string): Promise<AuthResult> {
  const deviceId = await getDeviceId();
  let tokens: AuthTokens;
  try {
    const res = await api.post<{ data: AuthTokens }>(
      '/auth/login',
      { phone: email, password },
      {
        timeout: 20_000,
        headers: { 'x-device-id': deviceId },
      },
    );
    tokens = res.data.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.error?.message
      ?? error?.message
      ?? 'Tidak bisa terhubung ke server';
    throw new Error(message);
  }

  // Fetch real profile using the freshly-issued access token
  let user: AuthResult['user'] = { email, name: email, mode: 'customer', kycStatus: null };
  try {
    const me = await api.get('/auth/me', {
      timeout: 12_000,
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const p = me.data?.data ?? me.data;
    if (p) {
      user = {
        email: p.email ?? email,
        name: p.name ?? p.phone ?? email,
        mode: p.mode === 'freelancer' ? 'freelancer' : 'customer',
        kycStatus: null,
      };

      if (user.mode === 'freelancer') {
        try {
          const cleanerProfile = await api.get('/cleaner/profile', {
            timeout: 12_000,
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
          const cp = cleanerProfile.data?.data ?? cleanerProfile.data;
          user.kycStatus = cp?.kycStatus ?? null;
        } catch {
          // fall back to gate/overlay when profile fetch is unavailable
        }
      }
    }
  } catch { /* ignore - fall back to placeholder */ }

  return { tokens, user };
}

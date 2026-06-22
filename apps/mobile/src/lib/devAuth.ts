import Constants from 'expo-constants';

import type { AuthTokens } from '@jasabersih/shared-types';
import { getDeviceId } from './deviceIdentity';
import { api } from './api';

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/v1';

export type AuthResult = {
  tokens: AuthTokens;
  user: {
    email: string;
    name: string;
    mode: 'customer' | 'freelancer';
    isCustomer: boolean;
    isFreelancer: boolean;
    kycStatus?: string | null;
  };
};

/** Login real ke backend NestJS - no mock. */
export async function login(email: string, password: string, loginAs: 'customer' | 'freelancer' = 'customer'): Promise<AuthResult> {
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
    const body = error?.response?.data?.error ?? error?.response?.data;
    const message = body?.message ?? error?.message ?? 'Tidak bisa terhubung ke server';
    const err = new Error(message) as Error & { details?: Record<string, unknown> };
    if (body?.details) err.details = body.details;
    throw err;
  }

  // Default: assume loginAs role (safe fallback if /auth/me fails)
  let user: AuthResult['user'] = {
    email,
    name: email,
    mode: loginAs,
    isCustomer: loginAs === 'customer',
    isFreelancer: loginAs === 'freelancer',
    kycStatus: null,
  };

  try {
    const me = await api.get('/auth/me', {
      timeout: 12_000,
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const p = me.data?.data ?? me.data;
    if (p) {
      const isCustomer: boolean = !!p.isCustomer;
      const isFreelancer: boolean = !!p.isFreelancer;

      // Resolve mode: if user has both roles, honour their loginAs choice.
      // If single-role, use whatever role they have (role-mismatch check in login.tsx).
      let resolvedMode: 'customer' | 'freelancer';
      if (isCustomer && isFreelancer) {
        resolvedMode = loginAs;
      } else if (isFreelancer) {
        resolvedMode = 'freelancer';
      } else {
        resolvedMode = 'customer';
      }

      user = {
        email: p.email ?? email,
        name: p.name ?? p.phone ?? email,
        mode: resolvedMode,
        isCustomer,
        isFreelancer,
        kycStatus: null,
      };

      if (resolvedMode === 'freelancer') {
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
  } catch { /* ignore - fall back to loginAs default */ }

  return { tokens, user };
}

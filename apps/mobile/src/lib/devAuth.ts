import Constants from 'expo-constants';

import type { AuthTokens } from '@jasabersih/shared-types';

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/v1';

export type AuthResult = {
  tokens: AuthTokens;
  user: { email: string; name: string; mode: 'customer' | 'freelancer' };
};

/** Login real ke backend NestJS — no mock. */
export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: email, password }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error?.message ?? `Login gagal (${res.status})`);
  }
  const json = await res.json();
  const tokens = json.data as AuthTokens;
  return {
    tokens,
    user: { email, name: email, mode: 'customer' },
  };
}

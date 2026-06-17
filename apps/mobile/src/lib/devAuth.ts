import Constants from 'expo-constants';

import type { AuthTokens } from '@jasabersih/shared-types';
import { getDeviceId } from './deviceIdentity';

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/v1';

export type AuthResult = {
  tokens: AuthTokens;
  user: { email: string; name: string; mode: 'customer' | 'freelancer' };
};

// AbortSignal.timeout() not in Hermes - pakai manual controller.
function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** Login real ke backend NestJS - no mock. */
export async function login(email: string, password: string): Promise<AuthResult> {
  const deviceId = await getDeviceId();
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
    body: JSON.stringify({ phone: email, password }),
    signal: timeoutSignal(10_000),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error?.message ?? `Login gagal (${res.status})`);
  }
  const json = await res.json();
  const tokens = json.data as AuthTokens;

  // Fetch real profile using the freshly-issued access token
  let user: AuthResult['user'] = { email, name: email, mode: 'customer' };
  try {
    const me = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      signal: timeoutSignal(8_000),
    });
    if (me.ok) {
      const meJson = await me.json();
      const p = meJson.data ?? meJson;
      user = {
        email: p.email ?? email,
        name: p.name ?? p.phone ?? email,
        mode: p.mode === 'freelancer' ? 'freelancer' : 'customer',
      };
    }
  } catch { /* ignore - fall back to placeholder */ }

  return { tokens, user };
}

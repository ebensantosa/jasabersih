'use client';

const KEY = 'admin.auth';

export type AdminSession = {
  email: string;
  name: string;
  role: string;
  token: string;
};

export function getSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function saveSession(s: AdminSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}

export async function loginAdmin(
  email: string,
  password: string,
  apiBase: string,
): Promise<AdminSession> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/auth/admin-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error('Tidak bisa konek ke backend. Pastikan API jalan di ' + apiBase);
  }
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error?.message ?? `Login gagal (${res.status})`);
  }
  const json = await res.json();
  const data = json.data;
  const session: AdminSession = {
    email: data.admin.email,
    name: data.admin.name,
    role: data.admin.role,
    token: data.accessToken,
  };
  saveSession(session);
  return session;
}

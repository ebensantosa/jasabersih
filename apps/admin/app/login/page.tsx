'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react';

import { loginAdmin } from '../../lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/v1';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<{ logoUrl?: string; appName?: string }>({});

  // Pull brand logo + name from public /app/content (no auth) so login mirrors mobile.
  useEffect(() => {
    fetch(`${API_BASE}/app/content`)
      .then((r) => r.json())
      .then((j) => {
        const cfg = j?.data?.config ?? j?.config ?? {};
        setBrand({
          logoUrl: typeof cfg['brand.logo_url'] === 'string' ? cfg['brand.logo_url'] : undefined,
          appName: typeof cfg['brand.app_name'] === 'string' ? cfg['brand.app_name'] : undefined,
        });
      })
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginAdmin(email, password, API_BASE);
      router.replace('/admin');
    } catch (e) {
      setError((e as Error).message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="logo" className="mx-auto h-16 w-16 rounded-2xl object-contain" />
          ) : (
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
              <Sparkles size={24} />
            </div>
          )}
          <h1 className="mt-4 text-2xl font-bold text-slate-900">{brand.appName ?? 'JasaBersih'} Admin</h1>
          <p className="text-sm text-slate-500">Internal dashboard</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-white p-6 shadow-lg">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Email
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 focus-within:border-primary">
              <Mail size={16} className="text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@jasabersih.com"
                className="flex-1 text-sm outline-none"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 focus-within:border-primary">
              <Lock size={16} className="text-slate-400" />
              <input
                type={showPwd ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 text-sm outline-none"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="text-slate-400"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? 'Memproses…' : 'Sign In'}
          </button>
        </form>

      </div>
    </main>
  );
}

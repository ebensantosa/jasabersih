'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  BadgeCheck,
  CalendarCheck,
  Clock,
  CreditCard,
  FileText,
  MapPinned,
  Sparkles,
  LogOut,
  Gift,
  Megaphone,
  MessageSquare,
  Send,
  Mail,
  Palette,
  Settings,
  ShieldAlert,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';

import { type AdminSession, clearSession, getSession } from '../../lib/auth';
import { UiProvider } from '../../components/ui';

const NAV = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/kyc', label: 'KYC Cleaner', icon: BadgeCheck, badge: 'kycPending' as const },
  { href: '/admin/bookings', label: 'Pesanan', icon: CalendarCheck, badge: 'bookingsNeedAssign' as const },
  { href: '/admin/wallet', label: 'Wallet & Withdrawal', icon: Wallet, badge: 'withdrawalsPending' as const },
  { href: '/admin/payment-methods', label: 'Metode Pembayaran', icon: CreditCard },
  { href: '/admin/disputes', label: 'Disputes', icon: ShieldAlert, badge: 'disputesOpen' as const },
  { href: '/admin/fraud', label: 'Fraud Signals', icon: ShieldAlert },
  { href: '/admin/fraud-reports', label: 'Fraud Reports', icon: ShieldAlert, badge: 'fraudReports' as const },
  { href: '/admin/vouchers', label: 'Vouchers', icon: Tag },
  { href: '/admin/referrals', label: 'Referrals', icon: Gift },
  { href: '/admin/chat', label: 'Chat Audit', icon: MessageSquare },
  { href: '/admin/services', label: 'Layanan', icon: Sparkles },
  { href: '/admin/hourly-tiers', label: 'Tarif Per-Jam', icon: Clock },
  { href: '/admin/subscription-tiers', label: 'Tier Berlangganan', icon: Clock },
  { href: '/admin/areas', label: 'Area Layanan', icon: MapPinned, badge: 'cityRequests' as const },
  { href: '/admin/cleaner-areas', label: 'Permintaan Area Cleaner', icon: MapPinned },
  { href: '/admin/content', label: 'Content / CMS', icon: FileText },
  { href: '/admin/popups', label: 'Pop-up Promo', icon: Megaphone },
  { href: '/admin/broadcast', label: 'Broadcast Push', icon: Send },
  { href: '/admin/email', label: 'Email (Resend)', icon: Mail },
  { href: '/admin/app-settings', label: 'App Settings', icon: Palette },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null | 'loading'>('loading');
  const [cityRequestsCount, setCityRequestsCount] = useState(0);
  const [inboxCounts, setInboxCounts] = useState<Record<string, number>>({});
  const [brand, setBrand] = useState<{ logoUrl?: string; appName?: string }>({});

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/v1';
    fetch(`${base}/app/content`).then((r) => r.json()).then((j) => {
      const cfg = j?.data?.config ?? j?.config ?? {};
      setBrand({
        logoUrl: typeof cfg['brand.logo_url'] === 'string' ? cfg['brand.logo_url'] : undefined,
        appName: typeof cfg['brand.app_name'] === 'string' ? cfg['brand.app_name'] : undefined,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
    } else {
      setSession(s);
    }
  }, [router]);

  // Poll city request demand for sidebar badge — every 60s, lightweight.
  useEffect(() => {
    if (session === 'loading' || !session) return;
    let cancelled = false;
    async function fetchCount() {
      try {
        const { api } = await import('../../lib/api');
        const rows: any[] = await api.admin.listCityRequests();
        if (!cancelled) setCityRequestsCount(rows.reduce((a, r) => a + (r.requestCount ?? 0), 0));
      } catch {/* silent */}
    }
    void fetchCount();
    const t = setInterval(fetchCount, 60_000);

    // Poll inbox counts juga
    async function fetchInbox() {
      try {
        const { api } = await import('../../lib/api');
        const r = await api.admin.inboxCounts();
        if (!cancelled) setInboxCounts(r as any);
      } catch {/* silent */}
    }
    void fetchInbox();
    const t2 = setInterval(fetchInbox, 60_000);
    return () => { cancelled = true; clearInterval(t); clearInterval(t2); };
  }, [session]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (session === 'loading' || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <UiProvider>
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r bg-white p-4">
        <div className="mb-6 flex items-center gap-2">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt="logo" className="h-9 w-9 rounded-lg object-contain" />
          )}
          <div>
            <div className="text-lg font-bold text-slate-900">{brand.appName ?? 'JasaBersih'}</div>
            <div className="text-[11px] text-slate-500">Admin Dashboard</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const badgeCount = item.badge === 'cityRequests'
              ? cityRequestsCount
              : (item.badge ? Number(inboxCounts[item.badge] ?? 0) : 0);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100"
              >
                <Icon size={16} />
                <span className="flex-1">{item.label}</span>
                {badgeCount > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="mb-2 px-2">
            <div className="text-xs font-semibold text-slate-900">{session.name}</div>
            <div className="text-[11px] text-slate-500">{session.email}</div>
            <div className="mt-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
              {session.role}
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
    </UiProvider>
  );
}

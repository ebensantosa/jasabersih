'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  BadgeCheck,
  CalendarCheck,
  FileText,
  LogOut,
  MessageSquare,
  Settings,
  ShieldAlert,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';

import { type AdminSession, clearSession, getSession } from '../../lib/auth';

const NAV = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/kyc', label: 'KYC Cleaner', icon: BadgeCheck },
  { href: '/admin/bookings', label: 'Pesanan', icon: CalendarCheck },
  { href: '/admin/wallet', label: 'Wallet & Withdrawal', icon: Wallet },
  { href: '/admin/disputes', label: 'Disputes', icon: ShieldAlert },
  { href: '/admin/fraud', label: 'Fraud Signals', icon: ShieldAlert },
  { href: '/admin/vouchers', label: 'Vouchers & Referral', icon: Tag },
  { href: '/admin/chat', label: 'Chat Audit', icon: MessageSquare },
  { href: '/admin/content', label: 'Content / CMS', icon: FileText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null | 'loading'>('loading');

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
    } else {
      setSession(s);
    }
  }, [router]);

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
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r bg-white p-4">
        <div className="mb-6">
          <div className="text-lg font-bold text-slate-900">JasaBersih</div>
          <div className="text-[11px] text-slate-500">Admin Dashboard</div>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100"
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
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
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Loader2,
  TrendingUp,
  Users,
  Wallet,
  WifiOff,
} from 'lucide-react';

import { ApiOffline, api } from '../../lib/api';
import { STATUS_BADGE, type Order, formatRupiah } from '../../lib/mock';

export default function AdminOverview() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [cleaners, setCleaners] = useState<{ id: string; status?: string }[]>([]);
  const [users, setUsers] = useState<{ id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setOffline(false);
    try {
      const [o, c, u] = await Promise.all([
        api.admin.listBookings() as Promise<Order[]>,
        api.admin.listCleaners() as Promise<{ id: string; status?: string }[]>,
        api.admin.listUsers() as Promise<{ id: string }[]>,
      ]);
      setOrders(o);
      setCleaners(c);
      setUsers(u);
    } catch (e) {
      if (e instanceof ApiOffline) setOffline(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 className="animate-spin" size={16} /> Memuat…
      </div>
    );
  }

  if (offline) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-2 text-amber-900">
          <WifiOff size={18} />
          <span className="font-bold">Backend tidak terkoneksi</span>
        </div>
        <p className="mt-2 text-xs text-amber-900">
          Pastikan API jalan: <code>npm run dev -w @jasabersih/api</code>
        </p>
        <button
          onClick={load}
          className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const completed = orders.filter((o) => o.status === 'completed');
  const inProgress = orders.filter(
    (o) => o.status === 'matched' || o.status === 'on_the_way' || o.status === 'in_progress',
  );
  const searching = orders.filter((o) => o.status === 'searching');
  const disputed = orders.filter((o) => o.status === 'disputed');
  const gmv = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const activeCleaners = cleaners.filter((c) => c.status === 'active' || c.status === 'approved');
  const pendingKyc = cleaners.filter((c) => c.status === 'pending');

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
      <p className="text-sm text-slate-500">Ringkasan operasional</p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          icon={Wallet}
          color="emerald"
          label="GMV"
          value={formatRupiah(gmv)}
          sub={`${orders.length} order`}
        />
        <KpiCard
          icon={CheckCircle2}
          color="blue"
          label="Selesai"
          value={String(completed.length)}
          sub={`${inProgress.length} masih jalan`}
        />
        <KpiCard
          icon={Users}
          color="amber"
          label="Cleaner Aktif"
          value={String(activeCleaners.length)}
          sub={`${pendingKyc.length} pending KYC`}
        />
        <KpiCard
          icon={TrendingUp}
          color="purple"
          label="Total Customer"
          value={String(users.length)}
          sub=""
        />
      </div>

      {(disputed.length > 0 || searching.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {disputed.length > 0 && (
            <AlertCard
              icon={AlertTriangle}
              color="red"
              title={`${disputed.length} sengketa aktif`}
              desc="Butuh resolusi admin"
              href="/admin/bookings"
            />
          )}
          {searching.length > 0 && (
            <AlertCard
              icon={Clock}
              color="amber"
              title={`${searching.length} order belum dapat cleaner`}
              desc="Pertimbangkan assign manual"
              href="/admin/bookings"
            />
          )}
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Order Terbaru</h2>
          <Link href="/admin/bookings" className="text-sm font-semibold text-primary">
            Lihat semua →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {orders.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Belum ada order. Buat booking dari mobile app dulu.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Cleaner</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {orders.slice(0, 6).map((o) => {
                  const s = STATUS_BADGE[o.status];
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">{String(o.id).slice(0, 8)}</td>
                      <td className="px-4 py-3">{o.customerName ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {o.cleanerName ?? <span className="text-amber-700">—</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold">{formatRupiah(o.total ?? 0)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ backgroundColor: s?.bg, color: s?.fg }}
                        >
                          {s?.label ?? o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const COLORS: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
  red: { bg: 'bg-red-50', text: 'text-red-700' },
};

function KpiCard({
  icon: Icon,
  color,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: keyof typeof COLORS;
  label: string;
  value: string;
  sub: string;
}) {
  const c = COLORS[color] ?? COLORS.blue!;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon size={18} className={c.text} />
        </div>
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function AlertCard({
  icon: Icon,
  color,
  title,
  desc,
  href,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: keyof typeof COLORS;
  title: string;
  desc: string;
  href: string;
}) {
  const c = COLORS[color] ?? COLORS.amber!;
  return (
    <Link href={href} className={`block rounded-xl border-2 p-4 ${c.bg} border-current ${c.text}`}>
      <div className="flex items-center gap-3">
        <Icon size={20} className={c.text} />
        <div className="flex-1">
          <div className="font-bold">{title}</div>
          <div className="text-xs">{desc} →</div>
        </div>
      </div>
    </Link>
  );
}

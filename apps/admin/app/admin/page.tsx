'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, CalendarCheck, ChevronRight, MapPin,
  MessageSquare, ShieldAlert, Star, TrendingUp, Users, Wallet,
} from 'lucide-react';

import { api } from '../../lib/api';
import { useToast } from '../../components/ui';

type Overview = {
  today: { orders: number; gmv: number; revenue: number };
  week: { orders: number; gmv: number; revenue: number };
  month: { orders: number; gmv: number; revenue: number };
  bookingByStatus: { status: string; count: number }[];
  last7Days: { day: string; orders: number; gmv: number }[];
  users: { total: number; active: number; suspended: number; banned: number; new_30d: number };
  cleaners: { total: number; approved: number; pending: number; under_review: number; rejected: number };
  pending: { kyc_pending: number; withdrawal_pending: number; disputes_open: number; blocked_chat_24h: number; fraud_strikes_24h: number };
  topCleaners: { id: string; name: string | null; phone: string; tier: string | null; ratingAvg: number | null; ratingCount: number | null; totalJobsDone: number }[];
  topServices: { name: string; orders: number; gmv: number }[];
  geoBreakdown: { city: string; orders: number; gmv: number }[];
  funnel30d: { totalOrders: number; completed: number; cancelled: number; completionRate: number; cancelRate: number };
};

function fmtRp(n: number | string | null | undefined): string {
  if (n == null) return 'Rp 0';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

export default function AdminOverview(): React.ReactElement {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setData(await api.admin.analyticsOverview()); }
    catch (e: any) { toast.error(e?.message ?? 'Gagal load analytics'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <div className="py-20 text-center text-sm text-slate-500">Memuat analyticsâ€¦</div>;
  if (!data) return <div className="py-20 text-center text-sm text-slate-500">Data tidak tersedia.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500">Realtime metrics â€” refresh untuk update terbaru.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <PendingCard icon={BadgeCheck} label="KYC Pending" count={Number(data.pending.kyc_pending)} href="/admin/kyc" color="amber" />
        <PendingCard icon={Wallet} label="Withdrawal" count={Number(data.pending.withdrawal_pending)} href="/admin/wallet" color="blue" />
        <PendingCard icon={ShieldAlert} label="Disputes Open" count={Number(data.pending.disputes_open)} href="/admin/disputes" color="red" />
        <PendingCard icon={MessageSquare} label="Blocked Chat 24h" count={Number(data.pending.blocked_chat_24h)} href="/admin/chat" color="purple" />
        <PendingCard icon={AlertTriangle} label="Fraud Strikes 24h" count={Number(data.pending.fraud_strikes_24h)} href="/admin/fraud" color="red" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <GmvCard label="Hari Ini" orders={Number(data.today.orders)} gmv={Number(data.today.gmv)} revenue={Number(data.today.revenue)} />
        <GmvCard label="7 Hari" orders={Number(data.week.orders)} gmv={Number(data.week.gmv)} revenue={Number(data.week.revenue)} />
        <GmvCard label="30 Hari" orders={Number(data.month.orders)} gmv={Number(data.month.gmv)} revenue={Number(data.month.revenue)} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-white p-4 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Trend 7 Hari Terakhir</h2>
            <TrendingUp size={16} className="text-slate-500" />
          </div>
          <TrendBars data={data.last7Days} />
        </div>

        <div className="rounded-md border bg-white p-4">
          <h2 className="mb-3 font-semibold">Funnel (30 hari)</h2>
          <FunnelRow label="Total Order" value={Number(data.funnel30d.totalOrders)} />
          <FunnelRow label="Selesai" value={Number(data.funnel30d.completed)} sub={`${data.funnel30d.completionRate}%`} positive />
          <FunnelRow label="Dibatalkan" value={Number(data.funnel30d.cancelled)} sub={`${data.funnel30d.cancelRate}%`} negative />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><Users size={16} /> Customer</h2>
            <Link href="/admin/users" className="text-xs text-blue-700 hover:underline">Lihat semua â†’</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Total" value={Number(data.users.total)} />
            <Stat label="Baru 30 hari" value={Number(data.users.new_30d)} positive />
            <Stat label="Suspended" value={Number(data.users.suspended)} />
            <Stat label="Banned" value={Number(data.users.banned)} negative />
          </div>
        </div>

        <div className="rounded-md border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><BadgeCheck size={16} /> Cleaner</h2>
            <Link href="/admin/kyc" className="text-xs text-blue-700 hover:underline">KYC review â†’</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Approved" value={Number(data.cleaners.approved)} positive />
            <Stat label="Under Review" value={Number(data.cleaners.under_review)} />
            <Stat label="Pending" value={Number(data.cleaners.pending)} />
            <Stat label="Rejected" value={Number(data.cleaners.rejected)} negative />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-white p-4">
          <h2 className="mb-3 font-semibold flex items-center gap-2"><Star size={16} /> Top Cleaner</h2>
          {data.topCleaners.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Belum ada data.</p>
          ) : (
            <div className="space-y-2">
              {data.topCleaners.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{c.name ?? 'â€”'}</div>
                    <div className="text-[11px] text-slate-500">{c.phone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold">â­ {Number(c.ratingAvg ?? 0).toFixed(2)}</div>
                    <div className="text-[10px] text-slate-500">{Number(c.totalJobsDone)} job</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border bg-white p-4">
          <h2 className="mb-3 font-semibold flex items-center gap-2"><CalendarCheck size={16} /> Top Layanan (30d)</h2>
          {data.topServices.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Belum ada data.</p>
          ) : (
            <div className="space-y-2">
              {data.topServices.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-sm">{s.name}</span>
                  <div className="text-right">
                    <div className="text-xs font-bold">{Number(s.orders)} order</div>
                    <div className="text-[10px] text-slate-500">{fmtRp(s.gmv)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border bg-white p-4">
          <h2 className="mb-3 font-semibold flex items-center gap-2"><MapPin size={16} /> Geo (30d)</h2>
          {data.geoBreakdown.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Belum ada data.</p>
          ) : (
            <div className="space-y-2">
              {data.geoBreakdown.map((g) => (
                <div key={g.city} className="flex items-center justify-between">
                  <span className="truncate text-sm">{g.city}</span>
                  <div className="text-right">
                    <div className="text-xs font-bold">{Number(g.orders)} order</div>
                    <div className="text-[10px] text-slate-500">{fmtRp(g.gmv)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PendingCard({ icon: Icon, label, count, href, color }: { icon: any; label: string; count: number; href: string; color: 'amber' | 'blue' | 'red' | 'purple' }): React.ReactElement {
  const cls = {
    amber: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200', icon: 'text-amber-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-blue-200', icon: 'text-blue-700' },
    red: { bg: 'bg-red-50', text: 'text-red-900', border: 'border-red-200', icon: 'text-red-700' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-200', icon: 'text-purple-700' },
  }[color];
  return (
    <Link href={href} className={`group flex items-center gap-3 rounded-md border ${cls.border} ${cls.bg} p-3 hover:shadow-sm`}>
      <Icon size={20} className={cls.icon} />
      <div className="flex-1">
        <div className={`text-[10px] font-semibold uppercase ${cls.text} opacity-70`}>{label}</div>
        <div className={`text-xl font-bold ${cls.text}`}>{count}</div>
      </div>
      <ChevronRight size={14} className={`${cls.icon} opacity-40 group-hover:opacity-100`} />
    </Link>
  );
}

function GmvCard({ label, orders, gmv, revenue }: { label: string; orders: number; gmv: number; revenue: number }): React.ReactElement {
  return (
    <div className="rounded-md border bg-white p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{fmtRp(gmv)}</div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
        <span><b>{orders}</b> order</span>
        <span>â€¢</span>
        <span>Take rate: <b>{fmtRp(revenue)}</b></span>
      </div>
    </div>
  );
}

function TrendBars({ data }: { data: { day: string; orders: number; gmv: number }[] }): React.ReactElement {
  if (!data || data.length === 0) return <p className="py-6 text-center text-xs text-slate-500">Belum ada data 7 hari terakhir.</p>;
  const max = Math.max(...data.map((d) => Number(d.gmv)), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: 120 }}>
      {data.map((d, i) => {
        const pct = (Number(d.gmv) / max) * 100;
        return (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="w-full rounded-t bg-blue-600" style={{ height: `${pct}%`, minHeight: 2 }} />
            <div className="text-[10px] text-slate-500">{new Date(d.day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</div>
            <div className="text-[10px] font-bold text-slate-900">{Number(d.orders)}</div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelRow({ label, value, sub, positive, negative }: { label: string; value: number; sub?: string; positive?: boolean; negative?: boolean }): React.ReactElement {
  const color = positive ? 'text-green-700' : negative ? 'text-red-700' : 'text-slate-900';
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-bold ${color}`}>{value}</span>
        {sub && <span className={`ml-2 text-xs ${color}`}>({sub})</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }): React.ReactElement {
  const color = positive ? 'text-green-700' : negative ? 'text-red-700' : 'text-slate-900';
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

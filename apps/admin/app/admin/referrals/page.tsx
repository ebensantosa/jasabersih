'use client';

import { useEffect, useState } from 'react';
import { Gift, Search, Trophy } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, useToast } from '../../../components/ui';

type Stats = { total: number; pending: number; qualified: number; paid: number; totalPaid: number; uniqueCodesGenerated: number };
type Leader = { userId: string; code: string; referrerName: string | null; referrerPhone: string; totalReferrals: number; totalPaid: number };
type Item = {
  id: string;
  referrerName: string | null; referrerPhone: string; referrerCode: string;
  referredName: string | null; referredPhone: string;
  referrerRole: string; referredRole: string;
  status: string; bonusAmount: number | null;
  createdAt: string; qualifiedAt: string | null; paidAt: string | null;
};

function rp(n: number | string | null | undefined): string {
  return 'Rp ' + Number(n ?? 0).toLocaleString('id-ID');
}

export default function ReferralsAdminPage(): React.ReactElement | null {
  const toast = useToast();
  const [tab, setTab] = useState<'overview' | 'leaderboard' | 'all'>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'qualified' | 'paid'>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, l, all] = await Promise.all([
        api.admin.referralStats(),
        api.admin.referralLeaderboard(),
        api.admin.listReferrals({ status: filter === 'all' ? undefined : filter, q: q || undefined }),
      ]);
      setStats(s);
      setLeaders(l);
      setItems(all);
    } catch (e: any) { toast.error(e?.message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [filter]);

  if (loading && !stats) return <div className="py-20 text-center text-sm text-slate-500">Memuatâ€¦</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Referrals</h1>
        <p className="text-sm text-slate-500">Track siapa refer siapa, jumlah teman terajak, & total bonus dibayar.</p>
      </div>

      {stats && (
        <div className="grid gap-3 md:grid-cols-5">
          <StatCard label="Total Referral" value={String(stats.total)} icon={<Gift size={16} />} color="blue" />
          <StatCard label="Pending" value={String(stats.pending)} color="amber" />
          <StatCard label="Qualified + Paid" value={String(stats.qualified + stats.paid)} color="green" />
          <StatCard label="Total Bonus Dibayar" value={rp(stats.totalPaid)} color="green" highlight />
          <StatCard label="Total Kode Generate" value={String(stats.uniqueCodesGenerated)} color="slate" />
        </div>
      )}

      <div className="flex gap-1 border-b">
        {(['overview', 'leaderboard', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}
          >
            {t === 'overview' ? 'Overview' : t === 'leaderboard' ? 'Leaderboard' : 'Semua Referral'}
          </button>
        ))}
      </div>

      {tab === 'overview' && stats && (
        <div className="rounded-md border bg-white p-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Trophy size={16} className="text-amber-600" /> Top 5 Referrer</h2>
          {leaders.slice(0, 5).map((l, i) => (
            <div key={l.userId} className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-t-0 first:pt-0">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</div>
              <div className="flex-1">
                <div className="text-sm font-medium">{l.referrerName ?? 'â€”'}</div>
                <div className="text-[11px] text-slate-500">{l.referrerPhone}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-blue-700">{l.code}</div>
                <div className="text-xs">
                  <span className="font-bold">{Number(l.totalReferrals)}</span> teman Â·{' '}
                  <span className="font-bold text-green-700">{rp(l.totalPaid)}</span>
                </div>
              </div>
            </div>
          ))}
          {leaders.length === 0 && <p className="py-6 text-center text-xs text-slate-500">Belum ada referral.</p>}
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 w-12">#</th>
                <th className="px-4 py-2">Referrer</th>
                <th className="px-4 py-2">Kode</th>
                <th className="px-4 py-2 text-right">Total Teman</th>
                <th className="px-4 py-2 text-right">Total Bonus</th>
              </tr>
            </thead>
            <tbody>
              {leaders.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Belum ada data.</td></tr>
              ) : leaders.map((l, i) => (
                <tr key={l.userId} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2 font-bold">{i + 1}</td>
                  <td className="px-4 py-2"><div className="font-medium">{l.referrerName ?? 'â€”'}</div><div className="text-xs text-slate-500">{l.referrerPhone}</div></td>
                  <td className="px-4 py-2"><code className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{l.code}</code></td>
                  <td className="px-4 py-2 text-right font-bold">{Number(l.totalReferrals)}</td>
                  <td className="px-4 py-2 text-right font-bold text-green-700">{rp(l.totalPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'all' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
                placeholder="Cari nama / no HP / kodeâ€¦"
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">Semua status</option>
              <option value="pending">Pending</option>
              <option value="qualified">Qualified</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Tanggal</th>
                  <th className="px-4 py-2">Referrer (yg ngajak)</th>
                  <th className="px-4 py-2">Kode</th>
                  <th className="px-4 py-2">Referred (yg pakai)</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Belum ada referral.</td></tr>
                ) : items.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.referrerName ?? 'â€”'}</div>
                      <div className="text-xs text-slate-500">{r.referrerPhone}</div>
                    </td>
                    <td className="px-4 py-2"><code className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{r.referrerCode ?? 'â€”'}</code></td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.referredName ?? 'â€”'}</div>
                      <div className="text-xs text-slate-500">{r.referredPhone}</div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={r.status === 'paid' ? 'green' : r.status === 'qualified' ? 'blue' : r.status === 'pending' ? 'amber' : 'slate'}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-green-700">
                      {r.bonusAmount ? rp(r.bonusAmount) : 'â€”'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color, highlight }: { label: string; value: string; icon?: React.ReactNode; color: 'blue' | 'amber' | 'green' | 'slate'; highlight?: boolean }) {
  const cls = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    slate: 'border-slate-200 bg-white text-slate-900',
  }[color];
  return (
    <div className={`rounded-md border p-4 ${cls} ${highlight ? 'ring-2 ring-green-300' : ''}`}>
      <div className="flex items-center gap-1 text-xs uppercase opacity-70">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

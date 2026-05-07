'use client';

import { useEffect, useState } from 'react';
import { Briefcase, Loader2, Star, User, WifiOff } from 'lucide-react';

import { ApiOffline, api } from '../../../lib/api';
import { formatRupiah } from '../../../lib/mock';

type Tab = 'customer' | 'cleaner';

type CustomerRow = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  joinedAt?: string;
  totalOrders?: number;
};

type CleanerRow = {
  id: string;
  name?: string;
  phone?: string;
  status?: string;
  bringsTools?: boolean;
  rating?: number | string;
  jobsDone?: number | string;
  joinedAt?: string;
  serviceAreas?: unknown;
};

export default function Users() {
  const [tab, setTab] = useState<Tab>('customer');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [cleaners, setCleaners] = useState<CleanerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setOffline(false);
    try {
      const [u, c] = await Promise.all([
        api.admin.listUsers() as Promise<CustomerRow[]>,
        api.admin.listCleaners() as Promise<CleanerRow[]>,
      ]);
      setCustomers(u);
      setCleaners(c);
    } catch (e) {
      if (e instanceof ApiOffline) setOffline(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
      <p className="text-sm text-slate-500">Lihat customer & cleaner, action KYC / suspend</p>

      {offline && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <WifiOff className="text-amber-700" size={20} />
          <div className="flex-1 text-sm text-amber-900">
            Backend tidak terkoneksi — pastikan API running.
          </div>
          <button
            onClick={load}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Coba Lagi
          </button>
        </div>
      )}

      <div className="mt-6 inline-flex rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setTab('customer')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === 'customer' ? 'bg-white text-slate-900 shadow' : 'text-slate-600'
          }`}
        >
          <User size={16} /> Customer ({customers.length})
        </button>
        <button
          onClick={() => setTab('cleaner')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === 'cleaner' ? 'bg-white text-slate-900 shadow' : 'text-slate-600'
          }`}
        >
          <Briefcase size={16} /> Cleaner ({cleaners.length})
        </button>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="animate-spin" size={16} /> Memuat data…
        </div>
      ) : tab === 'customer' ? (
        <CustomerTable rows={customers} />
      ) : (
        <CleanerTable rows={cleaners} onAction={load} />
      )}
    </div>
  );
}

function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Belum ada customer terdaftar.
      </div>
    );
  }
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Kontak</th>
            <th className="px-4 py-3">Total Order</th>
            <th className="px-4 py-3">Bergabung</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs">{String(c.id).slice(0, 8)}</td>
              <td className="px-4 py-3 font-medium">{c.name ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">
                <div>{c.email ?? '—'}</div>
                <div className="text-[11px] text-slate-500">{c.phone}</div>
              </td>
              <td className="px-4 py-3 font-semibold">{Number(c.totalOrders ?? 0)}</td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {c.joinedAt ? new Date(c.joinedAt).toLocaleDateString('id-ID') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CleanerTable({ rows, onAction }: { rows: CleanerRow[]; onAction: () => void }) {
  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Belum ada cleaner terdaftar.
      </div>
    );
  }
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Mode</th>
            <th className="px-4 py-3">Rating</th>
            <th className="px-4 py-3">Job Done</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs">{String(c.id).slice(0, 8)}</td>
              <td className="px-4 py-3">
                <div className="font-medium">{c.name ?? '—'}</div>
                <div className="text-[11px] text-slate-500">{c.phone}</div>
              </td>
              <td className="px-4 py-3 text-xs">
                {c.bringsTools ? '🛠️ Bawa Alat' : 'Tanpa Alat'}
              </td>
              <td className="px-4 py-3">
                {Number(c.rating ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Star size={12} className="fill-amber-500 text-amber-500" />
                    {Number(c.rating).toFixed(1)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 font-semibold">{Number(c.jobsDone ?? 0)}</td>
              <td className="px-4 py-3 text-xs">{c.status ?? 'pending'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

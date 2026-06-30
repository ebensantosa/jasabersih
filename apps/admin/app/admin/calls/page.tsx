'use client';

import { useEffect, useState } from 'react';
import { Phone, PhoneCall, PhoneMissed, RefreshCw } from 'lucide-react';

import { api } from '../../../lib/api';

type CallSession = {
  id: string;
  bookingId: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  endReason: string | null;
  elapsedSec?: number;
  initiatorName: string | null;
  recipientName: string | null;
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CallsPage() {
  const [active, setActive] = useState<CallSession[]>([]);
  const [recent, setRecent] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'recent'>('active');
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.admin.callSessions();
      setActive(data.active ?? []);
      setRecent(data.recent ?? []);
    } catch {
      // silent — page still renders with empty state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Auto-refresh setiap 10 detik saat active tab terbuka
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monitor Panggilan</h1>
          <p className="text-sm text-slate-500">Real-time call sessions antara customer &amp; cleaner.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh 10d
          </label>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats pills */}
      <div className="mt-4 flex gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <PhoneCall size={16} className="text-emerald-700" />
          <div>
            <p className="text-xs font-medium text-emerald-600">Aktif Sekarang</p>
            <p className="text-xl font-bold text-emerald-900">{active.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <Phone size={16} className="text-slate-500" />
          <div>
            <p className="text-xs font-medium text-slate-500">50 Terakhir</p>
            <p className="text-xl font-bold text-slate-800">{recent.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <PhoneMissed size={16} className="text-red-600" />
          <div>
            <p className="text-xs font-medium text-red-500">Missed (50 terakhir)</p>
            <p className="text-xl font-bold text-red-800">
              {recent.filter((r) => !r.answeredAt).length}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-slate-200">
        {[
          { k: 'active' as const, l: `Aktif (${active.length})` },
          { k: 'recent' as const, l: `Riwayat (${recent.length})` },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium ${tab === t.k ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'active' && (
          <ActiveCallsTab sessions={active} loading={loading} />
        )}
        {tab === 'recent' && (
          <RecentCallsTab sessions={recent} loading={loading} />
        )}
      </div>
    </div>
  );
}

function ActiveCallsTab({ sessions, loading }: { sessions: CallSession[]; loading: boolean }) {
  if (loading && sessions.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Memuat…</p>;
  }
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
        <PhoneCall size={28} className="mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">Tidak ada panggilan aktif saat ini.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Inisiator</th>
            <th className="px-4 py-3 text-left">Penerima</th>
            <th className="px-4 py-3 text-left">Mulai</th>
            <th className="px-4 py-3 text-left">Durasi</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Booking</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-800">{s.initiatorName ?? '—'}</td>
              <td className="px-4 py-3 text-slate-700">{s.recipientName ?? '—'}</td>
              <td className="px-4 py-3 text-slate-500">{timeAgo(s.startedAt)}</td>
              <td className="px-4 py-3 font-mono text-slate-700">
                {s.elapsedSec != null ? formatDuration(s.elapsedSec) : '—'}
              </td>
              <td className="px-4 py-3">
                {s.answeredAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Tersambung
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    Memanggil…
                  </span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">{s.bookingId.slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentCallsTab({ sessions, loading }: { sessions: CallSession[]; loading: boolean }) {
  if (loading && sessions.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Memuat…</p>;
  }
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
        <Phone size={28} className="mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">Belum ada riwayat panggilan.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Inisiator</th>
            <th className="px-4 py-3 text-left">Penerima</th>
            <th className="px-4 py-3 text-left">Waktu</th>
            <th className="px-4 py-3 text-left">Durasi</th>
            <th className="px-4 py-3 text-left">Hasil</th>
            <th className="px-4 py-3 text-left">Booking</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {sessions.map((s) => {
            const missed = !s.answeredAt;
            return (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{s.initiatorName ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{s.recipientName ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{timeAgo(s.startedAt)}</td>
                <td className="px-4 py-3 font-mono text-slate-700">
                  {s.durationSec != null && s.durationSec > 0 ? formatDuration(s.durationSec) : '—'}
                </td>
                <td className="px-4 py-3">
                  {missed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                      <PhoneMissed size={10} />
                      Tidak diangkat
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      <Phone size={10} />
                      {s.endReason === 'max_duration' ? 'Batas waktu' : 'Selesai'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{s.bookingId.slice(0, 8)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Play, Trash2, Flag } from 'lucide-react';

import { api } from '../../../lib/api';

export default function FraudPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.fraudSignals(200)); } catch (e: any) { alert(e?.message); setList([]); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function runDetection() {
    if (!confirm('Jalankan deteksi fraud sekarang? (cek cancel rate, refund rate, shared device, off-platform chat)')) return;
    setRunning(true);
    try {
      const r = await api.admin.fraudRunDetection();
      alert(`Deteksi selesai:\n- High cancel cleaner: ${r.results.highCancelRateCleaners}\n- High refund customer: ${r.results.highRefundRateCustomers}\n- Shared device: ${r.results.sharedDevices}\n- Off-platform chat: ${r.results.offPlatformChats}`);
      void load();
    } catch (e: any) { alert(e?.message); } finally { setRunning(false); }
  }

  async function dismiss(id: string) {
    const reason = prompt('Alasan dismiss strike (min 5 char):');
    if (!reason || reason.length < 5) return;
    try { await api.admin.fraudDismissStrike(id, reason); void load(); } catch (e: any) { alert(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fraud Signals</h1>
          <p className="text-sm text-slate-500">Auto-detect indikasi fraud + manual flag.</p>
        </div>
        <button
          onClick={runDetection}
          disabled={running}
          className="inline-flex items-center gap-1 rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          <Play size={14} /> {running ? 'Running…' : 'Run Detection'}
        </button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <RuleCard title="High Cancel Rate" desc="Cleaner cancel >30% (30 hari, min 5 job)" />
        <RuleCard title="High Refund Rate" desc="Customer di-refund >25% (30 hari, min 4 order)" />
        <RuleCard title="Shared Device" desc="1 device fingerprint = >1 user_id" />
        <RuleCard title="Off-Platform Chat" desc="Chat berisi nomor HP, WA, transfer, BCA, dll" />
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Memuat…</div>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
            Belum ada fraud signal. Klik <b>Run Detection</b> untuk scan sekarang.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Waktu</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Strike Type</th>
                  <th className="px-4 py-2">Total Strikes</th>
                  <th className="px-4 py-2">Detail</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-slate-50 align-top">
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{s.userName ?? '—'}</div>
                      <div className="text-xs text-slate-500">{s.userPhone}</div>
                      {s.userStatus && s.userStatus !== 'active' && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">{s.userStatus}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <SignalBadge type={s.strikeType} />
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${s.totalStrikes >= 3 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                        {s.totalStrikes}x
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {s.details ? <code className="text-[10px]">{JSON.stringify(s.details)}</code> : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => dismiss(s.id)} className="text-xs text-slate-600 hover:text-red-700 hover:underline">
                        <Trash2 size={11} className="inline" /> Dismiss
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RuleCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="text-xs font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-[11px] text-slate-500">{desc}</div>
    </div>
  );
}

function SignalBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    high_cancel_rate: 'bg-orange-100 text-orange-700',
    high_refund_rate: 'bg-orange-100 text-orange-700',
    shared_device: 'bg-purple-100 text-purple-700',
    off_platform_chat: 'bg-red-100 text-red-700',
    dispute_debit_cleaner: 'bg-red-100 text-red-700',
    dispute_suspend_subject: 'bg-red-100 text-red-700',
    dispute_refund_customer: 'bg-amber-100 text-amber-700',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${colors[type] ?? 'bg-slate-100 text-slate-700'}`}>{type}</span>;
}

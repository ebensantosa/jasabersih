'use client';

import { useEffect, useState } from 'react';
import { Check, X, Clock, CheckCircle2, XCircle } from 'lucide-react';

import { api } from '../../../lib/api';

type Tab = 'pending' | 'approved' | 'rejected';

export default function WalletPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setList(await api.admin.withdrawals(tab));
    } catch (e: any) {
      alert(e?.message);
      setList([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [tab]);

  async function approve(id: string) {
    const ref = prompt('Referensi bank transfer (no transaksi BCA/Mandiri/dll):');
    if (!ref || ref.trim().length < 3) return;
    const note = prompt('Catatan (opsional):') ?? '';
    try { await api.admin.approveWithdrawal(id, ref, note || undefined); void load(); } catch (e: any) { alert(e?.message); }
  }

  async function reject(id: string) {
    const reason = prompt('Alasan reject (akan dikirim ke cleaner, min 5 karakter):');
    if (!reason || reason.length < 5) return;
    try { await api.admin.rejectWithdrawal(id, reason); void load(); } catch (e: any) { alert(e?.message); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Wallet & Withdrawal</h1>
      <p className="text-sm text-slate-500">Review penarikan dana cleaner. Approve = transfer manual sudah dilakukan.</p>

      <div className="mt-4 flex gap-1 border-b">
        {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t === 'pending' && <Clock size={14} />}
            {t === 'approved' && <CheckCircle2 size={14} />}
            {t === 'rejected' && <XCircle size={14} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Memuat…</div>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
            Tidak ada withdrawal di status <b>{tab}</b>.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cleaner</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3">Tujuan Transfer</th>
                  <th className="px-4 py-3">Diminta</th>
                  {tab !== 'pending' && <th className="px-4 py-3">Diproses</th>}
                  {tab === 'approved' && <th className="px-4 py-3">Ref Transfer</th>}
                  {tab === 'rejected' && <th className="px-4 py-3">Alasan</th>}
                  {tab === 'pending' && <th className="px-4 py-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((w) => (
                  <tr key={w.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{w.userName ?? '—'}</div>
                      <div className="text-xs text-slate-500">{w.userPhone}</div>
                      {w.cleanerTier && (
                        <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                          Tier {w.cleanerTier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      Rp {Number(w.amount).toLocaleString('id-ID')}
                      {w.fee > 0 && (
                        <div className="text-[10px] font-normal text-slate-500">Fee: Rp {Number(w.fee).toLocaleString('id-ID')}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{w.bankCode ?? '—'}</div>
                      <div className="font-mono">{w.accountNumber ?? '—'}</div>
                      <div className="text-slate-500">a/n {w.accountName ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(w.requestedAt).toLocaleString('id-ID')}
                    </td>
                    {tab !== 'pending' && (
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {w.reviewedAt ? new Date(w.reviewedAt).toLocaleString('id-ID') : '—'}
                      </td>
                    )}
                    {tab === 'approved' && <td className="px-4 py-3 font-mono text-xs">{w.bankTransferRef ?? '—'}</td>}
                    {tab === 'rejected' && <td className="px-4 py-3 text-xs text-red-700">{w.reviewNote ?? w.failureReason ?? '—'}</td>}
                    {tab === 'pending' && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => approve(w.id)}
                          className="mr-1 inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          onClick={() => reject(w.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100"
                        >
                          <X size={12} /> Reject
                        </button>
                      </td>
                    )}
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

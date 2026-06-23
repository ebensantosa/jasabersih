'use client';

import { useEffect, useState } from 'react';
import { Check, X, Clock, CheckCircle2, XCircle } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Button, Badge, useToast } from '../../../components/ui';

type Tab = 'pending' | 'approved' | 'rejected';

export default function WalletPage(): React.ReactElement | null {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<any | null>(null);
  const [rejecting, setRejecting] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.withdrawals(tab)); } catch (e: any) { toast.error(e?.message ?? 'Gagal load.'); setList([]); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [tab]);

  async function approveViaAuto(w: any) {
    if (!confirm(`Retry auto-disburse - Rp ${Number(w.amount).toLocaleString('id-ID')} ke ${(w.bankCode ?? 'â€”').toUpperCase()} ${w.accountNumber ?? 'â€”'} a/n ${w.accountName ?? 'â€”'}?\n\nPakai hanya kalau yakin sistem pembayaran udh recover dari error sebelumnya.`)) return;
    try {
      await api.admin.approveWithdrawalViaFlip(w.id);
      toast.success('Retry trigger auto-transfer. Status auto-update via callback.');
      void load();
    } catch (e: any) { toast.error(e?.message ?? 'Gagal trigger transfer otomatis.'); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Wallet & Withdrawal</h1>
      <p className="text-sm text-slate-500">
        Cleaner submit -&gt; otomatis transfer ke rekening tujuan. Yg masuk tab <b>Pending</b> = auto-transfer
        gagal / belum verified / butuh review. Admin proses manual via bank/wallet sendiri, lalu klik
        <b>Manual</b> (input ref transfer). Tombol <b>Retry Auto</b> hanya kalau yakin masalah sistem pembayaran
        udh recover.
      </p>

      <div className="mt-4 flex gap-1 border-b">
        {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}
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
          <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">Tidak ada withdrawal di status <b>{tab}</b>.</div>
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
                      <div className="font-medium">{w.userName ?? 'â€”'}</div>
                      <div className="text-xs text-slate-500">{w.userPhone}</div>
                      {w.cleanerTier && <div className="mt-1"><Badge variant="amber">Tier {w.cleanerTier}</Badge></div>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      Rp {Number(w.amount).toLocaleString('id-ID')}
                      {w.fee > 0 && <div className="text-[10px] font-normal text-slate-500">Fee: Rp {Number(w.fee).toLocaleString('id-ID')}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{w.bankCode ?? 'â€”'}</div>
                      <div className="font-mono">{w.accountNumber ?? 'â€”'}</div>
                      <div className="text-slate-500">a/n {w.accountName ?? 'â€”'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(w.requestedAt).toLocaleString('id-ID')}</td>
                    {tab !== 'pending' && <td className="px-4 py-3 text-xs text-slate-500">{w.reviewedAt ? new Date(w.reviewedAt).toLocaleString('id-ID') : 'â€”'}</td>}
                    {tab === 'approved' && (
                      <td className="px-4 py-3 font-mono text-xs">
                        {w.bankTransferRef ?? w.flipDisbursementId ?? 'â€”'}
                        {w.reviewStatus === 'auto_approved' && (
                          <span className="ml-1.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">Auto Transfer</span>
                        )}
                      </td>
                    )}
                    {tab === 'rejected' && <td className="px-4 py-3 text-xs text-red-700">{w.reviewNote ?? w.failureReason ?? 'â€”'}</td>}
                    {tab === 'pending' && (
                      <td className="px-4 py-3 text-right space-x-1">
                        {/* Manual = action utama (admin transfer sendiri lalu mark approved).
                            Retry Auto = hidden behind ellipsis, jarang dipakai. */}
                        <Button size="sm" variant="success" onClick={() => setApproving(w)} icon={<Check size={12} />}>Manual Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(w)} icon={<X size={12} />}>Reject</Button>
                        <details className="inline-block">
                          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-700 select-none ml-2">Â·Â·Â·</summary>
                          <div className="absolute right-4 mt-1 rounded border bg-white p-2 shadow-md z-10">
                            <Button size="sm" variant="primary" onClick={() => void approveViaAuto(w)}>Retry Auto</Button>
                            <p className="mt-1 text-[10px] text-slate-500 max-w-[180px]">
                              Coba auto-disburse lagi. Hanya kalau yakin sistem pembayaran udh recover.
                            </p>
                          </div>
                        </details>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approving && <ApproveModal w={approving} onClose={() => setApproving(null)} onDone={() => { setApproving(null); void load(); }} />}
      {rejecting && <RejectModal w={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); void load(); }} />}
    </div>
  );
}

function ApproveModal({ w, onClose, onDone }: { w: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!ref || ref.length < 3) e.ref = 'Minimum 3 karakter.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api.admin.approveWithdrawal(w.id, ref, note || undefined); toast.success('Withdrawal di-approve.'); onDone(); }
    catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={`Approve Withdrawal â€” ${w.userName ?? 'â€”'}`}
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="success" onClick={save} loading={busy}>Approve</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <div>Jumlah: <b>Rp {Number(w.amount).toLocaleString('id-ID')}</b></div>
          <div className="text-xs text-slate-600">{w.bankCode} Â· {w.accountNumber} Â· a/n {w.accountName}</div>
        </div>
        <Input label="Referensi Bank Transfer" required value={ref} onChange={setRef} error={errors.ref} placeholder="No transaksi BCA/Mandiri/dll" helpText="Wajib â€” sebagai bukti audit." />
        <Textarea label="Catatan (opsional)" value={note} onChange={setNote} rows={2} />
      </div>
    </Modal>
  );
}

function RejectModal({ w, onClose, onDone }: { w: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!reason || reason.length < 5) e.reason = 'Min 5 karakter.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api.admin.rejectWithdrawal(w.id, reason); toast.success('Withdrawal di-reject.'); onDone(); }
    catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={`Reject Withdrawal â€” ${w.userName ?? 'â€”'}`}
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="danger" onClick={save} loading={busy}>Reject</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <div>Jumlah: <b>Rp {Number(w.amount).toLocaleString('id-ID')}</b></div>
          <div className="text-xs text-slate-600">{w.bankCode} Â· {w.accountNumber} Â· a/n {w.accountName}</div>
        </div>
        <Textarea label="Alasan Reject" required rows={3} value={reason} onChange={setReason} helpText="Akan dikirim ke cleaner. Min 5 karakter." />
        {errors.reason && <p className="text-xs text-red-600">{errors.reason}</p>}
      </div>
    </Modal>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, Button, useConfirm, usePrompt, useToast } from '../../../components/ui';

const CATEGORY_LABEL: Record<string, string> = {
  ask_phone: 'Minta nomor HP/WA',
  ask_payment_outside: 'Ajak transfer luar app',
  inappropriate: 'Perilaku tidak pantas',
  other: 'Lainnya',
};

export default function FraudReportsPage(): React.ReactElement | null  {
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  async function load() {
    setLoading(true);
    try { setList(await api.admin.listFraudReports(statusFilter === 'all' ? undefined : statusFilter)); }
    catch (e: any) { toast.error(e?.message); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [statusFilter]);

  async function review(id: string, decision: 'approved' | 'rejected') {
    const adminNotes = await prompt({
      title: decision === 'approved' ? 'Approve laporan' : 'Tolak laporan',
      message: decision === 'approved'
        ? 'Voucher Rp 50.000 akan otomatis dibuat untuk pelapor + cleaner kena strike.'
        : 'Berikan alasan tolakan untuk audit.',
      placeholder: 'Catatan admin (opsional untuk approve, wajib untuk tolak)',
      multiline: true,
      minLength: decision === 'rejected' ? 5 : 0,
      variant: decision === 'approved' ? 'primary' : 'danger',
      confirmLabel: decision === 'approved' ? 'Approve & beri voucher' : 'Tolak',
    });
    if (adminNotes === null) return;
    if (decision === 'approved') {
      const ok = await confirm({ title: 'Konfirmasi approve', message: 'Voucher Rp 50.000 akan diberikan ke pelapor.' });
      if (!ok) return;
    }
    try {
      const res = await api.admin.reviewFraudReport(id, decision, adminNotes || undefined);
      toast.success(decision === 'approved' ? `Approved. Voucher: ${res.voucherCode}` : 'Ditolak.');
      void load();
    } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <ShieldAlert className="text-red-600" size={24} />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fraud Reports</h1>
          <p className="text-sm text-slate-500">Review laporan customer terhadap cleaner. Approved → voucher Rp 50k + strike cleaner.</p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 text-sm font-medium ${statusFilter === s ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}>
            {s === 'all' ? 'Semua' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 text-center text-sm text-slate-500">Memuat…</div>
      ) : list.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
          Tidak ada laporan dengan status <b>{statusFilter}</b>.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {list.map((r: any) => (
            <div key={r.id} className="rounded-md border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge>{CATEGORY_LABEL[r.category] ?? r.category}</Badge>
                    <Badge>{r.status}</Badge>
                    {r.rewardVoucherCode && <Badge>{r.rewardVoucherCode}</Badge>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div><b>Pelapor:</b> {r.reporterName} · {r.reporterPhone}</div>
                    <div><b>Dilaporkan:</b> {r.reportedName ?? '—'} · {r.reportedPhone ?? '—'}</div>
                    <div><b>Booking:</b> <span className="font-mono">{r.bookingId?.slice(0, 8)}</span></div>
                    <div><b>Tanggal:</b> {new Date(r.createdAt).toLocaleString('id-ID')}</div>
                  </div>
                  {r.description && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">"{r.description}"</p>}
                  {Array.isArray(r.evidenceUrls) && r.evidenceUrls.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {r.evidenceUrls.map((u: string, i: number) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer">
                          <img src={u} className="h-16 w-16 rounded border object-cover" alt={`Evidence ${i+1}`} />
                        </a>
                      ))}
                    </div>
                  )}
                  {r.adminNotes && <p className="mt-2 text-[11px] italic text-slate-500">Catatan admin: {r.adminNotes}</p>}
                </div>
                {r.status === 'pending' && (
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="primary" icon={<CheckCircle2 size={12} />} onClick={() => review(r.id, 'approved')}>Approve</Button>
                    <Button size="sm" variant="secondary" icon={<XCircle size={12} />} onClick={() => review(r.id, 'rejected')}>Tolak</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

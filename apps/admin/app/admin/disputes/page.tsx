'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Send } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Select, Button, Badge, useToast } from '../../../components/ui';

// Tipe yang hanya bisa diajukan cleaner (perspektif cleaner terhadap customer/lokasi)
const CLEANER_REPORT_TYPES = new Set(['customer_absent', 'address_issue', 'access_denied', 'scope_mismatch', 'unsafe_items']);

function isCleanerReport(type: string | null | undefined): boolean {
  return CLEANER_REPORT_TYPES.has(String(type ?? '').toLowerCase());
}

function disputeTypeLabel(type: string | null | undefined): string {
  const value = String(type ?? '').toLowerCase();
  const labels: Record<string, string> = {
    quality:          'Hasil kerja kurang rapi',
    no_show:          'Cleaner tidak datang',
    theft:            'Kehilangan barang / pencurian',
    payment:          'Masalah pembayaran',
    harassment:       'Pelecehan / perilaku kasar',
    other:            'Lainnya',
    customer_absent:  'Customer tidak ada di lokasi',
    address_issue:    'Alamat / pin lokasi tidak sesuai',
    access_denied:    'Akses lokasi ditolak',
    scope_mismatch:   'Kondisi lapangan tidak sesuai pesanan',
    unsafe_items:     'Barang berharga / risiko kerusakan',
  };
  return labels[value] ?? String(type ?? 'Sengketa');
}

function bookingStatusLabel(status: string | null | undefined): string {
  const value = String(status ?? '').toLowerCase();
  const labels: Record<string, string> = {
    pending_payment: 'Menunggu pembayaran',
    searching: 'Mencari cleaner',
    matched: 'Cleaner ditemukan',
    on_the_way: 'Cleaner menuju lokasi',
    in_progress: 'Sedang dikerjakan',
    completed: 'Selesai',
    canceled: 'Dibatalkan',
    wa_survey_pending: 'Menunggu survei WA',
    subscription_parent: 'Paket utama',
    scheduled_future: 'Terjadwal',
  };
  return labels[value] ?? String(status ?? '-');
}

function disputeStatusLabel(status: string | null | undefined): string {
  const value = String(status ?? '').toLowerCase();
  const labels: Record<string, string> = {
    open:        'Baru',
    in_progress: 'Diproses',
    escalated:   'Diproses',
    resolved:    'Selesai',
  };
  return labels[value] ?? String(status ?? '-');
}

function priorityLabel(priority: string | null | undefined): string {
  const labels: Record<string, string> = { urgent: 'Darurat', high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
  return labels[String(priority ?? '').toLowerCase()] ?? String(priority ?? '-');
}

function disputeActionOptions(type: string | null | undefined) {
  const cleanerReported = isCleanerReport(type);
  const common = [
    { value: 'warn_both', label: 'Berikan peringatan ke kedua pihak' },
    { value: 'dismiss', label: 'Tutup tanpa tindakan' },
  ];
  if (cleanerReported) {
    return [
      { value: 'refund_customer', label: 'Kompensasi ke cleaner (% dari total pesanan)' },
      { value: 'suspend_subject', label: 'Bekukan akun customer (pihak terlapor)' },
      ...common,
    ];
  }
  return [
    { value: 'refund_customer', label: 'Refund / kompensasi ke customer (pelapor)' },
    { value: 'debit_cleaner', label: 'Potong saldo cleaner (pihak terlapor)' },
    { value: 'suspend_subject', label: 'Bekukan akun cleaner (pihak terlapor)' },
    ...common,
    { value: 'warranty_redo_approved', label: 'Setujui pengerjaan ulang (garansi)' },
  ];
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'open', label: 'Baru' },
  { value: 'in_progress', label: 'Diproses' },
  { value: 'escalated', label: 'Diproses (eskalasi)' },
  { value: 'resolved', label: 'Selesai' },
];

export default function DisputesPage() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await api.admin.listDisputes({
        status: filterStatus || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setList(data);
    } catch (e: any) {
      toast.error(e?.message);
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filterStatus, filterFrom, filterTo]);

  async function openDetail(id: string) {
    try {
      const d = await api.admin.disputeDetail(id);
      setSelected(d.dispute);
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  async function takeOver(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.admin.assignDispute(id);
      toast.success('Sengketa diambil alih.');
      void load();
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  const openCount = list.filter((d) => d.status === 'open').length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sengketa</h1>
          <p className="text-sm text-slate-500">
            Pengaduan antara customer dan cleaner.
          </p>
        </div>
        {openCount > 0 && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
            {openCount} perlu ditangani
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-slate-50 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Dari tanggal</label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Sampai tanggal</label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
          />
        </div>
        {(filterStatus || filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterFrom(''); setFilterTo(''); }}
            className="text-xs text-slate-500 hover:text-slate-800 underline"
          >
            Reset filter
          </button>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Memuat...</div>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
            Tidak ada sengketa ditemukan.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-md border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Jenis</th>
                    <th className="px-4 py-2">Pelapor</th>
                    <th className="px-4 py-2">Pihak diperiksa</th>
                    <th className="px-4 py-2">Pesanan</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Prioritas</th>
                    <th className="px-4 py-2">Dibuat</th>
                    <th className="px-4 py-2">SLA</th>
                    <th className="px-4 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr
                      key={d.id}
                      className="cursor-pointer border-t hover:bg-blue-50"
                      onClick={() => openDetail(d.id)}
                    >
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-1">
                          <Badge variant={isCleanerReport(d.type) ? 'amber' : 'blue'}>
                            {isCleanerReport(d.type) ? '🔧 Dari Cleaner' : '👤 Dari Customer'}
                          </Badge>
                          <span className="text-xs text-slate-500">{disputeTypeLabel(d.type)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{d.raisedByName ?? '-'}</div>
                        <div className="text-xs text-slate-500">{d.raisedByPhone}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{d.subjectName ?? '-'}</div>
                        <div className="text-xs text-slate-500">{d.subjectPhone}</div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{d.bookingId?.slice(0, 8)}…</td>
                      <td className="px-4 py-2">
                        <Badge variant={d.status === 'resolved' ? 'green' : d.status === 'open' ? 'red' : 'blue'}>
                          {disputeStatusLabel(d.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={d.priority === 'urgent' ? 'red' : d.priority === 'high' ? 'amber' : 'slate'}>
                          {priorityLabel(d.priority)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {new Date(d.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        <div className="text-[10px] text-slate-400">
                          {new Date(d.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {d.status === 'resolved'
                          ? <span className="text-slate-400">-</span>
                          : d.slaDueAt ? <SlaBadge dueAt={d.slaDueAt} /> : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => openDetail(d.id)}>Detail</Button>
                          {d.status === 'open' && (
                            <Button size="sm" variant="primary" onClick={(e) => takeOver(d.id, e)}>Ambil alih</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">{list.length} sengketa</p>
          </>
        )}
      </div>

      {selected && (
        <DisputeDetailModal
          dispute={selected}
          onClose={() => setSelected(null)}
          onResolved={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}

function SlaBadge({ dueAt }: { dueAt: string }) {
  const hoursLeft = Math.round((new Date(dueAt).getTime() - Date.now()) / 3_600_000);
  if (hoursLeft < 0) return <Badge variant="red">Terlambat {Math.abs(hoursLeft)} jam</Badge>;
  if (hoursLeft < 4) return <Badge variant="amber">{hoursLeft} jam lagi</Badge>;
  return <Badge>{hoursLeft} jam lagi</Badge>;
}

function DisputeDetailModal({
  dispute,
  onClose,
  onResolved,
}: {
  dispute: any;
  onClose: () => void;
  onResolved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const actionOptions = disputeActionOptions(dispute?.type);
  const [form, setForm] = useState({
    action: 'refund_customer' as string,
    payoutAmount: '',
    resolution: '',
    suspendDays: 14,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function resolve() {
    const e: Record<string, string> = {};
    if (form.resolution.trim().length < 10) e.resolution = 'Minimal 10 karakter.';
    const needsAmount = form.action === 'refund_customer' || form.action === 'debit_cleaner';
    if (needsAmount && !Number(form.payoutAmount)) e.payoutAmount = 'Wajib lebih dari 0.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      await api.admin.resolveDispute(dispute.id, {
        action: form.action,
        payoutAmount: needsAmount ? Number(form.payoutAmount) : undefined,
        resolution: form.resolution,
        suspendDays: form.action === 'suspend_subject' ? form.suspendDays : undefined,
      });
      toast.success('Sengketa berhasil diselesaikan.');
      onResolved();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Sengketa · ${disputeTypeLabel(dispute.type)}`} open onClose={onClose} size="lg">
      <div className="mb-3 flex items-center gap-2">
        <Badge variant={isCleanerReport(dispute.type) ? 'amber' : 'blue'}>
          {isCleanerReport(dispute.type) ? '🔧 Dilaporkan Cleaner' : '👤 Dilaporkan Customer'}
        </Badge>
        <Badge variant={dispute.status === 'resolved' ? 'green' : dispute.status === 'open' ? 'red' : 'blue'}>
          {disputeStatusLabel(dispute.status)}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <InfoCard title={isCleanerReport(dispute.type) ? 'Pelapor (Cleaner)' : 'Pelapor (Customer)'}>
          <div className="font-medium">{dispute.raisedByName ?? '-'}</div>
          <div className="text-xs text-slate-500">{dispute.raisedByPhone}</div>
        </InfoCard>
        <InfoCard title={isCleanerReport(dispute.type) ? 'Pihak diperiksa (Customer)' : 'Pihak diperiksa (Cleaner)'}>
          <div className="font-medium">{dispute.subjectName ?? '-'}</div>
          <div className="text-xs text-slate-500">{dispute.subjectPhone}</div>
        </InfoCard>
        <InfoCard title="Pesanan">
          <div className="text-xs">Status: {bookingStatusLabel(dispute.bookingStatus)}</div>
          <div className="text-xs">Total: Rp {Number(dispute.bookingTotal ?? 0).toLocaleString('id-ID')}</div>
          <div className="text-xs">{dispute.bookingAddress ?? '-'}</div>
        </InfoCard>
        <InfoCard title="Prioritas & Waktu">
          <div className="text-xs">Prioritas: <b>{priorityLabel(dispute.priority)}</b></div>
          <div className="text-xs">Dibuat: {new Date(dispute.createdAt).toLocaleString('id-ID')}</div>
          {dispute.slaDueAt && dispute.status !== 'resolved' && (
            <div className="mt-1"><SlaBadge dueAt={dispute.slaDueAt} /></div>
          )}
        </InfoCard>
      </div>

      <div className="mt-4 border-t pt-4">
        <h4 className="mb-2 text-sm font-semibold">Deskripsi</h4>
        <p className="rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">{dispute.description}</p>
      </div>

      <div className="mt-4 border-t pt-4">
        <h4 className="mb-2 text-sm font-semibold">Bukti ({dispute.evidence?.length ?? 0})</h4>
        {!dispute.evidence || dispute.evidence.length === 0 ? (
          <p className="text-xs text-slate-500">Belum ada bukti.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {dispute.evidence.map((ev: any, i: number) => (
              <div key={i} className="overflow-hidden rounded border">
                {ev.type === 'image' && ev.url ? (
                  <img src={ev.url} alt={ev.caption ?? ''} className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-slate-100">
                    <a href={ev.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">Buka file</a>
                  </div>
                )}
                {ev.caption && <div className="bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{ev.caption}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {dispute.status !== 'resolved' && (
        <div className="mt-4 border-t pt-4">
          <h4 className="mb-3 text-sm font-semibold">Tindak lanjut</h4>
          <div className="space-y-3">
            <Select
              label="Tindakan"
              required
              value={form.action}
              options={actionOptions}
              onChange={(v) => setForm({ ...form, action: v })}
            />
            {(form.action === 'refund_customer' || form.action === 'debit_cleaner') && (
              <div>
                <Input
                  label={`Jumlah kompensasi (Rp)${dispute.bookingTotal ? ` · Total pesanan: Rp ${Number(dispute.bookingTotal).toLocaleString('id-ID')}` : ''}`}
                  type="number"
                  required
                  value={form.payoutAmount}
                  onChange={(v) => setForm({ ...form, payoutAmount: v })}
                  error={errors.payoutAmount}
                />
                {dispute.bookingTotal && Number(dispute.bookingTotal) > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[25, 50, 75, 100].map((pct) => {
                      const amt = Math.round(Number(dispute.bookingTotal) * pct / 100);
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setForm({ ...form, payoutAmount: String(amt) })}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          {pct}% = Rp {amt.toLocaleString('id-ID')}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {form.action === 'suspend_subject' && (
              <Input
                label="Durasi suspend (hari)"
                type="number"
                value={String(form.suspendDays)}
                onChange={(v) => setForm({ ...form, suspendDays: Number(v) })}
              />
            )}
            <Textarea
              label="Catatan keputusan"
              required
              rows={3}
              value={form.resolution}
              onChange={(v) => setForm({ ...form, resolution: v })}
              helpText="Minimal 10 karakter dan akan masuk audit log."
            />
            {errors.resolution && <p className="text-xs text-red-600">{errors.resolution}</p>}
            <div className="flex justify-end">
              <Button variant="primary" icon={<Send size={14} />} onClick={resolve} loading={busy}>
                Selesaikan
              </Button>
            </div>
          </div>
        </div>
      )}

      {dispute.status === 'resolved' && (
        <div className="mt-4 rounded-md border-t bg-green-50 p-4 text-sm">
          <b>Selesai</b>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{dispute.resolution}</p>
          {dispute.payout_amount && (
            <p className="mt-1 text-xs">Nominal: Rp {Number(dispute.payout_amount).toLocaleString('id-ID')}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">{title}</div>
      {children}
    </div>
  );
}

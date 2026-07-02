'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpCircle, Send } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Select, Button, Badge, useToast } from '../../../components/ui';

type Status = 'open' | 'in_progress' | 'resolved' | 'escalated';

const TABS: { key: Status; label: string }[] = [
  { key: 'open', label: 'Baru' },
  { key: 'in_progress', label: 'Diproses' },
  { key: 'escalated', label: 'Dinaikkan' },
  { key: 'resolved', label: 'Selesai' },
];

function disputeTypeLabel(type: string | null | undefined): string {
  const value = String(type ?? '').toLowerCase();
  const labels: Record<string, string> = {
    customer_absent: 'Customer tidak hadir',
    cleaner_absent: 'Cleaner tidak hadir',
    late_arrival: 'Datang terlambat',
    poor_quality: 'Kualitas pekerjaan kurang',
    damage_claim: 'Klaim kerusakan',
    payment_issue: 'Masalah pembayaran',
    access_issue: 'Masalah akses lokasi',
    no_show: 'Tidak datang',
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
    open: 'Baru',
    in_progress: 'Diproses',
    escalated: 'Dinaikkan',
    resolved: 'Selesai',
  };
  return labels[value] ?? String(status ?? '-');
}

function priorityLabel(priority: string | null | undefined): string {
  const value = String(priority ?? '').toLowerCase();
  const labels: Record<string, string> = {
    urgent: 'Darurat',
    high: 'Tinggi',
    medium: 'Sedang',
    low: 'Rendah',
  };
  return labels[value] ?? String(priority ?? '-');
}

function disputeActionOptions(type: string | null | undefined) {
  const value = String(type ?? '').toLowerCase();
  const looksCustomerAtFault = value.includes('customer') || value.includes('absent') || value.includes('no_show');
  const looksCleanerAtFault = value.includes('cleaner') || value.includes('late') || value.includes('damage') || value.includes('quality');

  const common = [
    { value: 'warn_both', label: 'Berikan peringatan ke kedua pihak' },
    { value: 'dismiss', label: 'Tutup tanpa tindakan' },
  ];

  if (looksCustomerAtFault && !looksCleanerAtFault) {
    return [
      { value: 'suspend_subject', label: 'Suspend pihak yang diperiksa' },
      { value: 'refund_customer', label: 'Kompensasi ke pelapor' },
      ...common,
      { value: 'warranty_redo_approved', label: 'Setujui pengerjaan ulang (garansi)' },
    ];
  }

  if (looksCleanerAtFault) {
    return [
      { value: 'debit_cleaner', label: 'Potong saldo pihak yang diperiksa' },
      { value: 'refund_customer', label: 'Kompensasi ke pelapor' },
      { value: 'suspend_subject', label: 'Suspend pihak yang diperiksa' },
      ...common,
      { value: 'warranty_redo_approved', label: 'Setujui pengerjaan ulang (garansi)' },
    ];
  }

  return [
    { value: 'refund_customer', label: 'Kompensasi ke pelapor' },
    { value: 'debit_cleaner', label: 'Potong saldo pihak yang diperiksa' },
    { value: 'suspend_subject', label: 'Suspend pihak yang diperiksa' },
    ...common,
    { value: 'warranty_redo_approved', label: 'Setujui pengerjaan ulang (garansi)' },
  ];
}

export default function DisputesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Status>('open');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try {
      setList(await api.admin.listDisputes(tab));
    } catch (e: any) {
      toast.error(e?.message);
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tab]);

  async function openDetail(id: string) {
    try {
      const d = await api.admin.disputeDetail(id);
      setSelected(d.dispute);
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  async function takeOver(id: string) {
    try {
      await api.admin.assignDispute(id);
      toast.success('Sengketa diambil alih.');
      await openDetail(id);
      void load();
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sengketa</h1>
          <p className="text-sm text-slate-500">
            Pengaduan antara customer dan cleaner. Selesaikan dengan kompensasi, potong saldo,
            suspend, atau pengerjaan ulang.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-b-2 border-blue-700 text-blue-700'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Memuat...</div>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
            Tidak ada sengketa pada status{' '}
            <b>{TABS.find((t) => t.key === tab)?.label ?? tab}</b>.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Jenis</th>
                  <th className="px-4 py-2">Pelapor</th>
                  <th className="px-4 py-2">Pihak diperiksa</th>
                  <th className="px-4 py-2">Pesanan</th>
                  <th className="px-4 py-2">Prioritas</th>
                  <th className="px-4 py-2">Dibuat</th>
                  <th className="px-4 py-2">SLA</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id} className="cursor-pointer border-t hover:bg-blue-50" onClick={() => openDetail(d.id)}>
                    <td className="px-4 py-2">
                      <Badge>{disputeTypeLabel(d.type)}</Badge>
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
                      <Badge variant={d.priority === 'urgent' ? 'red' : d.priority === 'high' ? 'amber' : 'slate'}>
                        {priorityLabel(d.priority)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(d.createdAt).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 text-xs">
                      {d.slaDueAt ? <SlaBadge dueAt={d.slaDueAt} /> : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="secondary" onClick={() => openDetail(d.id)}>
                        Detail
                      </Button>
                      {tab === 'open' && (
                        <Button size="sm" variant="primary" onClick={() => takeOver(d.id)}>
                          Ambil alih
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DisputeDetailModal
          dispute={selected}
          onClose={() => setSelected(null)}
          onResolved={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function SlaBadge({ dueAt }: { dueAt: string }) {
  const dueDate = new Date(dueAt);
  const hoursLeft = Math.round((dueDate.getTime() - Date.now()) / 3_600_000);
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
  const [escalating, setEscalating] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionOptions = disputeActionOptions(dispute?.type);
  const [form, setForm] = useState({
    action: 'refund_customer' as
      | 'refund_customer'
      | 'debit_cleaner'
      | 'warn_both'
      | 'dismiss'
      | 'suspend_subject'
      | 'warranty_redo_approved',
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
    <>
      <Modal title={`Sengketa · ${disputeTypeLabel(dispute.type)}`} open={!escalating} onClose={onClose} size="lg">
        <div className="grid gap-3 md:grid-cols-2">
          <InfoCard title="Pelapor">
            <div className="font-medium">{dispute.raisedByName ?? '-'}</div>
            <div className="text-xs text-slate-500">{dispute.raisedByPhone}</div>
          </InfoCard>
          <InfoCard title="Pihak diperiksa">
            <div className="font-medium">{dispute.subjectName ?? '-'}</div>
            <div className="text-xs text-slate-500">{dispute.subjectPhone}</div>
          </InfoCard>
          <InfoCard title="Pesanan">
            <div className="text-xs">Status: {bookingStatusLabel(dispute.bookingStatus)}</div>
            <div className="text-xs">Total: Rp {Number(dispute.bookingTotal ?? 0).toLocaleString('id-ID')}</div>
            <div className="text-xs">{dispute.bookingAddress ?? '-'}</div>
          </InfoCard>
          <InfoCard title="Status & Prioritas">
            <div className="text-xs">
              Status: <b>{disputeStatusLabel(dispute.status)}</b>
            </div>
            <div className="text-xs">
              Prioritas: <b>{priorityLabel(dispute.priority)}</b>
            </div>
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
                      <a href={ev.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">
                        Buka file
                      </a>
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
                onChange={(v) => setForm({ ...form, action: v as any })}
              />
              {(form.action === 'refund_customer' || form.action === 'debit_cleaner') && (
                <Input
                  label="Jumlah (Rp)"
                  type="number"
                  required
                  value={form.payoutAmount}
                  onChange={(v) => setForm({ ...form, payoutAmount: v })}
                  error={errors.payoutAmount}
                />
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
              <div className="flex justify-end gap-2">
                <Button variant="secondary" icon={<ArrowUpCircle size={14} />} onClick={() => setEscalating(true)}>
                  Naikkan eskalasi
                </Button>
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

      {escalating && (
        <EscalateModal
          disputeId={dispute.id}
          onClose={() => setEscalating(false)}
          onDone={() => {
            setEscalating(false);
            onResolved();
          }}
        />
      )}
    </>
  );
}

function EscalateModal({
  disputeId,
  onClose,
  onDone,
}: {
  disputeId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (reason.length < 5) e.reason = 'Minimal 5 karakter.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      await api.admin.escalateDispute(disputeId, reason);
      toast.success('Sengketa dinaikkan.');
      onDone();
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Naikkan eskalasi sengketa"
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="danger" onClick={save} loading={busy} icon={<ArrowUpCircle size={14} />}>
            Naikkan eskalasi
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-600">
          Prioritas akan menjadi <b>darurat</b>. Manajer / super admin akan menerima notifikasi.
        </p>
        <Textarea label="Alasan eskalasi" required rows={3} value={reason} onChange={setReason} />
        {errors.reason && <p className="text-xs text-red-600">{errors.reason}</p>}
      </div>
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

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X, Send, ArrowUpCircle } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Select, Button, Badge, useToast } from '../../../components/ui';

type Status = 'open' | 'in_progress' | 'resolved' | 'escalated';
const TABS: { key: Status; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'resolved', label: 'Resolved' },
];

export default function DisputesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Status>('open');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.listDisputes(tab)); } catch (e: any) { toast.error(e?.message); setList([]); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [tab]);

  async function openDetail(id: string) {
    try { const d = await api.admin.disputeDetail(id); setSelected(d.dispute); } catch (e: any) { toast.error(e?.message); }
  }

  async function takeOver(id: string) {
    try { await api.admin.assignDispute(id); toast.success('Dispute di-assign ke kamu.'); await openDetail(id); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Disputes</h1>
          <p className="text-sm text-slate-500">Sengketa antara customer ↔ cleaner. Resolve dengan refund / debit / suspend.</p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Memuat…</div>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">Tidak ada dispute di status <b>{tab}</b>.</div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Type</th><th className="px-4 py-2">Pelapor</th>
                  <th className="px-4 py-2">Subject</th><th className="px-4 py-2">Booking</th>
                  <th className="px-4 py-2">Priority</th><th className="px-4 py-2">Dibuat</th>
                  <th className="px-4 py-2">SLA</th><th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2"><Badge>{d.type}</Badge></td>
                    <td className="px-4 py-2"><div className="font-medium">{d.raisedByName ?? '—'}</div><div className="text-xs text-slate-500">{d.raisedByPhone}</div></td>
                    <td className="px-4 py-2"><div className="font-medium">{d.subjectName ?? '—'}</div><div className="text-xs text-slate-500">{d.subjectPhone}</div></td>
                    <td className="px-4 py-2 font-mono text-xs">{d.bookingId?.slice(0, 8)}…</td>
                    <td className="px-4 py-2"><Badge variant={d.priority === 'urgent' ? 'red' : d.priority === 'high' ? 'amber' : 'slate'}>{d.priority}</Badge></td>
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(d.createdAt).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 text-xs">{d.slaDueAt ? <SlaBadge dueAt={d.slaDueAt} /> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="secondary" onClick={() => openDetail(d.id)}>Detail</Button>
                      {tab === 'open' && <Button size="sm" variant="primary" onClick={() => takeOver(d.id)}>Take Over</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <DisputeDetailModal dispute={selected} onClose={() => setSelected(null)} onResolved={() => { setSelected(null); void load(); }} />}
    </div>
  );
}

function SlaBadge({ dueAt }: { dueAt: string }) {
  const dueDate = new Date(dueAt);
  const hoursLeft = Math.round((dueDate.getTime() - Date.now()) / 3_600_000);
  if (hoursLeft < 0) return <Badge variant="red">Overdue {Math.abs(hoursLeft)}h</Badge>;
  if (hoursLeft < 4) return <Badge variant="amber">{hoursLeft}h left</Badge>;
  return <Badge>{hoursLeft}h left</Badge>;
}

function DisputeDetailModal({ dispute, onClose, onResolved }: { dispute: any; onClose: () => void; onResolved: () => void }) {
  const toast = useToast();
  const [escalating, setEscalating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    action: 'refund_customer' as 'refund_customer' | 'debit_cleaner' | 'warn_both' | 'dismiss' | 'suspend_subject',
    payoutAmount: '',
    resolution: '',
    suspendDays: 14,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function resolve() {
    const e: Record<string, string> = {};
    if (form.resolution.trim().length < 10) e.resolution = 'Min 10 karakter.';
    const needsAmount = form.action === 'refund_customer' || form.action === 'debit_cleaner';
    if (needsAmount && !Number(form.payoutAmount)) e.payoutAmount = 'Wajib > 0.';
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
      toast.success('Dispute resolved.');
      onResolved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <>
      <Modal title={`Dispute · ${dispute.type}`} open={!escalating} onClose={onClose} size="lg">
        <div className="grid gap-3 md:grid-cols-2">
          <InfoCard title="Pelapor"><div className="font-medium">{dispute.raisedByName ?? '—'}</div><div className="text-xs text-slate-500">{dispute.raisedByPhone}</div></InfoCard>
          <InfoCard title="Subject"><div className="font-medium">{dispute.subjectName ?? '—'}</div><div className="text-xs text-slate-500">{dispute.subjectPhone}</div></InfoCard>
          <InfoCard title="Booking">
            <div className="text-xs">Status: {dispute.bookingStatus ?? '—'}</div>
            <div className="text-xs">Total: Rp {Number(dispute.bookingTotal ?? 0).toLocaleString('id-ID')}</div>
            <div className="text-xs">{dispute.bookingAddress ?? '—'}</div>
          </InfoCard>
          <InfoCard title="Status & Priority">
            <div className="text-xs">Status: <b>{dispute.status}</b></div>
            <div className="text-xs">Priority: <b>{dispute.priority}</b></div>
          </InfoCard>
        </div>

        <div className="mt-4 border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold">Deskripsi</h4>
          <p className="rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">{dispute.description}</p>
        </div>

        <div className="mt-4 border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold">Evidence ({dispute.evidence?.length ?? 0})</h4>
          {!dispute.evidence || dispute.evidence.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada evidence.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {dispute.evidence.map((ev: any, i: number) => (
                <div key={i} className="overflow-hidden rounded border">
                  {ev.type === 'image' && ev.url ? (
                    <img src={ev.url} alt={ev.caption ?? ''} className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-32 items-center justify-center bg-slate-100">
                      <a href={ev.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">Open file</a>
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
            <h4 className="mb-3 text-sm font-semibold">Resolve</h4>
            <div className="space-y-3">
              <Select
                label="Action" required value={form.action}
                options={[
                  { value: 'warranty_redo_approved', label: '🛡️ Approve Garansi — Cleaner balik bersihkan ulang (gratis)' },
                  { value: 'refund_customer', label: 'Refund Customer' },
                  { value: 'debit_cleaner', label: 'Debit Cleaner (potong saldo)' },
                  { value: 'suspend_subject', label: 'Suspend Subject' },
                  { value: 'warn_both', label: 'Warn keduanya (no penalty)' },
                  { value: 'dismiss', label: 'Dismiss (laporan ga valid)' },
                ]}
                onChange={(v) => setForm({ ...form, action: v as any })}
              />
              {(form.action === 'refund_customer' || form.action === 'debit_cleaner') && (
                <Input label="Jumlah (Rp)" type="number" required value={form.payoutAmount} onChange={(v) => setForm({ ...form, payoutAmount: v })} error={errors.payoutAmount} />
              )}
              {form.action === 'suspend_subject' && (
                <Input label="Durasi suspend (hari)" type="number" value={String(form.suspendDays)} onChange={(v) => setForm({ ...form, suspendDays: Number(v) })} />
              )}
              <Textarea label="Resolusi" required rows={3} value={form.resolution} onChange={(v) => setForm({ ...form, resolution: v })} helpText="Min 10 char — masuk audit log." />
              {errors.resolution && <p className="text-xs text-red-600">{errors.resolution}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" icon={<ArrowUpCircle size={14} />} onClick={() => setEscalating(true)}>Escalate</Button>
                <Button variant="primary" icon={<Send size={14} />} onClick={resolve} loading={busy}>Resolve</Button>
              </div>
            </div>
          </div>
        )}

        {dispute.status === 'resolved' && (
          <div className="mt-4 rounded-md border-t bg-green-50 p-4 text-sm">
            <b>Resolved</b>
            <p className="mt-1 text-slate-700 whitespace-pre-wrap">{dispute.resolution}</p>
            {dispute.payout_amount && <p className="mt-1 text-xs">Amount: Rp {Number(dispute.payout_amount).toLocaleString('id-ID')}</p>}
          </div>
        )}
      </Modal>

      {escalating && <EscalateModal disputeId={dispute.id} onClose={() => setEscalating(false)} onDone={() => { setEscalating(false); onResolved(); }} />}
    </>
  );
}

function EscalateModal({ disputeId, onClose, onDone }: { disputeId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    const e: Record<string, string> = {};
    if (reason.length < 5) e.reason = 'Min 5 karakter.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api.admin.escalateDispute(disputeId, reason); toast.success('Dispute di-escalate.'); onDone(); }
    catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }
  return (
    <Modal
      title="Escalate Dispute"
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="danger" onClick={save} loading={busy} icon={<ArrowUpCircle size={14} />}>Escalate</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-600">Priority akan jadi <b>urgent</b>. Manager / super_admin akan dapat notif.</p>
        <Textarea label="Alasan eskalasi" required rows={3} value={reason} onChange={setReason} />
        {errors.reason && <p className="text-xs text-red-600">{errors.reason}</p>}
      </div>
    </Modal>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">{title}</div>
      {children}
    </div>
  );
}

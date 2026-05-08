'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X, Image as ImageIcon, Send, ArrowUpCircle } from 'lucide-react';

import { api } from '../../../lib/api';

type Status = 'open' | 'in_progress' | 'resolved' | 'escalated';
const TABS: { key: Status; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'resolved', label: 'Resolved' },
];

export default function DisputesPage() {
  const [tab, setTab] = useState<Status>('open');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.listDisputes(tab)); } catch (e: any) { alert(e?.message); setList([]); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [tab]);

  async function openDetail(id: string) {
    try {
      const d = await api.admin.disputeDetail(id);
      setSelected(d.dispute);
    } catch (e: any) { alert(e?.message); }
  }

  async function takeOver(id: string) {
    try { await api.admin.assignDispute(id); await openDetail(id); void load(); } catch (e: any) { alert(e?.message); }
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
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Pelapor</th>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2">Booking</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Dibuat</th>
                  <th className="px-4 py-2">SLA</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2"><span className="rounded bg-slate-200 px-2 py-0.5 text-xs">{d.type}</span></td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{d.raisedByName ?? '—'}</div>
                      <div className="text-xs text-slate-500">{d.raisedByPhone}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{d.subjectName ?? '—'}</div>
                      <div className="text-xs text-slate-500">{d.subjectPhone}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{d.bookingId?.slice(0, 8)}…</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${d.priority === 'urgent' ? 'bg-red-100 text-red-700' : d.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>
                        {d.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(d.createdAt).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 text-xs">
                      {d.slaDueAt ? <SlaBadge dueAt={d.slaDueAt} /> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => openDetail(d.id)} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100">
                        Detail
                      </button>
                      {tab === 'open' && (
                        <button onClick={() => takeOver(d.id)} className="ml-1 rounded-md bg-blue-700 px-3 py-1 text-xs text-white">
                          Take Over
                        </button>
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
        <DisputeDetailModal dispute={selected} onClose={() => setSelected(null)} onResolved={() => { setSelected(null); void load(); }} />
      )}
    </div>
  );
}

function SlaBadge({ dueAt }: { dueAt: string }) {
  const dueDate = new Date(dueAt);
  const now = new Date();
  const hoursLeft = Math.round((dueDate.getTime() - now.getTime()) / 3_600_000);
  if (hoursLeft < 0) return <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">Overdue {Math.abs(hoursLeft)}h</span>;
  if (hoursLeft < 4) return <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">{hoursLeft}h left</span>;
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{hoursLeft}h left</span>;
}

function DisputeDetailModal({ dispute, onClose, onResolved }: { dispute: any; onClose: () => void; onResolved: () => void }) {
  const [resolving, setResolving] = useState(false);
  const [form, setForm] = useState({
    action: 'refund_customer' as 'refund_customer' | 'debit_cleaner' | 'warn_both' | 'dismiss' | 'suspend_subject',
    payoutAmount: '',
    resolution: '',
    suspendDays: 14,
  });

  async function resolve() {
    if (form.resolution.trim().length < 10) return alert('Resolusi min 10 karakter.');
    const needsAmount = form.action === 'refund_customer' || form.action === 'debit_cleaner';
    if (needsAmount && !Number(form.payoutAmount)) return alert('payoutAmount wajib.');
    if (!confirm(`Yakin resolve dengan action "${form.action}"?`)) return;
    try {
      await api.admin.resolveDispute(dispute.id, {
        action: form.action,
        payoutAmount: needsAmount ? Number(form.payoutAmount) : undefined,
        resolution: form.resolution,
        suspendDays: form.action === 'suspend_subject' ? form.suspendDays : undefined,
      });
      onResolved();
    } catch (e: any) { alert(e?.message); }
  }

  async function escalate() {
    const reason = prompt('Alasan eskalasi (akan di-priority urgent):');
    if (!reason) return;
    try { await api.admin.escalateDispute(dispute.id, reason); onResolved(); } catch (e: any) { alert(e?.message); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b bg-white p-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="text-amber-600" size={18} />
              Dispute · {dispute.type}
            </h2>
            <p className="text-xs text-slate-500">ID: {dispute.id} · Booking: {dispute.booking_id?.slice(0, 8)}…</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <InfoCard title="Pelapor">
            <div className="font-medium">{dispute.raisedByName ?? '—'}</div>
            <div className="text-xs text-slate-500">{dispute.raisedByPhone}</div>
          </InfoCard>
          <InfoCard title="Subject (yang dilaporkan)">
            <div className="font-medium">{dispute.subjectName ?? '—'}</div>
            <div className="text-xs text-slate-500">{dispute.subjectPhone}</div>
          </InfoCard>
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

        <div className="border-t p-4">
          <h3 className="mb-2 text-sm font-semibold">Deskripsi dari Pelapor</h3>
          <p className="rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">{dispute.description}</p>
        </div>

        <div className="border-t p-4">
          <h3 className="mb-2 text-sm font-semibold">Evidence ({dispute.evidence?.length ?? 0})</h3>
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
                      <a href={ev.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">
                        Open file
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
          <div className="border-t p-4">
            <h3 className="mb-3 text-sm font-semibold">Resolve Dispute</h3>
            <div className="space-y-3">
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value as any })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="refund_customer">Refund Customer (full / partial)</option>
                <option value="debit_cleaner">Debit Cleaner (potong saldo cleaner)</option>
                <option value="suspend_subject">Suspend Subject (14 hari)</option>
                <option value="warn_both">Warn keduanya (no penalty)</option>
                <option value="dismiss">Dismiss (laporan ga valid)</option>
              </select>
              {(form.action === 'refund_customer' || form.action === 'debit_cleaner') && (
                <input
                  type="number"
                  placeholder="Jumlah Rupiah (e.g. 50000)"
                  value={form.payoutAmount}
                  onChange={(e) => setForm({ ...form, payoutAmount: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              )}
              {form.action === 'suspend_subject' && (
                <input
                  type="number"
                  placeholder="Durasi suspend (hari)"
                  value={form.suspendDays}
                  onChange={(e) => setForm({ ...form, suspendDays: Number(e.target.value) })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              )}
              <textarea
                placeholder="Resolusi (min 10 char) — alasan keputusan, akan masuk audit log"
                value={form.resolution}
                onChange={(e) => setForm({ ...form, resolution: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button onClick={escalate} className="inline-flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-4 py-2 text-sm text-orange-700">
                  <ArrowUpCircle size={14} /> Escalate
                </button>
                <button onClick={resolve} disabled={resolving} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white">
                  <Send size={14} /> Resolve
                </button>
              </div>
            </div>
          </div>
        )}

        {dispute.status === 'resolved' && (
          <div className="border-t bg-green-50 p-4 text-sm">
            <b>Resolved by admin {dispute.resolved_by_admin?.slice(0, 8)}…</b>
            <p className="mt-1 text-slate-700 whitespace-pre-wrap">{dispute.resolution}</p>
            {dispute.payout_amount && <p className="mt-1 text-xs">Amount: Rp {Number(dispute.payout_amount).toLocaleString('id-ID')}</p>}
          </div>
        )}
      </div>
    </div>
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

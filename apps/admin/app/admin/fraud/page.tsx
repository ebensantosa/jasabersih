'use client';

import { useEffect, useState } from 'react';
import { Play, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Textarea, Button, Badge, useConfirm, useToast } from '../../../components/ui';

export default function FraudPage(): React.ReactElement | null  {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [dismissing, setDismissing] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.fraudSignals(200)); } catch (e: any) { toast.error(e?.message); setList([]); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function runDetection() {
    const ok = await confirm({ title: 'Run Detection', message: 'Jalankan semua rules sekarang? (cancel rate, refund rate, shared device, off-platform chat)' });
    if (!ok) return;
    setRunning(true);
    try {
      const r = await api.admin.fraudRunDetection();
      toast.success(`Selesai — High cancel: ${r.results.highCancelRateCleaners}, Refund: ${r.results.highRefundRateCustomers}, Device: ${r.results.sharedDevices}, Chat: ${r.results.offPlatformChats}`);
      void load();
    } catch (e: any) { toast.error(e?.message); } finally { setRunning(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fraud Signals</h1>
          <p className="text-sm text-slate-500">
            Auto-detect berjalan otomatis tiap 1 jam (cron). Tombol di samping untuk force-run sekarang.
          </p>
        </div>
        <Button variant="secondary" icon={<Play size={14} />} onClick={runDetection} loading={running}>Force Run</Button>
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
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-slate-50 align-top">
                    <td className="px-4 py-2 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{s.userName ?? '—'}</div>
                      <div className="text-xs text-slate-500">{s.userPhone}</div>
                      {s.userStatus && s.userStatus !== 'active' && <Badge variant="red">{s.userStatus}</Badge>}
                    </td>
                    <td className="px-4 py-2"><SignalBadge type={s.strikeType} /></td>
                    <td className="px-4 py-2">
                      <Badge variant={s.totalStrikes >= 3 ? 'red' : 'slate'}>{s.totalStrikes}x</Badge>
                    </td>
                    <td className="px-4 py-2 max-w-xs text-xs text-slate-600">
                      {s.details ? <code className="block max-h-16 overflow-auto break-all text-[10px]">{JSON.stringify(s.details)}</code> : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} onClick={() => setDismissing(s)}>Dismiss</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dismissing && <DismissModal strike={dismissing} onClose={() => setDismissing(null)} onDone={() => { setDismissing(null); void load(); }} />}
    </div>
  );
}

function DismissModal({ strike, onClose, onDone }: { strike: any; onClose: () => void; onDone: () => void }) {
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
    try { await api.admin.fraudDismissStrike(strike.id, reason); toast.success('Strike dismissed.'); onDone(); }
    catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="Dismiss Fraud Strike"
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="danger" onClick={save} loading={busy}>Dismiss</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">User: <b>{strike.userName ?? '—'}</b> · {strike.strikeType}</p>
        <Textarea label="Alasan dismiss" required rows={3} value={reason} onChange={setReason} helpText="Min 5 karakter — masuk audit log." />
        {errors.reason && <p className="text-xs text-red-600">{errors.reason}</p>}
      </div>
    </Modal>
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
  const variant: any = {
    high_cancel_rate: 'amber', high_refund_rate: 'amber',
    shared_device: 'purple', off_platform_chat: 'red',
    dispute_debit_cleaner: 'red', dispute_suspend_subject: 'red', dispute_refund_customer: 'amber',
  }[type] ?? 'slate';
  return <Badge variant={variant}>{type}</Badge>;
}

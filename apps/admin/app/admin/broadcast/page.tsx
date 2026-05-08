'use client';

import { useEffect, useState } from 'react';
import { Send, Users, History } from 'lucide-react';

import { api } from '../../../lib/api';
import { Input, Textarea, Select, Button, Badge, useConfirm, useToast } from '../../../components/ui';

const AUDIENCES = [
  { value: 'all', label: 'Semua user aktif' },
  { value: 'customer', label: 'Customer (semua)' },
  { value: 'cleaner', label: 'Cleaner (semua)' },
  { value: 'kyc_approved', label: 'Cleaner KYC Approved' },
  { value: 'new_customer_7d', label: 'Customer baru (< 7 hari)' },
  { value: 'inactive_30d', label: 'Customer tidak aktif 30 hari' },
];

export default function BroadcastPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', ctaLink: '' });
  const [estimate, setEstimate] = useState<{ totalUsers: number; reachable: number } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingEst, setLoadingEst] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function loadEstimate(aud: string) {
    setLoadingEst(true);
    try { setEstimate(await api.admin.broadcastEstimate(aud)); }
    catch (e: any) { toast.error(e?.message); }
    finally { setLoadingEst(false); }
  }
  async function loadHistory() {
    try { setHistory(await api.admin.broadcastHistory()); } catch {}
  }
  useEffect(() => { void loadEstimate(form.audience); void loadHistory(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { void loadEstimate(form.audience); /* eslint-disable-next-line */ }, [form.audience]);

  async function send() {
    const e: Record<string, string> = {};
    if (!form.title) e.title = 'Wajib.';
    if (!form.body || form.body.length < 10) e.body = 'Min 10 karakter.';
    setErrors(e);
    if (Object.keys(e).length) return;

    const ok = await confirm({
      title: 'Kirim Broadcast',
      message: `Akan mengirim ke ${estimate?.reachable ?? '?'} user (dari ${estimate?.totalUsers ?? '?'} total). Yakin?`,
      confirmLabel: 'Kirim',
    });
    if (!ok) return;

    setSending(true);
    try {
      const r = await api.admin.broadcastSend({
        title: form.title,
        body: form.body,
        audience: form.audience,
        ctaLink: form.ctaLink || undefined,
      });
      toast.success(`Terkirim ke ${r.sent} user (${r.failed} gagal).`);
      setForm({ title: '', body: '', audience: form.audience, ctaLink: '' });
      void loadHistory();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal kirim');
    } finally { setSending(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Broadcast Push</h1>
      <p className="text-sm text-slate-500">Kirim push notifikasi ke segmen user. Realtime, no schedule (langsung kirim).</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-md border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">Compose Pesan</h2>
            <div className="space-y-3">
              <Input label="Judul (max 50 char)" required value={form.title} onChange={(v) => setForm({ ...form, title: v.slice(0, 50) })} error={errors.title} placeholder="Promo Akhir Tahun!" helpText={`${form.title.length}/50`} />
              <Textarea label="Pesan" rows={3} required value={form.body} onChange={(v) => setForm({ ...form, body: v.slice(0, 200) })} helpText={`${form.body.length}/200 char`} />
              {errors.body && <p className="text-xs text-red-600">{errors.body}</p>}
              <Input label="CTA Link (opsional)" value={form.ctaLink} onChange={(v) => setForm({ ...form, ctaLink: v })} placeholder="jasabersih://services/kamar atau https://..." helpText="Deep link / URL yg dibuka saat user tap notif." />
              <Select
                label="Audience" value={form.audience}
                options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))}
                onChange={(v) => setForm({ ...form, audience: v })}
              />
            </div>
          </div>

          <div className="rounded-md border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">Preview</h2>
            <div className="rounded-xl border bg-slate-100 p-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-8 w-8 rounded-md bg-blue-700 flex items-center justify-center text-xs font-bold text-white">JB</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-semibold">JasaBersih</span>
                    <span>baru saja</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{form.title || '(Judul akan muncul di sini)'}</div>
                  <div className="text-xs text-slate-700">{form.body || '(Isi pesan akan muncul di sini)'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border bg-white p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users size={14} /> Audience</h2>
            {loadingEst ? (
              <div className="py-6 text-center text-xs text-slate-500">Hitung…</div>
            ) : estimate ? (
              <>
                <div className="text-3xl font-bold text-blue-700">{estimate.reachable}</div>
                <div className="text-xs text-slate-500">user akan terima push</div>
                <div className="mt-3 border-t pt-3 text-xs text-slate-600">
                  Total user di segmen ini: <b>{estimate.totalUsers}</b>
                  <div className="mt-1 text-[10px] text-slate-500">
                    User tanpa Expo Push token (web / sim / belum allow notif) tidak terhitung.
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <Button variant="primary" onClick={send} loading={sending} icon={<Send size={14} />}>
            Kirim Sekarang
          </Button>
        </div>
      </div>

      <div className="mt-8 rounded-md border bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><History size={16} /> Riwayat Broadcast (50 terakhir)</h2>
        {history.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Belum pernah kirim broadcast.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Waktu</th>
                  <th className="px-4 py-2">Admin</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Audience</th>
                  <th className="px-4 py-2 text-right">Sent / Failed</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const c = h.changes ?? {};
                  return (
                    <tr key={h.id} className="border-t">
                      <td className="px-4 py-2 text-xs text-slate-500">{new Date(h.performedAt).toLocaleString('id-ID')}</td>
                      <td className="px-4 py-2 text-xs">{h.adminName ?? h.adminEmail}</td>
                      <td className="px-4 py-2 max-w-xs truncate text-sm">{c.title ?? '—'}</td>
                      <td className="px-4 py-2"><Badge>{c.audience}</Badge></td>
                      <td className="px-4 py-2 text-right">
                        <span className="font-bold text-green-700">{c.sent ?? 0}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-red-600">{c.failed ?? 0}</span>
                        <div className="text-[10px] text-slate-500">dari {c.audienceSize ?? 0} user</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

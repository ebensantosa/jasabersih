'use client';

import { useEffect, useState } from 'react';
import { Bookmark, Calendar, History, Save, Send, Trash2, Users, X } from 'lucide-react';

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

export default function BroadcastPage(): React.ReactElement | null  {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', ctaLink: '' });
  const [estimate, setEstimate] = useState<{ totalUsers: number; reachable: number } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingEst, setLoadingEst] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', category: 'promo' });
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
  async function loadScheduled() {
    try { setScheduled(await api.admin.broadcastListScheduled()); } catch {}
  }
  async function loadTemplates() {
    try { setTemplates(await api.admin.broadcastListTemplates()); } catch {}
  }
  useEffect(() => { void loadEstimate(form.audience); void loadHistory(); void loadScheduled(); void loadTemplates(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { void loadEstimate(form.audience); /* eslint-disable-next-line */ }, [form.audience]);

  async function schedulePush() {
    const e: Record<string, string> = {};
    if (!form.title) e.title = 'Wajib.';
    if (!form.body || form.body.length < 10) e.body = 'Min 10 karakter.';
    if (!scheduledAtInput) e.scheduledAt = 'Pilih waktu kirim.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const target = new Date(scheduledAtInput);
    if (isNaN(target.getTime()) || target.getTime() < Date.now() + 60_000) {
      toast.error('Waktu min 1 menit dari sekarang');
      return;
    }
    setScheduling(true);
    try {
      await api.admin.broadcastSchedule({
        title: form.title, body: form.body, audience: form.audience,
        ctaLink: form.ctaLink || undefined,
        scheduledAt: target.toISOString(),
      });
      toast.success(`Dijadwalkan ${target.toLocaleString('id-ID')}`);
      setForm({ title: '', body: '', audience: form.audience, ctaLink: '' });
      setScheduledAtInput('');
      void loadScheduled();
    } catch (e: any) { toast.error(e?.message ?? 'Gagal'); }
    finally { setScheduling(false); }
  }

  async function cancelScheduled(id: string) {
    const ok = await confirm({ title: 'Cancel scheduled push?', message: 'Push gak akan terkirim. Bisa dibikin ulang manual.', confirmLabel: 'Cancel' });
    if (!ok) return;
    try { await api.admin.broadcastCancelScheduled(id); toast.success('Cancelled'); void loadScheduled(); }
    catch (e: any) { toast.error(e?.message ?? 'Gagal'); }
  }

  async function saveAsTemplate() {
    if (!form.title || !form.body) { toast.error('Isi title & body dulu'); return; }
    if (!templateForm.name) { toast.error('Nama template wajib'); return; }
    try {
      await api.admin.broadcastCreateTemplate({
        name: templateForm.name, title: form.title, body: form.body,
        audience: form.audience, ctaLink: form.ctaLink || undefined,
        category: templateForm.category,
      });
      toast.success(`Template "${templateForm.name}" disimpan`);
      setShowSaveTemplate(false);
      setTemplateForm({ name: '', category: 'promo' });
      void loadTemplates();
    } catch (e: any) { toast.error(e?.message ?? 'Gagal'); }
  }

  function loadFromTemplate(t: any) {
    setForm({ title: t.title, body: t.body, audience: t.audience, ctaLink: t.ctaLink ?? '' });
    void api.admin.broadcastUseTemplate(t.id).catch(() => {});
    toast.info(`Template "${t.name}" di-load. Edit kalau perlu, lalu Kirim Sekarang / Jadwalkan.`);
  }

  async function deleteTemplate(id: string, name: string) {
    const ok = await confirm({ title: `Hapus template "${name}"?`, message: 'Template gak bisa di-restore. Yakin?', confirmLabel: 'Hapus', variant: 'danger' });
    if (!ok) return;
    try { await api.admin.broadcastDeleteTemplate(id); toast.success('Hapus'); void loadTemplates(); }
    catch (e: any) { toast.error(e?.message ?? 'Gagal'); }
  }

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

          <div className="rounded-md border bg-white p-3">
            <label className="mb-1 block text-xs font-medium text-slate-700">Jadwalkan (opsional)</label>
            <input
              type="datetime-local"
              value={scheduledAtInput}
              onChange={(e) => setScheduledAtInput(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
            <p className="mt-1 text-[10px] text-slate-500">Min 1 menit dari sekarang. Cron jalan tiap menit.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={send} loading={sending} icon={<Send size={14} />}>
              Kirim Sekarang
            </Button>
            <Button variant="secondary" onClick={schedulePush} loading={scheduling} disabled={!scheduledAtInput} icon={<Calendar size={14} />}>
              Jadwalkan
            </Button>
            <Button variant="ghost" onClick={() => setShowSaveTemplate(true)} icon={<Save size={14} />}>
              Simpan sebagai Template
            </Button>
          </div>

          {/* Template library */}
          <div className="rounded-md border bg-white p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Bookmark size={14} /> Template Tersimpan ({templates.length})
            </h2>
            {templates.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">Belum ada template.</p>
            ) : (
              <div className="space-y-2">
                {templates.slice(0, 8).map((t) => (
                  <div key={t.id} className="rounded border bg-slate-50 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">{t.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{t.title}</div>
                        <div className="mt-1 flex gap-1">
                          {t.category && <Badge>{t.category}</Badge>}
                          <Badge variant="blue">{t.audience}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => loadFromTemplate(t)} className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white">Pakai</button>
                        <button onClick={() => deleteTemplate(t.id, t.name)} className="rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-600"><Trash2 size={10} /></button>
                      </div>
                    </div>
                    {t.usedCount > 0 && <div className="mt-1 text-[9px] text-slate-400">Dipakai {t.usedCount}x</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save template modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSaveTemplate(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">Simpan sebagai Template</h3>
              <button onClick={() => setShowSaveTemplate(false)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <Input label="Nama Template" placeholder="Promo Lebaran 2026" value={templateForm.name} onChange={(v) => setTemplateForm({ ...templateForm, name: v })} required />
              <Select
                label="Kategori"
                value={templateForm.category}
                options={[
                  { value: 'promo', label: 'Promo / Diskon' },
                  { value: 'announcement', label: 'Pengumuman' },
                  { value: 'reminder', label: 'Reminder' },
                  { value: 'event', label: 'Event' },
                  { value: 'other', label: 'Lainnya' },
                ]}
                onChange={(v) => setTemplateForm({ ...templateForm, category: v })}
              />
              <div className="rounded border bg-slate-50 p-2 text-[11px] text-slate-600">
                Preview: <b>{form.title}</b> — {form.body} (audience: {form.audience})
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowSaveTemplate(false)}>Batal</Button>
              <Button variant="primary" onClick={saveAsTemplate}>Simpan</Button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled list */}
      <div className="mt-8 rounded-md border bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Calendar size={16} /> Push Terjadwal</h2>
        {scheduled.filter((s) => s.status === 'pending').length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">Belum ada push yang terjadwal.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Kirim Pada</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Audience</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-slate-700">{new Date(s.scheduledAt).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 max-w-xs truncate text-sm">{s.title}</td>
                    <td className="px-4 py-2"><Badge>{s.audience}</Badge></td>
                    <td className="px-4 py-2">
                      <Badge variant={s.status === 'pending' ? 'amber' : s.status === 'sent' ? 'green' : s.status === 'cancelled' ? 'red' : 'red'}>
                        {s.status}
                      </Badge>
                      {s.status === 'sent' && <div className="mt-0.5 text-[10px] text-slate-500">{s.sentCount} sent / {s.failedCount} failed</div>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.status === 'pending' && (
                        <button onClick={() => cancelScheduled(s.id)} className="rounded border border-red-300 px-2 py-1 text-[10px] text-red-700">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Select, Switch, Button, Badge, useConfirm, useToast } from '../../../components/ui';

export default function PopupsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() { setLoading(true); try { setList(await api.admin.popups()); } catch (e: any) { toast.error(e?.message); } setLoading(false); }
  useEffect(() => { void load(); }, []);

  async function toggle(p: any) {
    try { await api.admin.updatePopup(p.id, { isActive: !p.isActive }); void load(); } catch (e: any) { toast.error(e?.message); }
  }
  async function del(p: any) {
    const ok = await confirm({ title: 'Hapus popup', message: `Yakin hapus "${p.title}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deletePopup(p.id); toast.success('Popup dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pop-up Promo</h1>
          <p className="text-sm text-slate-500">Pop-up yg muncul di mobile saat trigger event (app open / post login / booking complete).</p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Buat Pop-up</Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : list.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
          <Megaphone size={28} className="mx-auto mb-2 text-slate-400" />
          Belum ada pop-up.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-md border bg-white">
              {p.imageUrl && <img src={p.imageUrl} alt={p.title} className="h-32 w-full object-cover" />}
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <h3 className="truncate text-sm font-semibold">{p.title}</h3>
                  <Badge>{p.audience}</Badge>
                </div>
                {p.body && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.body}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="blue">{p.triggerEvent}</Badge>
                  {p.maxShowPerUser > 0 && <Badge>max {p.maxShowPerUser}x/user</Badge>}
                  {p.priority > 0 && <Badge variant="amber">priority {p.priority}</Badge>}
                </div>
                <div className="mt-2 text-[10px] text-slate-500">
                  Views: {p.viewCount} Â· CTA Clicks: {p.clickCount}
                </div>
                <div className="mt-2 flex justify-between">
                  <button onClick={() => toggle(p)}>{p.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</button>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil size={11} />} onClick={() => setEditing(p)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} onClick={() => del(p)}>Hapus</Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && <PopupFormModal popup={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

async function uploadImage(file: File): Promise<string | null> {
  try {
    const { uploadUrl, publicUrl } = await api.admin.cmsUploadUrl(file.type, 'popups');
    const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
    if (!res.ok) throw new Error('Upload gagal');
    return publicUrl;
  } catch { return null; }
}

function PopupFormModal({ popup, onClose, onSaved }: { popup: any | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!popup;
  const [form, setForm] = useState({
    title: popup?.title ?? '',
    body: popup?.body ?? '',
    imageUrl: popup?.imageUrl ?? '',
    ctaLabel: popup?.ctaLabel ?? '',
    ctaLink: popup?.ctaLink ?? '',
    audience: popup?.audience ?? 'all',
    triggerEvent: popup?.triggerEvent ?? 'app_open',
    maxShowPerUser: popup?.maxShowPerUser ?? 1,
    priority: popup?.priority ?? 0,
    startsAt: popup?.startsAt ? new Date(popup.startsAt).toISOString().slice(0, 16) : '',
    endsAt: popup?.endsAt ? new Date(popup.endsAt).toISOString().slice(0, 16) : '',
    isActive: popup?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.title) e.title = 'Wajib.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const payload = {
        ...form,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      };
      if (isEdit) await api.admin.updatePopup(popup.id, payload);
      else await api.admin.createPopup(payload);
      toast.success(isEdit ? 'Popup di-update.' : 'Popup dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${popup.title}` : 'Buat Pop-up Baru'}
      open={true}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Simpan</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Judul" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} error={errors.title} placeholder="Diskon 50% Bersih Kamar!" />
        <Textarea label="Pesan" rows={3} value={form.body} onChange={(v) => setForm({ ...form, body: v })} placeholder="Promo terbatas â€” pakai code JBSIH50 dapat diskon 50%." />

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Gambar (opsional)</label>
          {form.imageUrl && <img src={form.imageUrl} alt="" className="mb-2 h-32 rounded border object-cover" />}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              const url = await uploadImage(f);
              setUploading(false);
              if (url) { setForm({ ...form, imageUrl: url }); toast.success('Image ter-upload.'); }
              else toast.error('Upload gagal.');
            }}
            className="w-full text-xs"
          />
          {uploading && <div className="mt-1 text-xs text-slate-500">Uploadingâ€¦</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="CTA Label" value={form.ctaLabel} onChange={(v) => setForm({ ...form, ctaLabel: v })} placeholder="Klaim Sekarang" />
          <Input label="CTA Link" value={form.ctaLink} onChange={(v) => setForm({ ...form, ctaLink: v })} placeholder="jasabersih://booking/new atau https://..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Audience" value={form.audience} options={[
            { value: 'all', label: 'Semua' },
            { value: 'customer', label: 'Customer' },
            { value: 'cleaner', label: 'Cleaner' },
            { value: 'new_customer', label: 'New Customer (< 7 hari)' },
          ]} onChange={(v) => setForm({ ...form, audience: v })} />
          <Select label="Trigger Event" value={form.triggerEvent} options={[
            { value: 'app_open', label: 'App Open (saat buka app)' },
            { value: 'post_login', label: 'Post Login (setelah login)' },
            { value: 'booking_complete', label: 'After Booking Complete' },
          ]} onChange={(v) => setForm({ ...form, triggerEvent: v })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Max tampil per user" type="number" value={String(form.maxShowPerUser)} onChange={(v) => setForm({ ...form, maxShowPerUser: Number(v) })} helpText="0 = unlimited" />
          <Input label="Priority" type="number" value={String(form.priority)} onChange={(v) => setForm({ ...form, priority: Number(v) })} helpText="Higher = tampil duluan." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Mulai (opsional)" type="datetime-local" value={form.startsAt} onChange={(v) => setForm({ ...form, startsAt: v })} />
          <Input label="Berakhir (opsional)" type="datetime-local" value={form.endsAt} onChange={(v) => setForm({ ...form, endsAt: v })} />
        </div>

        {isEdit && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={form.isActive ? 'Aktif' : 'Nonaktif'} />
          </div>
        )}
      </div>
    </Modal>
  );
}

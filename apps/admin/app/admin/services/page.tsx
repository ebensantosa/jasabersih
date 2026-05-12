'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, Button, Input, Modal, Switch, Textarea, useConfirm, useToast } from '../../../components/ui';

async function uploadToR2(file: File, folder: string): Promise<string | null> {
  try {
    const { uploadUrl, publicUrl } = await api.admin.cmsUploadUrl(file.type, folder);
    const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
    if (!res.ok) throw new Error('Upload gagal');
    return publicUrl;
  } catch { return null; }
}

function ImageUpload({ value, onChange, folder }: { value: string; onChange: (url: string) => void; folder: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">Icon Layanan</label>
      {value && <img src={value} alt="" className="mb-2 h-24 w-24 rounded border object-cover" />}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          const url = await uploadToR2(f, folder);
          setBusy(false);
          if (url) { onChange(url); toast.success('Image ter-upload.'); }
          else toast.error('Upload gagal.');
        }}
        className="w-full text-xs"
      />
      {busy && <div className="mt-1 text-xs text-slate-500">Uploading…</div>}
    </div>
  );
}

export default function ServicesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.configServices()); } catch (e: any) { toast.error(e?.message); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function del(s: any) {
    const ok = await confirm({ title: 'Hapus layanan', message: `Yakin hapus "${s.name}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deleteService(s.id); toast.success('Dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Layanan</h1>
          <p className="text-sm text-slate-500">Atur nama, deskripsi, dan icon layanan yang muncul di home customer.</p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Layanan</Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border bg-white">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Memuat…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Icon</th><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Code</th><th className="px-4 py-2">Tampil di Home</th><th className="px-4 py-2">Sort</th><th className="px-4 py-2 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">
                    {s.iconUrl
                      ? <img src={s.iconUrl} alt="" className="h-12 w-12 rounded object-cover border" />
                      : <div className="h-12 w-12 rounded bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">no icon</div>}
                  </td>
                  <td className="px-4 py-2 font-medium">{s.name}<div className="text-[11px] text-slate-500">{s.description ?? '—'}</div></td>
                  <td className="px-4 py-2"><Badge>{s.code}</Badge></td>
                  <td className="px-4 py-2"><Badge>{s.showOnHome ? 'Ya' : 'Tidak'}</Badge></td>
                  <td className="px-4 py-2 text-xs">{s.displayOrder}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(s)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del(s)}>Hapus</Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada layanan.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {editing !== null && <ServiceFormModal service={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function ServiceFormModal({ service, onClose, onSaved }: { service: any | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!service;
  const [form, setForm] = useState({
    code: service?.code ?? '',
    name: service?.name ?? '',
    description: service?.description ?? '',
    iconUrl: service?.iconUrl ?? '',
    showOnHome: service?.showOnHome ?? true,
    displayOrder: service?.displayOrder ?? 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.code) e.code = 'Wajib.';
    if (!form.name) e.name = 'Wajib.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (isEdit) await api.admin.updateService(service.id, form);
      else await api.admin.createService(form);
      toast.success(isEdit ? 'Di-update.' : 'Dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${service.name}` : 'Tambah Layanan'}
      open={true}
      onClose={onClose}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Simpan</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Code" required value={form.code} onChange={(v) => isEdit ? null : setForm({ ...form, code: v })} error={errors.code} placeholder="kamar, dapur, kantor" helpText={isEdit ? 'Tidak bisa diubah setelah dibuat.' : 'Lowercase, tanpa spasi.'} />
        <Input label="Nama" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="Bersih Kamar" />
        <Textarea label="Deskripsi" rows={2} value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Cleaning kamar tidur" />
        <ImageUpload value={form.iconUrl} onChange={(url) => setForm({ ...form, iconUrl: url })} folder="services" />
        <Input label="Sort Order" type="number" value={String(form.displayOrder)} onChange={(v) => setForm({ ...form, displayOrder: Number(v) || 0 })} helpText="Angka kecil tampil duluan." />
        <Switch checked={form.showOnHome} onChange={(v) => setForm({ ...form, showOnHome: v })} label={form.showOnHome ? 'Tampil di Home' : 'Sembunyikan dari Home'} />
      </div>
    </Modal>
  );
}

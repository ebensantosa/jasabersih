'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, Button, Input, Modal, Switch, Textarea, useConfirm, useToast } from '../../../components/ui';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 2;

async function uploadToR2(file: File, folder: string): Promise<{ url: string | null; error?: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: 'Format harus JPG, PNG, atau WebP.' };
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return { url: null, error: `Ukuran maksimal ${MAX_SIZE_MB}MB (file kamu ${(file.size / 1024 / 1024).toFixed(1)}MB).` };
  }
  try {
    const { uploadUrl, publicUrl } = await api.admin.cmsUploadUrl(file.type, folder);
    const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
    if (!res.ok) return { url: null, error: `Upload ke R2 gagal (HTTP ${res.status}).` };
    return { url: publicUrl };
  } catch (e: any) {
    return { url: null, error: e?.message ?? 'Network error saat upload.' };
  }
}

function ImageUpload({ value, onChange, folder, label, previewClass, hint }: {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  label?: string;
  previewClass?: string;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label ?? 'Gambar'}</label>
      {value && <img src={value} alt="" className={`mb-2 rounded border object-cover ${previewClass ?? 'h-24 w-24'}`} />}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          const { url, error } = await uploadToR2(f, folder);
          setBusy(false);
          if (url) { onChange(url); toast.success('Image ter-upload.'); }
          else toast.error(error ?? 'Upload gagal.');
          (e.target as HTMLInputElement).value = ''; // allow same-file re-pick
        }}
        className="w-full text-xs"
      />
      <p className="mt-1 text-[10px] text-slate-500">{hint ?? `JPG, PNG, atau WebP. Max ${MAX_SIZE_MB}MB.`}</p>
      {busy && <div className="mt-1 text-xs text-slate-500">Uploadingâ€¦</div>}
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
          <div className="py-12 text-center text-sm text-slate-500">Memuatâ€¦</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Icon</th><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Code</th><th className="px-4 py-2">Jenis</th><th className="px-4 py-2">Home</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Sort</th><th className="px-4 py-2 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">
                    {s.iconUrl
                      ? <img src={s.iconUrl} alt="" className="h-12 w-12 rounded object-cover border" />
                      : <div className="h-12 w-12 rounded bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">no icon</div>}
                  </td>
                  <td className="px-4 py-2 font-medium">{s.name}<div className="text-[11px] text-slate-500">{s.description ?? 'â€”'}</div></td>
                  <td className="px-4 py-2"><Badge>{s.code}</Badge></td>
                  <td className="px-4 py-2">{s.isBundle ? <Badge variant="amber">ðŸŽ Paket Lengkap</Badge> : <Badge>Reguler</Badge>}</td>
                  <td className="px-4 py-2"><Badge variant={s.showOnHome ? 'green' : 'red'}>{s.showOnHome ? 'Ya' : 'Tidak'}</Badge></td>
                  <td className="px-4 py-2"><Badge variant={s.isActive ? 'green' : 'red'}>{s.isActive ? 'ðŸŸ¢ Aktif' : 'ðŸ”´ Off'}</Badge></td>
                  <td className="px-4 py-2 text-xs">{s.displayOrder}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(s)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del(s)}>Hapus</Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada layanan.</td></tr>}
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
    coverImageUrl: service?.coverImageUrl ?? '',
    showOnHome: service?.showOnHome ?? true,
    isBundle: service?.isBundle ?? false,
    isActive: service?.isActive ?? true,
    displayOrder: service?.displayOrder ?? 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // === Detail Pekerjaan (scope JSON di pricing_packages) ===
  const [pkgNote, setPkgNote] = useState('');
  const [pkgIncludes, setPkgIncludes] = useState<string[]>([]);
  const [pkgPrice, setPkgPrice] = useState<number>(0);
  const [pkgDuration, setPkgDuration] = useState<number>(60);

  useEffect(() => {
    if (!isEdit) return;
    api.admin.getServicePackage(service.id)
      .then((p: any) => {
        setPkgNote(p?.note ?? '');
        setPkgIncludes(Array.isArray(p?.includes) ? p.includes : []);
        setPkgPrice(Number(p?.price ?? 0));
        setPkgDuration(Number(p?.durationMin ?? 60));
      })
      .catch(() => {});
  }, [isEdit, service?.id]);

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
      // Save package detail kalau edit mode
      if (isEdit) {
        await api.admin.updateServicePackage(service.id, {
          note: pkgNote,
          includes: pkgIncludes.filter((s) => s.trim().length > 0),
          price: pkgPrice > 0 ? pkgPrice : undefined,
          durationMin: pkgDuration > 0 ? pkgDuration : undefined,
        });
      }
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
      <div className="space-y-5">
        {/* === SECTION 1: Info Dasar === */}
        <section className="space-y-3">
          <div className="border-b pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Info Dasar
          </div>
          <Input label="Code" required value={form.code} onChange={(v) => isEdit ? null : setForm({ ...form, code: v })} error={errors.code} placeholder="kamar, dapur, kantor" helpText={isEdit ? 'Tidak bisa diubah setelah dibuat.' : 'Lowercase, tanpa spasi. Dipakai sebagai ID unik.'} />
          <Input label="Nama" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="Bersih Kamar" />
          <Textarea label="Deskripsi" rows={2} value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Cleaning kamar tidur 1 kamar 2 jam" />
        </section>

        {/* === SECTION 2: Tampilan Mobile === */}
        <section className="space-y-3">
          <div className="border-b pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Tampilan di Aplikasi Mobile
          </div>
          <div className="rounded border bg-slate-50 p-3 text-[12px] text-slate-600">
            <strong>Layanan Reguler</strong>: tampil di grid layanan di Home (Bersih Kamar, Bersih Dapur, dll).<br/>
            <strong>Paket Lengkap (Bundle)</strong>: tampil di section khusus "Paket Lengkap" â€” untuk combo all-in (Full House, Pasca Renovasi, Subscription).
          </div>
          <Switch
            checked={form.isBundle}
            onChange={(v) => setForm({ ...form, isBundle: v })}
            label={form.isBundle ? 'ðŸŽ Paket Lengkap (Bundle) â€” tampil di section "Paket Lengkap"' : 'ðŸ  Layanan Reguler â€” tampil di grid Home'}
          />
          <Switch
            checked={form.showOnHome}
            onChange={(v) => setForm({ ...form, showOnHome: v })}
            label={form.showOnHome ? 'âœ… Tampil di Home' : 'ðŸ™ˆ Disembunyikan dari Home'}
          />
          <Switch
            checked={form.isActive}
            onChange={(v) => setForm({ ...form, isActive: v })}
            label={form.isActive ? 'ðŸŸ¢ Layanan Aktif - bisa dipesan customer' : 'ðŸ”´ Tidak Tersedia - tampil grey di mobile, gak bisa dipesan (cocok buat maintenance)'}
          />
          <Input label="Sort Order" type="number" value={String(form.displayOrder)} onChange={(v) => setForm({ ...form, displayOrder: Number(v) || 0 })} helpText="Angka kecil tampil duluan (1 paling kiri/atas)." />
        </section>

        {/* === SECTION 3: Gambar === */}
        <section className="space-y-3">
          <div className="border-b pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Gambar
          </div>
          <ImageUpload
            label="Icon Layanan (kotak kecil di list)"
            value={form.iconUrl}
            onChange={(url) => setForm({ ...form, iconUrl: url })}
            folder="services"
            previewClass="h-24 w-24"
            hint="JPG/PNG/WebP, max 2MB. Square 200x200px disarankan."
          />
          <ImageUpload
            label="Cover Image (banner besar di halaman detail / Paket Lengkap)"
            value={form.coverImageUrl}
            onChange={(url) => setForm({ ...form, coverImageUrl: url })}
            folder="services/covers"
            previewClass="h-32 w-full"
            hint="JPG/PNG/WebP, max 2MB. Landscape 1200x600px disarankan."
          />
        </section>

        {/* === SECTION 4: Detail Pekerjaan (Paket Aktif) === */}
        {isEdit && (
          <section className="space-y-3">
            <div className="border-b pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Detail Pekerjaan (tampil di mobile)
            </div>
            <div className="rounded border bg-amber-50 p-3 text-[11px] text-amber-900">
              Bagian ini muncul di card <strong>"Yang Akan Dikerjakan Cleaner"</strong> di mobile.
              Edit di sini biar customer tahu detail pekerjaan tanpa tanya.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Harga (Rp)"
                type="number"
                value={String(pkgPrice)}
                onChange={(v) => setPkgPrice(Number(v) || 0)}
                helpText="Harga dasar paket (general clean)."
              />
              <Input
                label="Durasi (menit)"
                type="number"
                value={String(pkgDuration)}
                onChange={(v) => setPkgDuration(Number(v) || 60)}
                helpText="Estimasi waktu pengerjaan."
              />
            </div>

            <Textarea
              label="Deskripsi Pekerjaan"
              rows={3}
              value={pkgNote}
              onChange={setPkgNote}
              placeholder="Contoh: Cocok untuk kamar kotor ringanâ€“sedang. Jika ada kerak tebal/jamur biasanya perlu biaya tambahan."
            />

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Poin Pekerjaan (bullet âœ“)</label>
              <div className="space-y-2">
                {pkgIncludes.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => setPkgIncludes((arr) => arr.map((x, idx) => idx === i ? e.target.value : x))}
                      placeholder={`Poin ${i + 1}, contoh: Plafon & sarang laba-laba`}
                      className="flex-1 rounded border border-slate-200 px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setPkgIncludes((arr) => arr.filter((_, idx) => idx !== i))}
                      className="rounded border border-rose-200 bg-rose-50 px-2 text-xs font-bold text-rose-700"
                    >
                      Ã—
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPkgIncludes((arr) => [...arr, ''])}
                  className="rounded border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  + Tambah Poin
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Tap "+ Tambah Poin" untuk nambah baris. Tap Ã— buat hapus. Min 3 poin recommended.
              </p>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

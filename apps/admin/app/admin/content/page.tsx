'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, FileText, Megaphone, MapPin, Package, Plus, Sparkles, Trash2, Pencil, ExternalLink } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Select, Switch, Button, Badge, useConfirm, useToast } from '../../../components/ui';

// Layanan + Area Layanan are now standalone sidebar pages (/admin/services and /admin/areas).
type Tab = 'banners' | 'pages' | 'announcements' | 'packages' | 'addons';
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'banners', label: 'Banner', icon: ImageIcon },
  { key: 'pages', label: 'Halaman Statis', icon: FileText },
  { key: 'announcements', label: 'Pengumuman', icon: Megaphone },
  { key: 'packages', label: 'Paket Harga', icon: Package },
  { key: 'addons', label: 'Add-Ons', icon: Plus },
];

export default function CmsPage() {
  const [tab, setTab] = useState<Tab>('banners');
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Content / CMS</h1>
      <p className="text-sm text-slate-500">Banner, halaman statis, pengumuman, area, paket harga, add-ons.</p>
      <div className="mt-4 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'banners' && <BannersTab />}
        {tab === 'pages' && <PagesTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
        {tab === 'packages' && <PackagesTab />}
        {tab === 'addons' && <AddonsTab />}
      </div>
    </div>
  );
}

const ALLOWED_IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMG_MB = 2;

async function uploadToR2(file: File, folder: string): Promise<{ url: string | null; error?: string }> {
  if (!ALLOWED_IMG_TYPES.includes(file.type)) {
    return { url: null, error: 'Format harus JPG, PNG, atau WebP.' };
  }
  if (file.size > MAX_IMG_MB * 1024 * 1024) {
    return { url: null, error: `Ukuran maksimal ${MAX_IMG_MB}MB (file kamu ${(file.size / 1024 / 1024).toFixed(1)}MB).` };
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

function ImageUpload({ value, onChange, folder }: { value: string; onChange: (url: string) => void; folder: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">Gambar</label>
      {value && <img src={value} alt="preview" className="mb-2 h-32 rounded border object-cover" />}
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
          (e.target as HTMLInputElement).value = '';
        }}
        className="w-full text-xs"
      />
      <p className="mt-1 text-[10px] text-slate-500">JPG, PNG, atau WebP. Max {MAX_IMG_MB}MB.</p>
      {busy && <div className="mt-1 text-xs text-slate-500">Uploading…</div>}
    </div>
  );
}

// ============ BANNERS ============
function BannersTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() { try { setList(await api.admin.banners()); } catch (e: any) { toast.error(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function del(b: any) {
    const ok = await confirm({ title: 'Hapus banner', message: `Yakin hapus "${b.title}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deleteBanner(b.id); toast.success('Banner dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }
  async function toggle(b: any) {
    try { await api.admin.updateBanner(b.id, { isActive: !b.isActive }); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex justify-between"><h2 className="text-base font-semibold">Banner ({list.length})</h2><Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Banner</Button></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.map((b) => (
          <div key={b.id} className="overflow-hidden rounded-md border bg-white">
            <img src={b.imageUrl} alt={b.title} className="h-32 w-full object-cover" />
            <div className="p-3">
              <div className="flex items-center justify-between">
                <h3 className="truncate text-sm font-semibold">{b.title}</h3>
                <Badge>{b.placement}</Badge>
              </div>
              {b.subtitle && <p className="mt-1 truncate text-xs text-slate-500">{b.subtitle}</p>}
              {b.linkUrl && <a href={b.linkUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-blue-700"><ExternalLink size={11} /> {b.linkUrl}</a>}
              <div className="mt-3 flex justify-between">
                <button onClick={() => toggle(b)}>{b.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</button>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil size={11} />} onClick={() => setEditing(b)}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} onClick={() => del(b)}>Hapus</Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {editing !== null && <BannerFormModal banner={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function BannerFormModal({ banner, onClose, onSaved }: { banner: any | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!banner;
  const [form, setForm] = useState({
    title: banner?.title ?? '',
    subtitle: banner?.subtitle ?? '',
    imageUrl: banner?.imageUrl ?? '',
    linkUrl: banner?.linkUrl ?? '',
    placement: banner?.placement ?? 'home_hero',
    displayOrder: banner?.displayOrder ?? 0,
    isActive: banner?.isActive ?? true,
    startsAt: banner?.startsAt ? new Date(banner.startsAt).toISOString().slice(0, 16) : '',
    endsAt: banner?.endsAt ? new Date(banner.endsAt).toISOString().slice(0, 16) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.title) e.title = 'Wajib.';
    if (!form.imageUrl) e.imageUrl = 'Upload image dulu.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const payload = {
        ...form,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      };
      if (isEdit) await api.admin.updateBanner(banner.id, payload);
      else await api.admin.createBanner(payload);
      toast.success(isEdit ? 'Banner di-update.' : 'Banner dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${banner.title}` : 'Tambah Banner'}
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
        <Input label="Judul" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} error={errors.title} />
        <Input label="Subtitle (opsional)" value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })} />
        <ImageUpload value={form.imageUrl} onChange={(v) => setForm({ ...form, imageUrl: v })} folder="banners" />
        {errors.imageUrl && <p className="text-xs text-red-600">{errors.imageUrl}</p>}
        <Input label="Link URL (opsional)" value={form.linkUrl} onChange={(v) => setForm({ ...form, linkUrl: v })} placeholder="https://..." />
        <Select
          label="Placement" required value={form.placement}
          options={[
            { value: 'home_hero', label: 'Home Hero (utama)' },
            { value: 'home_promo', label: 'Home Promo (carousel)' },
            { value: 'cleaner_home', label: 'Cleaner Home' },
          ]}
          onChange={(v) => setForm({ ...form, placement: v })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Sort Order" type="number" value={String(form.displayOrder)} onChange={(v) => setForm({ ...form, displayOrder: Number(v) })} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={form.isActive ? 'Aktif' : 'Nonaktif'} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Mulai (opsional)" type="datetime-local" value={form.startsAt} onChange={(v) => setForm({ ...form, startsAt: v })} />
          <Input label="Berakhir (opsional)" type="datetime-local" value={form.endsAt} onChange={(v) => setForm({ ...form, endsAt: v })} />
        </div>
      </div>
    </Modal>
  );
}

// ============ PAGES ============
function PagesTab() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<{ slug: string; title: string; bodyMarkdown: string; audience: string } | null>(null);

  async function load() { try { setList(await api.admin.pages()); } catch (e: any) { toast.error(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function openEdit(slug: string) {
    try { const p = await api.admin.getPage(slug); setEditing(p); } catch (e: any) { toast.error(e?.message); }
  }
  async function publish(p: any) {
    try { await api.admin.publishPage(p.id, !p.isPublished); toast.success(p.isPublished ? 'Halaman di-unpublish.' : 'Halaman di-publish.'); void load(); }
    catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex justify-between"><h2 className="text-base font-semibold">Halaman Statis ({list.length})</h2><Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({ slug: '', title: '', bodyMarkdown: '', audience: 'public' })}>Halaman Baru</Button></div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Slug</th><th className="px-4 py-2">Judul</th>
              <th className="px-4 py-2">Audience</th><th className="px-4 py-2">Panjang</th>
              <th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">Belum ada halaman. Bikin <b>terms</b>, <b>privacy</b>, <b>about</b>, <b>faq</b>.</td></tr>
            ) : list.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{p.slug}</td>
                <td className="px-4 py-2 font-medium">{p.title}</td>
                <td className="px-4 py-2"><Badge>{p.audience}</Badge></td>
                <td className="px-4 py-2 text-xs">{p.bodyLength} char</td>
                <td className="px-4 py-2">
                  <button onClick={() => publish(p)}>{p.isPublished ? <Badge variant="green">published</Badge> : <Badge variant="amber">draft</Badge>}</button>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => openEdit(p.slug)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PageFormModal page={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function PageFormModal({ page, onClose, onSaved }: { page: { slug: string; title: string; bodyMarkdown: string; audience: string }; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState(page);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.slug) e.slug = 'Wajib.';
    if (!form.title) e.title = 'Wajib.';
    if (!form.bodyMarkdown) e.bodyMarkdown = 'Wajib.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await api.admin.upsertPage(form); toast.success('Halaman tersimpan.'); onSaved(); }
    catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={page.slug ? `Edit: ${form.slug}` : 'Halaman Baru'}
      open={true}
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Simpan</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Slug (URL)" required value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} error={errors.slug} placeholder="terms / privacy / about / faq" />
        <Input label="Judul" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} error={errors.title} />
        <Select label="Audience" value={form.audience} options={[{ value: 'public', label: 'Public (semua)' }, { value: 'customer', label: 'Customer only' }, { value: 'cleaner', label: 'Cleaner only' }]} onChange={(v) => setForm({ ...form, audience: v })} />
        <Textarea label="Body (Markdown)" mono required rows={14} value={form.bodyMarkdown} onChange={(v) => setForm({ ...form, bodyMarkdown: v })} helpText="Markdown — header (#), bold (**), list (-), link [text](url)." />
        {errors.bodyMarkdown && <p className="text-xs text-red-600">{errors.bodyMarkdown}</p>}
      </div>
    </Modal>
  );
}

// ============ ANNOUNCEMENTS ============
function AnnouncementsTab() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);

  async function load() { try { setList(await api.admin.announcements()); } catch (e: any) { toast.error(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function toggle(a: any) {
    try { await api.admin.updateAnnouncement(a.id, { isActive: !a.isActive }); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex justify-between"><h2 className="text-base font-semibold">Pengumuman ({list.length})</h2><Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Tambah</Button></div>
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a.id} className={`rounded-md border p-3 ${a.severity === 'critical' ? 'border-red-300 bg-red-50' : a.severity === 'warning' ? 'border-amber-300 bg-amber-50' : 'border-blue-300 bg-blue-50'}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2"><h3 className="text-sm font-bold">{a.title}</h3><Badge>{a.severity}</Badge><Badge>{a.audience}</Badge></div>
                <p className="mt-1 text-sm text-slate-700">{a.body}</p>
                <p className="mt-1 text-[10px] text-slate-500">{new Date(a.startsAt).toLocaleString('id-ID')} {a.endsAt ? `→ ${new Date(a.endsAt).toLocaleString('id-ID')}` : ''}</p>
              </div>
              <button onClick={() => toggle(a)}>{a.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</button>
            </div>
          </div>
        ))}
      </div>
      {adding && <AnnouncementFormModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}
    </div>
  );
}

function AnnouncementFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', severity: 'info', endsAt: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.title) e.title = 'Wajib.';
    if (!form.body) e.body = 'Wajib.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.admin.createAnnouncement({ ...form, endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined });
      toast.success('Pengumuman dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="Tambah Pengumuman"
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Simpan</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Judul" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} error={errors.title} />
        <Textarea label="Pesan" required rows={4} value={form.body} onChange={(v) => setForm({ ...form, body: v })} />
        {errors.body && <p className="text-xs text-red-600">{errors.body}</p>}
        <Select label="Audience" value={form.audience} options={[{ value: 'all', label: 'Semua' }, { value: 'customer', label: 'Customer' }, { value: 'cleaner', label: 'Cleaner' }]} onChange={(v) => setForm({ ...form, audience: v })} />
        <Select label="Severity" value={form.severity} options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]} onChange={(v) => setForm({ ...form, severity: v })} />
        <Input label="Berakhir (opsional)" type="datetime-local" value={form.endsAt} onChange={(v) => setForm({ ...form, endsAt: v })} />
      </div>
    </Modal>
  );
}

// ============ AREAS ============
function AreasTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() { try { setList(await api.admin.serviceAreas()); } catch (e: any) { toast.error(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function toggle(a: any) {
    try { await api.admin.updateServiceArea(a.id, { isActive: !a.isActive }); void load(); } catch (e: any) { toast.error(e?.message); }
  }
  async function del(a: any) {
    const ok = await confirm({ title: 'Hapus area', message: `Yakin hapus "${a.name}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deleteServiceArea(a.id); toast.success('Area dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex justify-between"><h2 className="text-base font-semibold">Area Layanan ({list.length})</h2><Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Area</Button></div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Nama</th><th className="px-4 py-2">Kota</th>
              <th className="px-4 py-2">Koordinat</th><th className="px-4 py-2">Radius (m)</th>
              <th className="px-4 py-2">Surge</th><th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2">{a.city}</td>
                <td className="px-4 py-2 font-mono text-xs">{Number(a.lat).toFixed(4)}, {Number(a.lng).toFixed(4)}</td>
                <td className="px-4 py-2">{a.radiusM}</td>
                <td className="px-4 py-2"><Badge variant={Number(a.surgeMultiplier) > 1 ? 'amber' : 'slate'}>{Number(a.surgeMultiplier).toFixed(2)}x</Badge></td>
                <td className="px-4 py-2"><button onClick={() => toggle(a)}>{a.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</button></td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(a)}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del(a)}>Hapus</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== null && <AreaFormModal area={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function AreaFormModal({ area, onClose, onSaved }: { area: any | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!area;
  const [form, setForm] = useState({
    name: area?.name ?? '',
    city: area?.city ?? '',
    lat: area?.lat ?? -6.2,
    lng: area?.lng ?? 106.8,
    radiusM: area?.radiusM ?? 5000,
    surgeMultiplier: area?.surgeMultiplier ?? 1.0,
    notes: area?.notes ?? '',
    isActive: area?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.name) e.name = 'Wajib.';
    if (!form.city) e.city = 'Wajib.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (isEdit) await api.admin.updateServiceArea(area.id, { isActive: form.isActive, surgeMultiplier: Number(form.surgeMultiplier), radiusM: Number(form.radiusM), notes: form.notes });
      else await api.admin.createServiceArea({ ...form, lat: Number(form.lat), lng: Number(form.lng), radiusM: Number(form.radiusM), surgeMultiplier: Number(form.surgeMultiplier) });
      toast.success(isEdit ? 'Area di-update.' : 'Area dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${area.name}` : 'Tambah Area'}
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Simpan</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Nama Area" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="Kelapa Gading" />
        <Input label="Kota" required value={form.city} onChange={(v) => setForm({ ...form, city: v })} error={errors.city} placeholder="Jakarta Utara" />
        {!isEdit && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude" type="number" value={String(form.lat)} onChange={(v) => setForm({ ...form, lat: Number(v) })} />
            <Input label="Longitude" type="number" value={String(form.lng)} onChange={(v) => setForm({ ...form, lng: Number(v) })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Radius (meter)" type="number" value={String(form.radiusM)} onChange={(v) => setForm({ ...form, radiusM: Number(v) })} />
          <Input label="Surge Multiplier" type="number" value={String(form.surgeMultiplier)} onChange={(v) => setForm({ ...form, surgeMultiplier: Number(v) })} helpText="1.0 = normal, 1.5 = +50%" />
        </div>
        <Textarea label="Catatan" rows={2} value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
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

// ============ PACKAGES ============
function PackagesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() {
    try { const [pkgs, svcs] = await Promise.all([api.admin.packages(), api.admin.configServices()]); setList(pkgs); setServices(svcs); }
    catch (e: any) { toast.error(e?.message); }
  }
  useEffect(() => { void load(); }, []);

  async function del(p: any) {
    const ok = await confirm({ title: 'Nonaktifkan paket', message: `Yakin nonaktifkan "${p.name}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deletePackage(p.id); toast.success('Paket nonaktifkan.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }
  async function toggle(p: any) {
    try { await api.admin.updatePackage(p.id, { isActive: !p.isActive }); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex justify-between"><h2 className="text-base font-semibold">Paket Harga ({list.length})</h2><Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Paket</Button></div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Service</th><th className="px-4 py-2">Paket</th>
              <th className="px-4 py-2">Harga</th><th className="px-4 py-2">Durasi</th>
              <th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 text-xs text-slate-600">{p.serviceName ?? '—'}</td>
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2 font-mono">Rp {Number(p.price).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2 text-xs">{p.durationMin} min</td>
                <td className="px-4 py-2"><button onClick={() => toggle(p)}>{p.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</button></td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(p)}>Edit</Button>
                  {p.isActive && <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del(p)}>Hapus</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== null && <PackageFormModal pkg={editing.id ? editing : null} services={services} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function PackageFormModal({ pkg, services, onClose, onSaved }: { pkg: any | null; services: any[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!pkg;
  const [form, setForm] = useState({
    serviceId: pkg?.serviceId ?? '',
    name: pkg?.name ?? '',
    price: Number(pkg?.price ?? 0),
    durationMin: pkg?.durationMin ?? 60,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!isEdit && !form.serviceId) e.serviceId = 'Wajib.';
    if (!form.name) e.name = 'Wajib.';
    if (!form.price || form.price <= 0) e.price = 'Wajib > 0.';
    if (!form.durationMin || form.durationMin <= 0) e.durationMin = 'Wajib > 0.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (isEdit) await api.admin.updatePackage(pkg.id, { name: form.name, price: form.price, durationMin: form.durationMin });
      else await api.admin.createPackage(form);
      toast.success(isEdit ? 'Paket di-update.' : 'Paket dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${pkg.name}` : 'Tambah Paket Harga'}
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Simpan</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {!isEdit && (
          <Select
            label="Service" required value={form.serviceId}
            options={[{ value: '', label: '— pilih —' }, ...services.map((s: any) => ({ value: s.id, label: s.name }))]}
            onChange={(v) => setForm({ ...form, serviceId: v })}
          />
        )}
        {errors.serviceId && <p className="text-xs text-red-600">{errors.serviceId}</p>}
        <Input label="Nama Paket" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="Bersih 2 Kamar" />
        <Input label="Harga (Rupiah)" type="number" required value={String(form.price)} onChange={(v) => setForm({ ...form, price: Number(v) })} error={errors.price} />
        <Input label="Durasi (menit)" type="number" required value={String(form.durationMin)} onChange={(v) => setForm({ ...form, durationMin: Number(v) })} error={errors.durationMin} />
      </div>
    </Modal>
  );
}

// ============ ADD-ONS ============
function AddonsTab() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() { try { setList(await api.admin.addons()); } catch (e: any) { toast.error(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function toggle(a: any) {
    try { await api.admin.updateAddon(a.id, { isActive: !a.isActive }); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex justify-between"><h2 className="text-base font-semibold">Add-Ons ({list.length})</h2><Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Add-On</Button></div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Code</th><th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Harga</th><th className="px-4 py-2">Durasi</th>
              <th className="px-4 py-2">Deskripsi</th><th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{a.code ?? '—'}</td>
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2 font-mono">Rp {Number(a.price).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2 text-xs">{a.durationMin} min</td>
                <td className="px-4 py-2 max-w-xs truncate text-xs text-slate-600">{a.description ?? '—'}</td>
                <td className="px-4 py-2"><button onClick={() => toggle(a)}>{a.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</button></td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(a)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== null && <AddonFormModal addon={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function AddonFormModal({ addon, onClose, onSaved }: { addon: any | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!addon;
  const [form, setForm] = useState({
    code: addon?.code ?? '',
    name: addon?.name ?? '',
    price: Number(addon?.price ?? 0),
    durationMin: addon?.durationMin ?? 30,
    description: addon?.description ?? '',
    isActive: addon?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.name) e.name = 'Wajib.';
    if (!form.price || form.price <= 0) e.price = 'Wajib > 0.';
    if (!form.durationMin) e.durationMin = 'Wajib > 0.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (isEdit) await api.admin.updateAddon(addon.id, form);
      else await api.admin.createAddon(form);
      toast.success(isEdit ? 'Add-on di-update.' : 'Add-on dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${addon.name}` : 'Tambah Add-On'}
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Simpan</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Code (opsional)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="setrika_30m" />
        <Input label="Nama" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Harga (Rupiah)" type="number" required value={String(form.price)} onChange={(v) => setForm({ ...form, price: Number(v) })} error={errors.price} />
          <Input label="Durasi (menit)" type="number" required value={String(form.durationMin)} onChange={(v) => setForm({ ...form, durationMin: Number(v) })} error={errors.durationMin} />
        </div>
        <Textarea label="Deskripsi" rows={2} value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
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

// ============ SERVICES (icons / display) ============
function ServicesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() {
    try { setList(await api.admin.configServices()); }
    catch (e: any) { toast.error(e?.message); }
  }
  useEffect(() => { void load(); }, []);

  async function del(s: any) {
    const ok = await confirm({ title: 'Hapus layanan', message: `Yakin hapus "${s.name}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deleteService(s.id); toast.success('Layanan dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Layanan ({list.length})</h2>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Layanan</Button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Atur nama, deskripsi, dan icon yang muncul di home customer & list layanan.</p>
      <div className="mt-4 overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Icon</th><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Code</th><th className="px-4 py-2">Tampil di Home</th><th className="px-4 py-2">Sort</th><th className="px-4 py-2">Aksi</th></tr>
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
      toast.success(isEdit ? 'Layanan di-update.' : 'Layanan dibuat.');
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
        <Input label="Code" required value={form.code} onChange={(v) => isEdit ? null : setForm({ ...form, code: v })} error={errors.code} placeholder="kamar, dapur, kantor, dll" helpText={isEdit ? 'Tidak bisa diubah setelah dibuat.' : 'Lowercase, tanpa spasi.'} />
        <Input label="Nama" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="Bersih Kamar" />
        <Textarea label="Deskripsi" rows={2} value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Cleaning kamar tidur" />
        <ImageUpload value={form.iconUrl} onChange={(url) => setForm({ ...form, iconUrl: url })} folder="services" />
        <Input label="Sort Order" type="number" value={String(form.displayOrder)} onChange={(v) => setForm({ ...form, displayOrder: Number(v) || 0 })} helpText="Angka kecil tampil duluan." />
        <Switch checked={form.showOnHome} onChange={(v) => setForm({ ...form, showOnHome: v })} label={form.showOnHome ? 'Tampil di Home' : 'Sembunyikan dari Home'} />
      </div>
    </Modal>
  );
}

// ============ CITY REQUESTS ============
function CityRequestsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.listCityRequests()); }
    catch (e: any) { toast.error(e?.message); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function delEntry(id: string, city: string) {
    const ok = await confirm({ title: 'Hapus request', message: `Hapus 1 entry untuk "${city}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deleteCityRequest(id); toast.success('Dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold">Request Kota Baru ({list.length} kota)</h2>
      <p className="mt-1 text-xs text-slate-500">Customer di kota yang belum dilayani submit lewat mobile app. Diurutkan berdasarkan jumlah request terbanyak.</p>
      {loading ? (
        <div className="mt-8 text-center text-sm text-slate-500">Memuat…</div>
      ) : list.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
          Belum ada request kota baru. Customer di luar coverage akan mengisi form dari mobile.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {list.map((r: any) => (
            <div key={r.city} className="rounded-md border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-bold capitalize text-slate-900">{r.city}</div>
                  <div className="text-xs text-slate-500">
                    {r.requestCount} request · terakhir {new Date(r.lastRequestAt).toLocaleDateString('id-ID')}
                    {r.provinces?.length > 0 && ` · ${r.provinces.join(', ')}`}
                  </div>
                </div>
                <Badge>{r.requestCount}×</Badge>
              </div>
              {r.samples?.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">Lihat detail kontak ({r.samples.length})</summary>
                  <table className="mt-2 w-full text-xs">
                    <thead className="bg-slate-50 text-left text-[10px] uppercase text-slate-500">
                      <tr><th className="px-2 py-1">Tanggal</th><th className="px-2 py-1">Nama</th><th className="px-2 py-1">HP</th><th className="px-2 py-1">Catatan</th><th className="px-2 py-1"></th></tr>
                    </thead>
                    <tbody>
                      {r.samples.map((s: any) => (
                        <tr key={s.id} className="border-t">
                          <td className="px-2 py-1">{new Date(s.createdAt).toLocaleString('id-ID')}</td>
                          <td className="px-2 py-1">{s.contactName ?? '—'}</td>
                          <td className="px-2 py-1">{s.contactPhone ?? '—'}</td>
                          <td className="px-2 py-1">{s.notes ?? '—'}</td>
                          <td className="px-2 py-1">
                            <button onClick={() => delEntry(s.id, r.city)} className="text-red-600 hover:underline">Hapus</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, FileText, Megaphone, MapPin, Package, Plus, Trash2, X, ExternalLink } from 'lucide-react';

import { api } from '../../../lib/api';

type Tab = 'banners' | 'pages' | 'announcements' | 'areas' | 'packages' | 'addons';
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'banners', label: 'Banner', icon: ImageIcon },
  { key: 'pages', label: 'Halaman Statis', icon: FileText },
  { key: 'announcements', label: 'Pengumuman', icon: Megaphone },
  { key: 'areas', label: 'Area Layanan', icon: MapPin },
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
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${
              tab === t.key ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'banners' && <BannersTab />}
        {tab === 'pages' && <PagesTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
        {tab === 'areas' && <AreasTab />}
        {tab === 'packages' && <PackagesTab />}
        {tab === 'addons' && <AddonsTab />}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono" />
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

async function uploadToR2(file: File, folder: string): Promise<string | null> {
  try {
    const { uploadUrl, publicUrl } = await api.admin.cmsUploadUrl(file.type, folder);
    const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
    if (!res.ok) throw new Error('Upload gagal');
    return publicUrl;
  } catch (e: any) {
    alert('Upload gagal: ' + (e?.message ?? 'unknown'));
    return null;
  }
}

function ImageUpload({ value, onChange, folder }: { value: string; onChange: (url: string) => void; folder: string }) {
  const [busy, setBusy] = useState(false);
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
          const url = await uploadToR2(f, folder);
          setBusy(false);
          if (url) onChange(url);
        }}
        className="w-full text-xs"
      />
      {busy && <div className="mt-1 text-xs text-slate-500">Uploading…</div>}
      {value && <div className="mt-1 break-all text-[10px] text-slate-400">{value}</div>}
    </div>
  );
}

function BannersTab() {
  const [list, setList] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', subtitle: '', imageUrl: '', linkUrl: '', placement: 'home_hero', sortOrder: 0 });
  async function load() { try { setList(await api.admin.banners()); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!form.title || !form.imageUrl) return alert('Title & image wajib.');
    try { await api.admin.createBanner(form); setShowForm(false); setForm({ title: '', subtitle: '', imageUrl: '', linkUrl: '', placement: 'home_hero', sortOrder: 0 }); void load(); } catch (e: any) { alert(e?.message); }
  }
  async function toggle(id: string, isActive: boolean) { try { await api.admin.updateBanner(id, { isActive: !isActive }); void load(); } catch (e: any) { alert(e?.message); } }
  async function del(id: string) { if (!confirm('Hapus banner?')) return; try { await api.admin.deleteBanner(id); void load(); } catch (e: any) { alert(e?.message); } }
  return (
    <div>
      <div className="mb-3 flex justify-between">
        <h2 className="text-base font-semibold">Banner ({list.length})</h2>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white"><Plus size={14} /> Tambah</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {list.map((b) => (
          <div key={b.id} className="overflow-hidden rounded-md border bg-white">
            <img src={b.imageUrl} alt={b.title} className="h-32 w-full object-cover" />
            <div className="p-3">
              <div className="flex items-center justify-between">
                <h3 className="truncate text-sm font-semibold">{b.title}</h3>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{b.placement}</span>
              </div>
              {b.subtitle && <p className="mt-1 truncate text-xs text-slate-500">{b.subtitle}</p>}
              {b.linkUrl && <a href={b.linkUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-blue-700"><ExternalLink size={11} /> {b.linkUrl}</a>}
              <div className="mt-3 flex justify-between">
                <button onClick={() => toggle(b.id, b.isActive)} className={`rounded-full px-2 py-0.5 text-xs ${b.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>{b.isActive ? 'aktif' : 'nonaktif'}</button>
                <button onClick={() => del(b.id)} className="text-xs text-red-600 hover:underline"><Trash2 size={11} className="inline" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {showForm && (
        <Modal title="Tambah Banner" onClose={() => setShowForm(false)}>
          <Field label="Judul" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <Field label="Subtitle (opsional)" value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: v })} />
          <ImageUpload value={form.imageUrl} onChange={(v) => setForm({ ...form, imageUrl: v })} folder="banners" />
          <Field label="Link URL (opsional)" value={form.linkUrl} onChange={(v) => setForm({ ...form, linkUrl: v })} placeholder="https://..." />
          <Select label="Placement" value={form.placement} options={[{ v: 'home_hero', l: 'Home Hero (utama)' }, { v: 'home_promo', l: 'Home Promo (carousel)' }, { v: 'cleaner_home', l: 'Cleaner Home' }]} onChange={(v) => setForm({ ...form, placement: v })} />
          <Field label="Sort Order" type="number" value={String(form.sortOrder)} onChange={(v) => setForm({ ...form, sortOrder: Number(v) })} />
          <button onClick={save} className="w-full rounded-md bg-blue-700 py-2 text-sm font-medium text-white">Simpan</button>
        </Modal>
      )}
    </div>
  );
}

function PagesTab() {
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ slug: '', title: '', bodyMarkdown: '', audience: 'public' });
  async function load() { try { setList(await api.admin.pages()); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);
  async function openEdit(slug: string) {
    try { const p = await api.admin.getPage(slug); setEditing(p); setForm({ slug: p.slug, title: p.title, bodyMarkdown: p.bodyMarkdown, audience: p.audience }); } catch (e: any) { alert(e?.message); }
  }
  function newPage() { setEditing({}); setForm({ slug: '', title: '', bodyMarkdown: '', audience: 'public' }); }
  async function save() {
    if (!form.slug || !form.title || !form.bodyMarkdown) return alert('Lengkapi semua field.');
    try { await api.admin.upsertPage(form); setEditing(null); void load(); } catch (e: any) { alert(e?.message); }
  }
  async function publish(id: string, isPublished: boolean) { try { await api.admin.publishPage(id, !isPublished); void load(); } catch (e: any) { alert(e?.message); } }
  return (
    <div>
      <div className="mb-3 flex justify-between">
        <h2 className="text-base font-semibold">Halaman Statis ({list.length})</h2>
        <button onClick={newPage} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white"><Plus size={14} /> Halaman Baru</button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Slug</th><th className="px-4 py-2">Judul</th><th className="px-4 py-2">Audience</th><th className="px-4 py-2">Panjang</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">Belum ada halaman. Bikin <b>terms</b>, <b>privacy</b>, <b>about</b>, <b>faq</b>.</td></tr>
            ) : list.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{p.slug}</td>
                <td className="px-4 py-2 font-medium">{p.title}</td>
                <td className="px-4 py-2"><span className="rounded bg-slate-200 px-2 py-0.5 text-xs">{p.audience}</span></td>
                <td className="px-4 py-2 text-xs">{p.bodyLength} char</td>
                <td className="px-4 py-2">
                  <button onClick={() => publish(p.id, p.isPublished)} className={`rounded-full px-2 py-0.5 text-xs ${p.isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{p.isPublished ? 'published' : 'draft'}</button>
                </td>
                <td className="px-4 py-2 text-right"><button onClick={() => openEdit(p.slug)} className="text-xs text-blue-700 hover:underline">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal title={editing.id ? `Edit: ${form.slug}` : 'Halaman Baru'} onClose={() => setEditing(null)}>
          <Field label="Slug (URL)" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="terms / privacy / about / faq" />
          <Field label="Judul" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <Select label="Audience" value={form.audience} options={[{ v: 'public', l: 'Public (semua)' }, { v: 'customer', l: 'Customer only' }, { v: 'cleaner', l: 'Cleaner only' }]} onChange={(v) => setForm({ ...form, audience: v })} />
          <TextArea label="Body (Markdown)" value={form.bodyMarkdown} onChange={(v) => setForm({ ...form, bodyMarkdown: v })} rows={12} />
          <button onClick={save} className="w-full rounded-md bg-blue-700 py-2 text-sm font-medium text-white">Simpan</button>
        </Modal>
      )}
    </div>
  );
}

function AnnouncementsTab() {
  const [list, setList] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', severity: 'info', endsAt: '' });
  async function load() { try { setList(await api.admin.announcements()); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!form.title || !form.body) return alert('Title & body wajib.');
    try { await api.admin.createAnnouncement(form); setShowForm(false); setForm({ title: '', body: '', audience: 'all', severity: 'info', endsAt: '' }); void load(); } catch (e: any) { alert(e?.message); }
  }
  async function toggle(id: string, isActive: boolean) { try { await api.admin.updateAnnouncement(id, { isActive: !isActive }); void load(); } catch (e: any) { alert(e?.message); } }
  return (
    <div>
      <div className="mb-3 flex justify-between">
        <h2 className="text-base font-semibold">Pengumuman ({list.length})</h2>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white"><Plus size={14} /> Tambah</button>
      </div>
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a.id} className={`rounded-md border p-3 ${a.severity === 'critical' ? 'border-red-300 bg-red-50' : a.severity === 'warning' ? 'border-amber-300 bg-amber-50' : 'border-blue-300 bg-blue-50'}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2"><h3 className="text-sm font-bold">{a.title}</h3><span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">{a.severity}</span><span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">{a.audience}</span></div>
                <p className="mt-1 text-sm text-slate-700">{a.body}</p>
                <p className="mt-1 text-[10px] text-slate-500">{new Date(a.startsAt).toLocaleString('id-ID')} {a.endsAt ? `→ ${new Date(a.endsAt).toLocaleString('id-ID')}` : ''}</p>
              </div>
              <button onClick={() => toggle(a.id, a.isActive)} className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>{a.isActive ? 'aktif' : 'nonaktif'}</button>
            </div>
          </div>
        ))}
      </div>
      {showForm && (
        <Modal title="Tambah Pengumuman" onClose={() => setShowForm(false)}>
          <Field label="Judul" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <TextArea label="Pesan" value={form.body} onChange={(v) => setForm({ ...form, body: v })} rows={4} />
          <Select label="Audience" value={form.audience} options={[{ v: 'all', l: 'Semua' }, { v: 'customer', l: 'Customer' }, { v: 'cleaner', l: 'Cleaner' }]} onChange={(v) => setForm({ ...form, audience: v })} />
          <Select label="Severity" value={form.severity} options={[{ v: 'info', l: 'Info (biru)' }, { v: 'warning', l: 'Warning (kuning)' }, { v: 'critical', l: 'Critical (merah)' }]} onChange={(v) => setForm({ ...form, severity: v })} />
          <Field label="Berakhir (opsional)" type="datetime-local" value={form.endsAt} onChange={(v) => setForm({ ...form, endsAt: v })} />
          <button onClick={save} className="w-full rounded-md bg-blue-700 py-2 text-sm font-medium text-white">Simpan</button>
        </Modal>
      )}
    </div>
  );
}

function AreasTab() {
  const [list, setList] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', lat: -6.2, lng: 106.8, radiusM: 5000, surgeMultiplier: 1.0, notes: '' });
  async function load() { try { setList(await api.admin.serviceAreas()); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!form.name || !form.city) return alert('Nama & kota wajib.');
    try { await api.admin.createServiceArea(form); setShowForm(false); void load(); } catch (e: any) { alert(e?.message); }
  }
  async function toggle(id: string, isActive: boolean) { try { await api.admin.updateServiceArea(id, { isActive: !isActive }); void load(); } catch (e: any) { alert(e?.message); } }
  async function del(id: string) { if (!confirm('Hapus area?')) return; try { await api.admin.deleteServiceArea(id); void load(); } catch (e: any) { alert(e?.message); } }
  async function setSurge(id: string, current: number) {
    const v = prompt('Surge multiplier (1.0 = normal, 1.5 = +50%):', String(current));
    if (!v) return;
    try { await api.admin.updateServiceArea(id, { surgeMultiplier: Number(v) }); void load(); } catch (e: any) { alert(e?.message); }
  }
  return (
    <div>
      <div className="mb-3 flex justify-between">
        <h2 className="text-base font-semibold">Area Layanan ({list.length})</h2>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white"><Plus size={14} /> Tambah Area</button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Kota</th><th className="px-4 py-2">Koordinat</th><th className="px-4 py-2">Radius (m)</th><th className="px-4 py-2">Surge</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2">{a.city}</td>
                <td className="px-4 py-2 font-mono text-xs">{Number(a.lat).toFixed(4)}, {Number(a.lng).toFixed(4)}</td>
                <td className="px-4 py-2">{a.radiusM}</td>
                <td className="px-4 py-2"><button onClick={() => setSurge(a.id, a.surgeMultiplier)} className={`rounded px-2 py-0.5 text-xs ${Number(a.surgeMultiplier) > 1 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100'}`}>{Number(a.surgeMultiplier).toFixed(2)}x</button></td>
                <td className="px-4 py-2"><button onClick={() => toggle(a.id, a.isActive)} className={`rounded-full px-2 py-0.5 text-xs ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>{a.isActive ? 'aktif' : 'nonaktif'}</button></td>
                <td className="px-4 py-2 text-right"><button onClick={() => del(a.id)} className="text-xs text-red-600 hover:underline">Hapus</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && (
        <Modal title="Tambah Area Layanan" onClose={() => setShowForm(false)}>
          <Field label="Nama Area" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Kelapa Gading" />
          <Field label="Kota" value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="Jakarta Utara" />
          <div className="grid grid-cols-2 gap-2"><Field label="Latitude" type="number" value={String(form.lat)} onChange={(v) => setForm({ ...form, lat: Number(v) })} /><Field label="Longitude" type="number" value={String(form.lng)} onChange={(v) => setForm({ ...form, lng: Number(v) })} /></div>
          <Field label="Radius (meter)" type="number" value={String(form.radiusM)} onChange={(v) => setForm({ ...form, radiusM: Number(v) })} />
          <Field label="Surge Multiplier (1.0 - 2.0)" type="number" value={String(form.surgeMultiplier)} onChange={(v) => setForm({ ...form, surgeMultiplier: Number(v) })} />
          <Field label="Catatan (opsional)" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
          <button onClick={save} className="w-full rounded-md bg-blue-700 py-2 text-sm font-medium text-white">Simpan</button>
        </Modal>
      )}
    </div>
  );
}

function PackagesTab() {
  const [list, setList] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ serviceId: '', name: '', price: 0, durationMin: 60 });
  async function load() {
    try { const [pkgs, svcs] = await Promise.all([api.admin.packages(), api.admin.configServices()]); setList(pkgs); setServices(svcs); } catch (e: any) { alert(e?.message); }
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!form.serviceId || !form.name || !form.price || !form.durationMin) return alert('Lengkapi semua field.');
    try { await api.admin.createPackage(form); setShowForm(false); setForm({ serviceId: '', name: '', price: 0, durationMin: 60 }); void load(); } catch (e: any) { alert(e?.message); }
  }
  async function toggle(id: string, isActive: boolean) { try { await api.admin.updatePackage(id, { isActive: !isActive }); void load(); } catch (e: any) { alert(e?.message); } }
  async function editPrice(id: string, current: number) {
    const v = prompt('Harga baru (Rupiah):', String(current));
    if (!v) return;
    try { await api.admin.updatePackage(id, { price: Number(v) }); void load(); } catch (e: any) { alert(e?.message); }
  }
  return (
    <div>
      <div className="mb-3 flex justify-between">
        <h2 className="text-base font-semibold">Paket Harga ({list.length})</h2>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white"><Plus size={14} /> Tambah Paket</button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Service</th><th className="px-4 py-2">Paket</th><th className="px-4 py-2">Harga</th><th className="px-4 py-2">Durasi</th><th className="px-4 py-2">Status</th></tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 text-xs text-slate-600">{p.serviceName ?? '—'}</td>
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2"><button onClick={() => editPrice(p.id, Number(p.price))} className="font-mono text-sm text-blue-700 hover:underline">Rp {Number(p.price).toLocaleString('id-ID')}</button></td>
                <td className="px-4 py-2 text-xs">{p.durationMin} min</td>
                <td className="px-4 py-2"><button onClick={() => toggle(p.id, p.isActive)} className={`rounded-full px-2 py-0.5 text-xs ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>{p.isActive ? 'aktif' : 'nonaktif'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && (
        <Modal title="Tambah Paket Harga" onClose={() => setShowForm(false)}>
          <Select label="Service" value={form.serviceId} options={[{ v: '', l: '— pilih —' }, ...services.map((s: any) => ({ v: s.id, l: s.name }))]} onChange={(v) => setForm({ ...form, serviceId: v })} />
          <Field label="Nama Paket" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Bersih 2 Kamar" />
          <Field label="Harga (Rupiah)" type="number" value={String(form.price)} onChange={(v) => setForm({ ...form, price: Number(v) })} />
          <Field label="Durasi (menit)" type="number" value={String(form.durationMin)} onChange={(v) => setForm({ ...form, durationMin: Number(v) })} />
          <button onClick={save} className="w-full rounded-md bg-blue-700 py-2 text-sm font-medium text-white">Simpan</button>
        </Modal>
      )}
    </div>
  );
}

function AddonsTab() {
  const [list, setList] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', price: 0, durationMin: 30, description: '' });
  async function load() { try { setList(await api.admin.addons()); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!form.name || !form.price || !form.durationMin) return alert('Lengkapi semua field.');
    try { await api.admin.createAddon(form); setShowForm(false); setForm({ code: '', name: '', price: 0, durationMin: 30, description: '' }); void load(); } catch (e: any) { alert(e?.message); }
  }
  async function toggle(id: string, isActive: boolean) { try { await api.admin.updateAddon(id, { isActive: !isActive }); void load(); } catch (e: any) { alert(e?.message); } }
  async function editPrice(id: string, current: number) {
    const v = prompt('Harga baru:', String(current));
    if (!v) return;
    try { await api.admin.updateAddon(id, { price: Number(v) }); void load(); } catch (e: any) { alert(e?.message); }
  }
  return (
    <div>
      <div className="mb-3 flex justify-between">
        <h2 className="text-base font-semibold">Add-Ons ({list.length})</h2>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white"><Plus size={14} /> Tambah Add-On</button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Harga</th><th className="px-4 py-2">Durasi</th><th className="px-4 py-2">Deskripsi</th><th className="px-4 py-2">Status</th></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{a.code ?? '—'}</td>
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2"><button onClick={() => editPrice(a.id, Number(a.price))} className="font-mono text-sm text-blue-700 hover:underline">Rp {Number(a.price).toLocaleString('id-ID')}</button></td>
                <td className="px-4 py-2 text-xs">{a.durationMin} min</td>
                <td className="px-4 py-2 text-xs text-slate-600">{a.description ?? '—'}</td>
                <td className="px-4 py-2"><button onClick={() => toggle(a.id, a.isActive)} className={`rounded-full px-2 py-0.5 text-xs ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>{a.isActive ? 'aktif' : 'nonaktif'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && (
        <Modal title="Tambah Add-On" onClose={() => setShowForm(false)}>
          <Field label="Code (opsional)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="setrika_30m" />
          <Field label="Nama" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Setrika Baju" />
          <Field label="Harga (Rupiah)" type="number" value={String(form.price)} onChange={(v) => setForm({ ...form, price: Number(v) })} />
          <Field label="Durasi (menit)" type="number" value={String(form.durationMin)} onChange={(v) => setForm({ ...form, durationMin: Number(v) })} />
          <TextArea label="Deskripsi" value={form.description} onChange={(v) => setForm({ ...form, description: v })} rows={2} />
          <button onClick={save} className="w-full rounded-md bg-blue-700 py-2 text-sm font-medium text-white">Simpan</button>
        </Modal>
      )}
    </div>
  );
}

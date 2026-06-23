'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Home as HomeIcon, Plus, Shield, Banknote, Briefcase, Ban, Activity, Pencil, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Select, Button, Switch, Badge, useConfirm, useToast } from '../../../components/ui';

type Tab = 'admins' | 'commission' | 'services' | 'blacklist' | 'audit';
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'admins', label: 'Admin Users', icon: Shield },
  { key: 'commission', label: 'Komisi Cleaner', icon: Banknote },
  { key: 'services', label: 'Layanan', icon: Briefcase },
  { key: 'blacklist', label: 'Blacklist', icon: Ban },
  { key: 'audit', label: 'Audit Log', icon: Activity },
];

export default function SettingsPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('admins');
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="text-sm text-slate-500">Kelola admin, komisi, layanan, blacklist, audit log.</p>
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
        {tab === 'admins' && <AdminsTab />}
        {tab === 'commission' && <CommissionTab />}
        {tab === 'services' && <ServicesTab />}
        {tab === 'blacklist' && <BlacklistTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}

// ============ ADMIN USERS ============
function AdminsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [pwReset, setPwReset] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.listAdmins()); } catch (e: any) { toast.error(e?.message ?? 'Gagal load.'); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function deactivate(a: any) {
    const ok = await confirm({ title: 'Nonaktifkan admin', message: `Yakin nonaktifkan ${a.email}? User ini tidak bisa login lagi.`, variant: 'danger', confirmLabel: 'Nonaktifkan' });
    if (!ok) return;
    try { await api.admin.deactivateAdmin(a.id); toast.success('Admin nonaktifkan.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Admin Users ({list.length})</h2>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Admin</Button>
      </div>
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Nama</th><th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th><th className="px-4 py-2">Last Login</th>
                <th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{a.name}</td>
                  <td className="px-4 py-2 text-slate-600">{a.email}</td>
                  <td className="px-4 py-2"><RoleBadge role={a.role} /></td>
                  <td className="px-4 py-2 text-xs text-slate-500">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('id-ID') : 'â€”'}</td>
                  <td className="px-4 py-2">{a.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(a)} icon={<Pencil size={12} />}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPwReset(a)}>Reset Password</Button>
                    {a.isActive && <Button size="sm" variant="ghost" onClick={() => deactivate(a)} icon={<Trash2 size={12} />}>Nonaktifkan</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && <AdminFormModal admin={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {pwReset && <PasswordResetModal admin={pwReset} onClose={() => setPwReset(null)} />}
    </div>
  );
}

function AdminFormModal({ admin, onClose, onSaved }: { admin: any | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!admin;
  const [form, setForm] = useState({
    email: admin?.email ?? '',
    name: admin?.name ?? '',
    role: admin?.role ?? 'ops',
    password: '',
    isActive: admin?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isEdit) {
      if (!form.email || !/^.+@.+\..+$/.test(form.email)) e.email = 'Email valid wajib.';
      if (!form.password || form.password.length < 8) e.password = 'Password minimum 8 karakter.';
    }
    if (!form.name) e.name = 'Nama wajib.';
    if (!form.role) e.role = 'Role wajib.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      if (isEdit) {
        await api.admin.updateAdmin(admin.id, { name: form.name, role: form.role, isActive: form.isActive });
      } else {
        await api.admin.createAdmin({ email: form.email, name: form.name, role: form.role, password: form.password });
      }
      toast.success(isEdit ? 'Admin di-update.' : 'Admin baru dibuat.');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal simpan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${admin.email}` : 'Tambah Admin Baru'}
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
        {!isEdit && <Input label="Email" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} error={errors.email} />}
        <Input label="Nama" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} />
        <Select
          label="Role" required value={form.role}
          options={[
            { value: 'super_admin', label: 'Super Admin (akses semua)' },
            { value: 'ops', label: 'Ops (KYC, booking, user)' },
            { value: 'finance', label: 'Finance (wallet, withdrawal)' },
            { value: 'fraud_analyst', label: 'Fraud Analyst (audit, fraud, blacklist)' },
            { value: 'support', label: 'Support (read-only user/booking)' },
          ]}
          onChange={(v) => setForm({ ...form, role: v })}
        />
        {!isEdit && <Input label="Password" type="password" required value={form.password} onChange={(v) => setForm({ ...form, password: v })} error={errors.password} helpText="Minimum 8 karakter." />}
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

function PasswordResetModal({ admin, onClose }: { admin: any; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (pw.length < 8) e.pw = 'Min 8 karakter.';
    if (pw !== confirmPw) e.confirmPw = 'Tidak cocok.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.admin.updateAdmin(admin.id, { password: pw });
      toast.success(`Password ${admin.email} di-reset.`);
      onClose();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={`Reset Password â€” ${admin.email}`}
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Reset</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="Password Baru" type="password" required value={pw} onChange={setPw} error={errors.pw} helpText="Min 8 karakter." />
        <Input label="Konfirmasi Password" type="password" required value={confirmPw} onChange={setConfirmPw} error={errors.confirmPw} />
      </div>
    </Modal>
  );
}

function RoleBadge({ role }: { role: string }) {
  const variant: any = { super_admin: 'purple', ops: 'blue', finance: 'green', fraud_analyst: 'red', support: 'slate' }[role] ?? 'slate';
  return <Badge variant={variant}>{role}</Badge>;
}

// ============ COMMISSION ============
function CommissionTab() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() { try { setList(await api.admin.commissionTiers()); } catch (e: any) { toast.error(e?.message); } }
  useEffect(() => { void load(); }, []);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Tier Komisi Cleaner</h2>
      </div>
      <p className="mb-3 text-xs text-slate-500">% komisi cleaner berdasarkan total order. <b>Tools</b> = bawa alat sendiri.</p>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Range Min</th><th className="px-4 py-2">Range Max</th>
              <th className="px-4 py-2">Tanpa Alat (%)</th><th className="px-4 py-2">Bawa Alat (%)</th>
              <th className="px-4 py-2">Bonus Top Tier (%)</th><th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{t.rangeMin ? Number(t.rangeMin).toLocaleString('id-ID') : 'â€”'}</td>
                <td className="px-4 py-2 font-mono text-xs">{t.rangeMax ? Number(t.rangeMax).toLocaleString('id-ID') : 'âˆž'}</td>
                <td className="px-4 py-2 font-bold">{Number(t.shareNoTools ?? 0)}%</td>
                <td className="px-4 py-2 font-bold">{Number(t.shareWithTools ?? 0)}%</td>
                <td className="px-4 py-2">{Number(t.topTierBonusPct ?? 0)}%</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(t)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CommissionFormModal tier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function CommissionFormModal({ tier, onClose, onSaved }: { tier: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    rangeMin: tier.rangeMin ?? 0,
    rangeMax: tier.rangeMax ?? 0,
    shareNoTools: Number(tier.shareNoTools ?? 0),
    shareWithTools: Number(tier.shareWithTools ?? 0),
    topTierBonusPct: Number(tier.topTierBonusPct ?? 0),
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.admin.updateCommissionTier(tier.id, {
        rangeMin: Number(form.rangeMin),
        rangeMax: Number(form.rangeMax) || undefined,
        shareNoTools: Number(form.shareNoTools),
        shareWithTools: Number(form.shareWithTools),
        topTierBonusPct: Number(form.topTierBonusPct),
      });
      toast.success('Tier ter-update.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="Edit Commission Tier"
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
        <div className="grid grid-cols-2 gap-3">
          <Input label="Range Min (Rp)" type="number" value={String(form.rangeMin)} onChange={(v) => setForm({ ...form, rangeMin: Number(v) })} />
          <Input label="Range Max (Rp)" type="number" value={String(form.rangeMax)} onChange={(v) => setForm({ ...form, rangeMax: Number(v) })} helpText="0 = tidak ada batas" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tanpa Alat (%)" type="number" value={String(form.shareNoTools)} onChange={(v) => setForm({ ...form, shareNoTools: Number(v) })} />
          <Input label="Bawa Alat (%)" type="number" value={String(form.shareWithTools)} onChange={(v) => setForm({ ...form, shareWithTools: Number(v) })} />
        </div>
        <Input label="Bonus Top Tier (%)" type="number" value={String(form.topTierBonusPct)} onChange={(v) => setForm({ ...form, topTierBonusPct: Number(v) })} />
      </div>
    </Modal>
  );
}

// ============ SERVICES ============
function ServicesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() { try { setList(await api.admin.configServices()); } catch (e: any) { toast.error(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function toggleActive(s: any) {
    try { await api.admin.updateService(s.id, { isActive: !s.isActive }); toast.success(`Service ${s.isActive ? 'nonaktif' : 'aktif'}kan.`); void load(); } catch (e: any) { toast.error(e?.message); }
  }
  async function toggleHome(s: any) {
    try {
      await api.admin.updateService(s.id, { showOnHome: !s.showOnHome });
      toast.success(s.showOnHome ? 'Disembunyikan dari home.' : 'Akan tampil di home.');
      void load();
    } catch (e: any) { toast.error(e?.message); }
  }
  async function del(s: any) {
    const ok = await confirm({ title: 'Nonaktifkan layanan', message: `Yakin nonaktifkan "${s.name}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deactivateService(s.id); toast.success('Service nonaktifkan.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  // Reorder: pindah item up/down 1 step, lalu commit semua displayOrder ke server
  async function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const newList = [...list];
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    setList(newList); // optimistic
    const items = newList.map((s, i) => ({ id: s.id, displayOrder: i + 1 }));
    try {
      await api.admin.reorderServices(items);
      toast.success('Urutan tersimpan.');
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal urutkan');
      void load(); // rollback
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Layanan ({list.length})</h2>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Layanan</Button>
      </div>
      <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-900">
        â†‘â†“ untuk atur urutan tampil. Toggle <HomeIcon size={11} className="inline" /> = tampil di home grid mobile (kalau off, layanan tetap muncul di tab Layanan).
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-20 px-2 py-2">Urut</th>
              <th className="px-4 py-2">Code</th><th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Deskripsi</th>
              <th className="px-4 py-2">Home</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s, idx) => (
              <tr key={s.id} className="border-t">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" title="Naik"><ArrowUp size={14} /></button>
                    <button onClick={() => move(idx, 1)} disabled={idx === list.length - 1} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" title="Turun"><ArrowDown size={14} /></button>
                    <span className="ml-1 text-xs text-slate-400">{idx + 1}</span>
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{s.code}</td>
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2 max-w-xs truncate text-xs text-slate-500">{s.description ?? 'â€”'}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggleHome(s)} title={s.showOnHome ? 'Klik untuk hide dari home' : 'Klik untuk show di home'}>
                    {s.showOnHome ? <Badge variant="blue">tampil</Badge> : <Badge>tidak</Badge>}
                  </button>
                </td>
                <td className="px-4 py-2"><button onClick={() => toggleActive(s)}>{s.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</button></td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(s)}>Edit</Button>
                  {s.isActive && <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del(s)}>Hapus</Button>}
                </td>
              </tr>
            ))}
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
    displayOrder: service?.displayOrder ?? 0,
    showOnHome: service?.showOnHome !== false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!isEdit && !form.code) e.code = 'Code wajib.';
    if (!form.name) e.name = 'Nama wajib.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (isEdit) {
        await api.admin.updateService(service.id, { name: form.name, description: form.description, iconUrl: form.iconUrl, displayOrder: form.displayOrder, showOnHome: form.showOnHome });
      } else {
        await api.admin.createService({ code: form.code, name: form.name, description: form.description, iconUrl: form.iconUrl, displayOrder: form.displayOrder });
      }
      toast.success(isEdit ? 'Service di-update.' : 'Service dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${service.name}` : 'Tambah Layanan'}
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
        {!isEdit && <Input label="Code (slug, lowercase)" required value={form.code} onChange={(v) => setForm({ ...form, code: v.toLowerCase() })} error={errors.code} placeholder="kamar / dapur / full_house" />}
        <Input label="Nama" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} />
        <Textarea label="Deskripsi" value={form.description} onChange={(v) => setForm({ ...form, description: v })} rows={3} />
        <ServiceIconUpload value={form.iconUrl} onChange={(v) => setForm({ ...form, iconUrl: v })} />
        <Input label="Display Order" type="number" value={String(form.displayOrder)} onChange={(v) => setForm({ ...form, displayOrder: Number(v) })} helpText="Atau pakai tombol â†‘â†“ di tabel untuk reorder cepat." />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Tampil di Home Grid Mobile</label>
          <Switch checked={form.showOnHome} onChange={(v) => setForm({ ...form, showOnHome: v })} label={form.showOnHome ? 'Ya, tampil di home (max 7 tile)' : 'Tidak â€” hanya tampil di tab Layanan'} />
        </div>
      </div>
    </Modal>
  );
}

// ============ SERVICE ICON UPLOAD ============
function ServiceIconUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function uploadFile(file: File) {
    setBusy(true);
    try {
      const { uploadUrl, publicUrl } = await api.admin.cmsUploadUrl(file.type, 'service-icons');
      const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
      if (!res.ok) throw new Error('Upload gagal');
      onChange(publicUrl);
      toast.success('Icon ter-upload.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload gagal â€” cek koneksi atau format file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">Icon Layanan (opsional)</label>
      <p className="mb-2 text-[11px] text-slate-500">PNG/SVG transparan, ukuran ~64Ã—64. Kalau kosong, pakai icon default Lucide.</p>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative h-16 w-16 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <img src={value} alt="icon" className="h-full w-full object-contain" />
            <button
              onClick={() => onChange('')}
              type="button"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white shadow"
              title="Hapus icon"
            >
              Ã—
            </button>
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400">
            No icon
          </div>
        )}
        <div className="flex-1">
          <input
            type="file"
            accept="image/png,image/svg+xml,image/webp,image/jpeg"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await uploadFile(f);
              e.target.value = '';
            }}
            className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-slate-200"
          />
          {busy && <div className="mt-1 text-xs text-slate-500">Uploadingâ€¦</div>}
          {value && (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="mt-1 w-full truncate rounded border border-slate-200 px-2 py-1 font-mono text-[10px] text-slate-500"
              title="URL icon"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============ BLACKLIST ============
function BlacklistTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);

  async function load() { try { setList(await api.admin.blacklist()); } catch (e: any) { toast.error(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function remove(b: any) {
    const ok = await confirm({ title: 'Hapus dari blacklist', message: `Yakin hapus ${b.value} (${b.type})?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.removeBlacklist(b.id); toast.success('Entry dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Blacklist ({list.length})</h2>
        <Button variant="danger" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Tambah Entry</Button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Type</th><th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Alasan</th><th className="px-4 py-2">Ditambahkan</th>
              <th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">Blacklist kosong.</td></tr>
            ) : list.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-4 py-2"><Badge>{b.type}</Badge></td>
                <td className="px-4 py-2 font-mono text-xs">{b.value}</td>
                <td className="px-4 py-2 text-slate-600">{b.reason}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{new Date(b.addedAt).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => remove(b)}>Hapus</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <BlacklistFormModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}
    </div>
  );
}

function BlacklistFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ type: 'phone', value: '', reason: '', expiresAt: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.value) e.value = 'Value wajib.';
    if (!form.reason || form.reason.length < 5) e.reason = 'Alasan min 5 karakter.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.admin.addBlacklist({ type: form.type, value: form.value, reason: form.reason, expiresAt: form.expiresAt || undefined });
      toast.success('Entry ditambahkan.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="Tambah Blacklist"
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="danger" onClick={save} loading={busy}>Tambahkan</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Select
          label="Type" required value={form.type}
          options={[
            { value: 'phone', label: 'Phone (no HP)' },
            { value: 'device', label: 'Device fingerprint' },
            { value: 'ip', label: 'IP Address' },
            { value: 'bank', label: 'Bank account' },
            { value: 'nik', label: 'NIK (KTP)' },
            { value: 'email', label: 'Email' },
          ]}
          onChange={(v) => setForm({ ...form, type: v })}
        />
        <Input label="Value" required value={form.value} onChange={(v) => setForm({ ...form, value: v })} error={errors.value} placeholder={form.type === 'phone' ? '081234567890' : '...'} />
        <Textarea label="Alasan" rows={3} required value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} helpText="Min 5 karakter â€” akan masuk audit log." />
        <Input label="Berakhir (opsional)" type="datetime-local" value={form.expiresAt} onChange={(v) => setForm({ ...form, expiresAt: v })} helpText="Kosongkan = permanen." />
      </div>
    </Modal>
  );
}

// ============ AUDIT ============
function AuditTab() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<string[]>([]);
  const [filters, setFilters] = useState<{ action: string; q: string; from: string; to: string }>({ action: '', q: '', from: '', to: '' });

  async function load() {
    setLoading(true);
    try {
      const params: any = { limit: 200 };
      if (filters.action) params.action = filters.action;
      if (filters.q) params.q = filters.q;
      if (filters.from) params.from = new Date(filters.from).toISOString();
      if (filters.to) params.to = new Date(filters.to + 'T23:59:59').toISOString();
      setList(await api.admin.auditLog(params));
    } catch (e: any) { toast.error(e?.message); }
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { void (async () => { try { setActions(await api.admin.auditLogActions()); } catch {} })(); }, []);

  function exportCsv() {
    if (list.length === 0) { toast.info('Tidak ada data buat di-export'); return; }
    const header = ['Waktu', 'Admin Email', 'Admin Nama', 'Role', 'Action', 'Resource Type', 'Resource ID', 'IP', 'Detail'];
    const rows = list.map((a) => [
      new Date(a.performedAt).toISOString(),
      a.adminEmail ?? '',
      a.adminName ?? '',
      a.adminRole ?? '',
      a.action ?? '',
      a.resourceType ?? '',
      a.resourceId ?? '',
      a.ipAddress ?? '',
      a.changes ? JSON.stringify(a.changes).replace(/"/g, '""') : '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c)}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Audit Log</h2>
        <Button variant="secondary" onClick={exportCsv}>â¬‡ Export CSV</Button>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-md border bg-white p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-slate-500">Action</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option value="">Semua action</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-slate-500">Dari</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-slate-500">Sampai</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-[10px] font-medium uppercase text-slate-500">Cari (admin email / resource ID / detail)</label>
            <input type="text" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="ketik kata kunci..." className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="primary" onClick={load}>Cari</Button>
          <Button variant="secondary" onClick={() => { setFilters({ action: '', q: '', from: '', to: '' }); setTimeout(load, 50); }}>Reset</Button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Waktu</th><th className="px-4 py-2">Admin</th>
                <th className="px-4 py-2">Action</th><th className="px-4 py-2">Resource</th>
                <th className="px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">Tidak ada hasil. Coba ubah filter.</td></tr>
              )}
              {list.map((a) => (
                <tr key={a.id} className="border-t align-top">
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(a.performedAt).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2"><div className="text-xs font-medium">{a.adminName ?? a.adminEmail}</div><div className="text-[10px] text-slate-500">{a.adminRole}</div></td>
                  <td className="px-4 py-2"><Badge variant="blue">{a.action}</Badge></td>
                  <td className="px-4 py-2 text-xs">{a.resourceType}{a.resourceId ? `:${a.resourceId.slice(0, 8)}â€¦` : ''}</td>
                  <td className="px-4 py-2 max-w-md text-xs text-slate-600">
                    {a.changes ? <code className="block max-h-20 overflow-auto break-all text-[10px]">{JSON.stringify(a.changes)}</code> : 'â€”'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

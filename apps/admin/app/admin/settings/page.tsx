'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, X, Shield, Banknote, Briefcase, Ban, Activity } from 'lucide-react';

import { api } from '../../../lib/api';

type Tab = 'admins' | 'commission' | 'services' | 'hourly' | 'blacklist' | 'audit';
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'admins', label: 'Admin Users', icon: Shield },
  { key: 'commission', label: 'Komisi Cleaner', icon: Banknote },
  { key: 'services', label: 'Layanan', icon: Briefcase },
  { key: 'hourly', label: 'Tarif Per Jam', icon: Banknote },
  { key: 'blacklist', label: 'Blacklist', icon: Ban },
  { key: 'audit', label: 'Audit Log', icon: Activity },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('admins');

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="text-sm text-slate-500">Kelola admin, komisi, layanan, blacklist, audit log.</p>

      <div className="mt-4 flex gap-1 border-b">
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
        {tab === 'hourly' && <HourlyTab />}
        {tab === 'blacklist' && <BlacklistTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}

// ============ ADMIN USERS ============
function AdminsTab() {
  const [list, setList] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'ops', password: '' });

  async function load() {
    try {
      setList(await api.admin.listAdmins());
    } catch (e: any) {
      alert(e?.message ?? 'Gagal load.');
    }
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    if (!form.email || !form.name || !form.password) return alert('Lengkapi semua field.');
    try {
      await api.admin.createAdmin(form);
      setShowCreate(false);
      setForm({ email: '', name: '', role: 'ops', password: '' });
      void load();
    } catch (e: any) {
      alert(e?.message ?? 'Gagal create.');
    }
  }

  async function deactivate(id: string, email: string) {
    if (!confirm(`Nonaktifkan admin ${email}?`)) return;
    try {
      await api.admin.deactivateAdmin(id);
      void load();
    } catch (e: any) { alert(e?.message); }
  }

  async function resetPassword(id: string, email: string) {
    const pwd = prompt(`Password baru untuk ${email} (min 8 char):`);
    if (!pwd || pwd.length < 8) return;
    try {
      await api.admin.updateAdmin(id, { password: pwd });
      alert('Password diganti.');
    } catch (e: any) { alert(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Admin Users ({list.length})</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus size={14} /> Tambah Admin
        </button>
      </div>

      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Last Login</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2 text-slate-600">{a.email}</td>
                <td className="px-4 py-2"><RoleBadge role={a.role} /></td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('id-ID') : '—'}
                </td>
                <td className="px-4 py-2">
                  {a.isActive ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">aktif</span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">nonaktif</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => resetPassword(a.id, a.email)}
                    className="mr-2 text-xs text-blue-700 hover:underline"
                  >
                    Reset Password
                  </button>
                  {a.isActive && (
                    <button
                      onClick={() => deactivate(a.id, a.email)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Nonaktifkan
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Modal title="Tambah Admin Baru" onClose={() => setShowCreate(false)}>
          <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Nama" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <SelectField
            label="Role"
            value={form.role}
            options={[
              { value: 'super_admin', label: 'Super Admin (akses semua)' },
              { value: 'ops', label: 'Ops (KYC, booking, user)' },
              { value: 'finance', label: 'Finance (wallet, withdrawal)' },
              { value: 'fraud_analyst', label: 'Fraud Analyst (audit, fraud, blacklist)' },
              { value: 'support', label: 'Support (read-only user/booking)' },
            ]}
            onChange={(v) => setForm({ ...form, role: v })}
          />
          <Field label="Password (min 8 char)" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <button onClick={create} className="w-full rounded-md bg-blue-700 py-2 text-sm font-medium text-white">
            Simpan
          </button>
        </Modal>
      )}
    </div>
  );
}

// ============ COMMISSION ============
function CommissionTab() {
  const [list, setList] = useState<any[]>([]);
  async function load() {
    try { setList(await api.admin.commissionTiers()); } catch (e: any) { alert(e?.message); }
  }
  useEffect(() => { void load(); }, []);

  async function update(id: string, field: string, val: string) {
    const num = Number(val);
    if (isNaN(num)) return;
    try {
      await api.admin.updateCommissionTier(id, { [field]: num });
      void load();
    } catch (e: any) { alert(e?.message); }
  }

  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Tier Komisi Cleaner</h2>
      <p className="mb-3 text-xs text-slate-500">
        % komisi cleaner berdasarkan total order. Tools = bawa alat sendiri (dapat lebih besar).
      </p>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Range Min</th>
              <th className="px-4 py-2">Range Max</th>
              <th className="px-4 py-2">Tanpa Alat (%)</th>
              <th className="px-4 py-2">Bawa Alat (%)</th>
              <th className="px-4 py-2">Bonus Top Tier (%)</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-2">{t.rangeMin ? Number(t.rangeMin).toLocaleString('id-ID') : '—'}</td>
                <td className="px-4 py-2">{t.rangeMax ? Number(t.rangeMax).toLocaleString('id-ID') : '∞'}</td>
                <td className="px-4 py-2">
                  <InlineNum value={Number(t.shareNoTools ?? 0)} onSave={(v) => update(t.id, 'shareNoTools', String(v))} />
                </td>
                <td className="px-4 py-2">
                  <InlineNum value={Number(t.shareWithTools ?? 0)} onSave={(v) => update(t.id, 'shareWithTools', String(v))} />
                </td>
                <td className="px-4 py-2">
                  <InlineNum value={Number(t.topTierBonusPct ?? 0)} onSave={(v) => update(t.id, 'topTierBonusPct', String(v))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ SERVICES ============
function ServicesTab() {
  const [list, setList] = useState<any[]>([]);
  async function load() { try { setList(await api.admin.configServices()); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function toggle(id: string, isActive: boolean) {
    try { await api.admin.updateService(id, { isActive: !isActive }); void load(); } catch (e: any) { alert(e?.message); }
  }
  async function rename(id: string, current: string) {
    const v = prompt('Nama baru:', current);
    if (!v) return;
    try { await api.admin.updateService(id, { name: v }); void load(); } catch (e: any) { alert(e?.message); }
  }

  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Layanan</h2>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Aktif</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{s.code}</td>
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2">{s.displayOrder ?? '—'}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggle(s.id, s.isActive)}
                    className={`rounded-full px-2 py-0.5 text-xs ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}
                  >
                    {s.isActive ? 'aktif' : 'nonaktif'}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => rename(s.id, s.name)} className="text-xs text-blue-700 hover:underline">
                    Rename
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ HOURLY TIERS ============
function HourlyTab() {
  const [list, setList] = useState<any[]>([]);
  async function load() { try { setList(await api.admin.hourlyTiers()); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function update(id: string, field: string, val: string) {
    const num = Number(val);
    if (isNaN(num)) return;
    try { await api.admin.updateHourlyTier(id, { [field]: num }); void load(); } catch (e: any) { alert(e?.message); }
  }

  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Tarif Per Jam</h2>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Tarif/Jam</th>
              <th className="px-4 py-2">Min Jam</th>
              <th className="px-4 py-2">Share Cleaner (%)</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{t.code}</td>
                <td className="px-4 py-2">{t.name ?? '—'}</td>
                <td className="px-4 py-2">
                  <InlineNum
                    value={Number(t.pricePerHour ?? 0)}
                    fmt={(v) => `Rp ${v.toLocaleString('id-ID')}`}
                    onSave={(v) => update(t.id, 'pricePerHour', String(v))}
                  />
                </td>
                <td className="px-4 py-2">
                  <InlineNum value={Number(t.minHours ?? 0)} onSave={(v) => update(t.id, 'minHours', String(v))} />
                </td>
                <td className="px-4 py-2">
                  <InlineNum value={Number(t.cleanerSharePct ?? 0)} onSave={(v) => update(t.id, 'cleanerSharePct', String(v))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ BLACKLIST ============
function BlacklistTab() {
  const [list, setList] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: 'phone', value: '', reason: '' });
  async function load() { try { setList(await api.admin.blacklist()); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);

  async function add() {
    if (!form.value || !form.reason) return alert('Lengkapi value & reason.');
    try { await api.admin.addBlacklist(form); setShowAdd(false); setForm({ type: 'phone', value: '', reason: '' }); void load(); } catch (e: any) { alert(e?.message); }
  }
  async function remove(id: string, value: string) {
    if (!confirm(`Hapus ${value} dari blacklist?`)) return;
    try { await api.admin.removeBlacklist(id); void load(); } catch (e: any) { alert(e?.message); }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Blacklist ({list.length})</h2>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800">
          <Plus size={14} /> Tambah
        </button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Alasan</th>
              <th className="px-4 py-2">Ditambahkan</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">Blacklist kosong.</td></tr>
            ) : list.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-4 py-2"><span className="rounded bg-slate-200 px-2 py-0.5 text-xs">{b.type}</span></td>
                <td className="px-4 py-2 font-mono text-xs">{b.value}</td>
                <td className="px-4 py-2 text-slate-600">{b.reason}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{new Date(b.addedAt).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(b.id, b.value)} className="text-xs text-red-600 hover:underline">Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && (
        <Modal title="Tambah ke Blacklist" onClose={() => setShowAdd(false)}>
          <SelectField label="Type" value={form.type} options={['phone','device','ip','bank','nik','email'].map(v => ({ value: v, label: v }))} onChange={(v) => setForm({ ...form, type: v })} />
          <Field label="Value (no HP / device id / IP / dll)" value={form.value} onChange={(v) => setForm({ ...form, value: v })} />
          <Field label="Alasan" value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} />
          <button onClick={add} className="w-full rounded-md bg-red-700 py-2 text-sm font-medium text-white">Simpan</button>
        </Modal>
      )}
    </div>
  );
}

// ============ AUDIT LOG ============
function AuditTab() {
  const [list, setList] = useState<any[]>([]);
  async function load() { try { setList(await api.admin.auditLog({ limit: 200 })); } catch (e: any) { alert(e?.message); } }
  useEffect(() => { void load(); }, []);

  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Audit Log (200 terakhir)</h2>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Waktu</th>
              <th className="px-4 py-2">Admin</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Resource</th>
              <th className="px-4 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t align-top">
                <td className="px-4 py-2 text-xs text-slate-500">{new Date(a.performedAt).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2">
                  <div className="text-xs font-medium">{a.adminName ?? a.adminEmail}</div>
                  <div className="text-[10px] text-slate-500">{a.adminRole}</div>
                </td>
                <td className="px-4 py-2"><span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{a.action}</span></td>
                <td className="px-4 py-2 text-xs">{a.resourceType}{a.resourceId ? `:${a.resourceId.slice(0, 8)}…` : ''}</td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {a.changes ? <code className="text-[10px]">{JSON.stringify(a.changes)}</code> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ SHARED ============
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    super_admin: 'bg-purple-100 text-purple-700',
    ops: 'bg-blue-100 text-blue-700',
    finance: 'bg-green-100 text-green-700',
    fraud_analyst: 'bg-red-100 text-red-700',
    support: 'bg-slate-100 text-slate-700',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${colors[role] ?? 'bg-slate-100'}`}>{role}</span>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function InlineNum({ value, onSave, fmt }: { value: number; onSave: (v: number) => void; fmt?: (v: number) => string }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  if (!edit) {
    return (
      <button onClick={() => setEdit(true)} className="group inline-flex items-center gap-1 hover:text-blue-700">
        {fmt ? fmt(value) : value}
        <Edit2 size={11} className="opacity-0 group-hover:opacity-100" />
      </button>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEdit(false); if (Number(v) !== value) onSave(Number(v)); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setEdit(false); if (Number(v) !== value) onSave(Number(v)); } }}
      className="w-24 rounded border border-slate-300 px-2 py-0.5 text-sm"
    />
  );
}

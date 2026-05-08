'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Settings as SettingsIcon } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Select, Button, Badge, useConfirm, useToast } from '../../../components/ui';

const CATEGORIES = ['general', 'branding', 'typography', 'feature', 'contact'] as const;

const HINT: Record<string, string> = {
  'brand.app_name': 'Nama app — muncul di header & splash.',
  'brand.tagline': 'Tagline pendek di splash screen.',
  'brand.logo_url': 'URL logo (R2 public). Upload dulu via Content > Banner.',
  'brand.primary_color': 'Warna utama hex (#1D4ED8).',
  'brand.secondary_color': 'Warna sekunder hex.',
  'typography.font_family': 'Inter, Poppins, atau Plus Jakarta Sans (font yang sudah di-bundle di app).',
  'typography.base_size': 'Base font size dalam px (default 14).',
  'contact.whatsapp': 'No WA admin (62XXXX, no plus/strip).',
  'contact.email': 'Email CS.',
  'contact.phone': 'Telp CS (opsional).',
  'feature.cancel_window_sec': 'Detik free-cancel setelah confirm.',
  'feature.cancel_penalty_pct': '% penalty kalau cancel di luar window.',
  'feature.min_withdrawal': 'Min penarikan cleaner (Rupiah).',
  'feature.max_addresses': 'Max alamat tersimpan per user.',
  'hero.subtitle': 'Subtitle di home hero.',
  'hero.cta_label': 'CTA button label di hero.',
};

export default function AppSettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [filter, setFilter] = useState<string>('all');

  async function load() { setLoading(true); try { setList(await api.admin.appConfig()); } catch (e: any) { toast.error(e?.message); } setLoading(false); }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => filter === 'all' ? list : list.filter((c) => c.category === filter), [list, filter]);

  async function del(c: any) {
    const ok = await confirm({ title: 'Hapus config', message: `Yakin hapus key "${c.key}"? App akan pakai default jika ada.`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deleteAppConfig(c.key); toast.success('Config dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">App Settings</h1>
          <p className="text-sm text-slate-500">Konfigurasi global app — branding, typography, feature flags, kontak. Mobile auto-fetch saat boot.</p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Config</Button>
      </div>

      <div className="mt-4 flex gap-1 border-b">
        {(['all', ...CATEGORIES] as const).map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={`px-4 py-2 text-sm font-medium ${filter === c ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}>
            {c === 'all' ? 'Semua' : c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuat…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
          <SettingsIcon size={28} className="mx-auto mb-2 text-slate-400" />
          Belum ada config di kategori <b>{filter}</b>.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Key</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Deskripsi</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.key} className="border-t hover:bg-slate-50 align-top">
                  <td className="px-4 py-2 font-mono text-xs">{c.key}</td>
                  <td className="px-4 py-2"><Badge>{c.category}</Badge></td>
                  <td className="px-4 py-2 max-w-xs">
                    <ValuePreview value={c.value} keyName={c.key} />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.description ?? HINT[c.key] ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('id-ID') : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(c)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => del(c)}>Hapus</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && <ConfigFormModal config={editing.key ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function ValuePreview({ value, keyName }: { value: any; keyName: string }) {
  // Mask sensitive secrets
  const isSensitive = /(_key|_secret|_private|password|token)/i.test(keyName);
  if (isSensitive && typeof value === 'string') {
    if (!value) return <span className="text-xs italic text-amber-700">(belum diset)</span>;
    return <code className="text-xs">••••••••{value.slice(-4)}</code>;
  }
  if (typeof value === 'string') {
    if (keyName.includes('color')) {
      return (
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-4 rounded border" style={{ backgroundColor: value }} />
          <code className="text-xs">{value}</code>
        </div>
      );
    }
    if (keyName.includes('logo_url') || keyName.includes('image') || (typeof value === 'string' && value.startsWith('http'))) {
      return value.startsWith('http') ? <img src={value} alt="" className="h-8" /> : <code className="text-xs">{value}</code>;
    }
    return <span className="text-sm">{value}</span>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return <code className="text-sm">{String(value)}</code>;
  return <code className="text-[10px]">{JSON.stringify(value)}</code>;
}

function ConfigFormModal({ config, onClose, onSaved }: { config: any | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!config;
  const [form, setForm] = useState({
    key: config?.key ?? '',
    valueRaw: config ? JSON.stringify(config.value) : '""',
    description: config?.description ?? '',
    category: config?.category ?? 'general',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Detect simple value type for friendlier input
  const valueType: 'string' | 'number' | 'boolean' | 'json' = (() => {
    try {
      const v = JSON.parse(form.valueRaw);
      if (typeof v === 'string') return 'string';
      if (typeof v === 'number') return 'number';
      if (typeof v === 'boolean') return 'boolean';
      return 'json';
    } catch { return 'json'; }
  })();

  function setSimpleValue(v: string | number | boolean) {
    setForm({ ...form, valueRaw: JSON.stringify(v) });
  }

  async function save() {
    const e: Record<string, string> = {};
    if (!form.key) e.key = 'Wajib.';
    let parsed: any;
    try { parsed = JSON.parse(form.valueRaw); }
    catch { e.valueRaw = 'Value harus JSON valid (contoh: "teks", 123, true, {"key":"val"}).'; }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.admin.setAppConfig(form.key, { value: parsed, description: form.description || undefined, category: form.category });
      toast.success(isEdit ? 'Config di-update.' : 'Config dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  // Get current parsed value (for type-specific inputs)
  let parsedValue: any = undefined;
  try { parsedValue = JSON.parse(form.valueRaw); } catch {}

  return (
    <Modal
      title={isEdit ? `Edit ${config.key}` : 'Tambah Config'}
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
        <Input label="Key" required value={form.key} onChange={(v) => setForm({ ...form, key: v })} error={errors.key} placeholder="brand.app_name" helpText="Format: namespace.key (mis. brand.app_name, feature.min_withdrawal)" />
        <Select label="Category" value={form.category} options={CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(v) => setForm({ ...form, category: v })} />

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Value <span className="text-red-500">*</span></label>
          {valueType === 'string' ? (
            <input
              type={form.key.includes('color') ? 'color' : 'text'}
              value={parsedValue ?? ''}
              onChange={(e) => setSimpleValue(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          ) : valueType === 'number' ? (
            <input
              type="number"
              value={parsedValue ?? 0}
              onChange={(e) => setSimpleValue(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          ) : valueType === 'boolean' ? (
            <select
              value={String(parsedValue)}
              onChange={(e) => setSimpleValue(e.target.value === 'true')}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : null}

          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer">Edit raw JSON (advanced)</summary>
            <textarea
              rows={3}
              value={form.valueRaw}
              onChange={(e) => setForm({ ...form, valueRaw: e.target.value })}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              placeholder='"teks" / 123 / true / {"key":"val"}'
            />
            {errors.valueRaw && <p className="mt-1 text-xs text-red-600">{errors.valueRaw}</p>}
          </details>
        </div>

        <Textarea label="Deskripsi" rows={2} value={form.description} onChange={(v) => setForm({ ...form, description: v })} helpText="Penjelasan untuk admin lain." />
      </div>
    </Modal>
  );
}

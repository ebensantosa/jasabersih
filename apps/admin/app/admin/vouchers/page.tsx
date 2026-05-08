'use client';

import { useEffect, useState } from 'react';
import { Plus, X, Tag } from 'lucide-react';

import { api } from '../../../lib/api';

export default function VouchersPage() {
  const [list, setList] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: 10,
    maxDiscount: 50000,
    minOrder: 100000,
    totalQuota: 100,
    perUserLimit: 1,
    validFrom: new Date().toISOString().slice(0, 16),
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
  });

  async function load() {
    try { setList(await api.admin.vouchers()); } catch (e: any) { alert(e?.message); }
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (!form.code || !form.value || !form.validFrom || !form.validUntil) return alert('Code, value, validity wajib.');
    try {
      await api.admin.createVoucher({
        ...form,
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: new Date(form.validUntil).toISOString(),
      });
      setShowForm(false);
      void load();
    } catch (e: any) { alert(e?.message); }
  }

  async function toggle(id: string, isActive: boolean) {
    try { await api.admin.updateVoucher(id, { isActive: !isActive }); void load(); } catch (e: any) { alert(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vouchers & Promo</h1>
          <p className="text-sm text-slate-500">Diskon code untuk customer. Track usage & abuse.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white">
          <Plus size={14} /> Buat Voucher
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Min Order</th>
              <th className="px-4 py-2">Pemakaian</th>
              <th className="px-4 py-2">Berlaku</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500"><Tag className="mx-auto mb-2 text-slate-400" size={28} />Belum ada voucher.</td></tr>
            ) : list.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="px-4 py-2"><code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{v.code}</code></td>
                <td className="px-4 py-2 text-xs">{v.type}</td>
                <td className="px-4 py-2 font-bold">
                  {v.type === 'percentage' ? `${Number(v.value)}%` : `Rp ${Number(v.value).toLocaleString('id-ID')}`}
                  {v.maxDiscount && v.type === 'percentage' && <div className="text-[10px] font-normal text-slate-500">max Rp {Number(v.maxDiscount).toLocaleString('id-ID')}</div>}
                </td>
                <td className="px-4 py-2 text-xs">Rp {Number(v.minOrder ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2 text-xs">
                  {v.usedCount} {v.totalQuota ? `/ ${v.totalQuota}` : '/ ∞'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {new Date(v.validFrom).toLocaleDateString('id-ID')} → {new Date(v.validUntil).toLocaleDateString('id-ID')}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => toggle(v.id, v.isActive)} className={`rounded-full px-2 py-0.5 text-xs ${v.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>
                    {v.isActive ? 'aktif' : 'nonaktif'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-bold">Buat Voucher Baru</h3>
              <button onClick={() => setShowForm(false)} className="rounded-full p-1 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-4">
              <Input label="Code (otomatis UPPERCASE)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="JBSIH50" />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed (Rupiah)</option>
                </select>
              </div>
              <Input label={form.type === 'percentage' ? 'Value (%)' : 'Value (Rupiah)'} type="number" value={String(form.value)} onChange={(v) => setForm({ ...form, value: Number(v) })} />
              {form.type === 'percentage' && (
                <Input label="Max Discount (Rupiah)" type="number" value={String(form.maxDiscount)} onChange={(v) => setForm({ ...form, maxDiscount: Number(v) })} />
              )}
              <Input label="Min Order (Rupiah)" type="number" value={String(form.minOrder)} onChange={(v) => setForm({ ...form, minOrder: Number(v) })} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Quota Total" type="number" value={String(form.totalQuota)} onChange={(v) => setForm({ ...form, totalQuota: Number(v) })} />
                <Input label="Limit Per User" type="number" value={String(form.perUserLimit)} onChange={(v) => setForm({ ...form, perUserLimit: Number(v) })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Berlaku Dari" type="datetime-local" value={form.validFrom} onChange={(v) => setForm({ ...form, validFrom: v })} />
                <Input label="Berlaku Sampai" type="datetime-local" value={form.validUntil} onChange={(v) => setForm({ ...form, validUntil: v })} />
              </div>
              <button onClick={save} className="w-full rounded-md bg-blue-700 py-2 text-sm font-medium text-white">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}

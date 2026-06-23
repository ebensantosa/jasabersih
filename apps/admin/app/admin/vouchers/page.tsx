'use client';

import { useEffect, useState } from 'react';
import { Plus, Tag, Pencil } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Select, Switch, Button, Badge, useToast } from '../../../components/ui';

export default function VouchersPage() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() { setLoading(true); try { setList(await api.admin.vouchers()); } catch (e: any) { toast.error(e?.message); } setLoading(false); }
  useEffect(() => { void load(); }, []);

  async function toggle(v: any) {
    try { await api.admin.updateVoucher(v.id, { isActive: !v.isActive }); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vouchers & Promo</h1>
          <p className="text-sm text-slate-500">Diskon code untuk customer. Track usage & abuse.</p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Buat Voucher</Button>
      </div>

      {loading ? (
        <div className="mt-4 py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : (
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
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500"><Tag className="mx-auto mb-2 text-slate-400" size={28} />Belum ada voucher.</td></tr>
              ) : list.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-4 py-2"><code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{v.code}</code></td>
                  <td className="px-4 py-2 text-xs">{v.type}</td>
                  <td className="px-4 py-2 font-bold">
                    {v.type === 'percentage' ? `${Number(v.value)}%` : `Rp ${Number(v.value).toLocaleString('id-ID')}`}
                    {v.maxDiscount && v.type === 'percentage' && <div className="text-[10px] font-normal text-slate-500">max Rp {Number(v.maxDiscount).toLocaleString('id-ID')}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs">Rp {Number(v.minOrder ?? 0).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2 text-xs">{v.usedCount} {v.totalQuota ? `/ ${v.totalQuota}` : '/ âˆž'}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(v.validFrom).toLocaleDateString('id-ID')} â†’ {new Date(v.validUntil).toLocaleDateString('id-ID')}</td>
                  <td className="px-4 py-2"><button onClick={() => toggle(v)}>{v.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}</button></td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(v)}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && <VoucherFormModal voucher={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function VoucherFormModal({ voucher, onClose, onSaved }: { voucher: any | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!voucher;
  const [form, setForm] = useState({
    code: voucher?.code ?? '',
    type: (voucher?.type ?? 'percentage') as 'percentage' | 'fixed',
    value: Number(voucher?.value ?? 10),
    maxDiscount: Number(voucher?.maxDiscount ?? 50000),
    minOrder: Number(voucher?.minOrder ?? 100000),
    totalQuota: Number(voucher?.totalQuota ?? 100),
    perUserLimit: Number(voucher?.perUserLimit ?? 1),
    validFrom: voucher?.validFrom ? new Date(voucher.validFrom).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    validUntil: voucher?.validUntil ? new Date(voucher.validUntil).toISOString().slice(0, 16) : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
    isActive: voucher?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!isEdit) {
      if (!form.code) e.code = 'Wajib.';
      if (!form.value || form.value <= 0) e.value = 'Wajib > 0.';
      if (form.type === 'percentage' && form.value > 100) e.value = 'Max 100% untuk percentage.';
      if (!form.validFrom) e.validFrom = 'Wajib.';
      if (!form.validUntil) e.validUntil = 'Wajib.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (isEdit) {
        await api.admin.updateVoucher(voucher.id, {
          isActive: form.isActive,
          validUntil: new Date(form.validUntil).toISOString(),
          totalQuota: form.totalQuota,
        });
      } else {
        await api.admin.createVoucher({
          code: form.code,
          type: form.type,
          value: form.value,
          maxDiscount: form.maxDiscount,
          minOrder: form.minOrder,
          totalQuota: form.totalQuota,
          perUserLimit: form.perUserLimit,
          validFrom: new Date(form.validFrom).toISOString(),
          validUntil: new Date(form.validUntil).toISOString(),
        });
      }
      toast.success(isEdit ? 'Voucher di-update.' : 'Voucher dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${voucher.code}` : 'Buat Voucher Baru'}
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
        {!isEdit ? (
          <>
            <Input label="Code (otomatis UPPERCASE)" required value={form.code} onChange={(v) => setForm({ ...form, code: v })} error={errors.code} placeholder="JBSIH50" />
            <Select label="Type" required value={form.type} options={[{ value: 'percentage', label: 'Percentage (%)' }, { value: 'fixed', label: 'Fixed (Rupiah)' }]} onChange={(v) => setForm({ ...form, type: v as any })} />
            <Input label={form.type === 'percentage' ? 'Value (%)' : 'Value (Rupiah)'} type="number" required value={String(form.value)} onChange={(v) => setForm({ ...form, value: Number(v) })} error={errors.value} />
            {form.type === 'percentage' && <Input label="Max Discount (Rupiah)" type="number" value={String(form.maxDiscount)} onChange={(v) => setForm({ ...form, maxDiscount: Number(v) })} helpText="Cap maksimal diskon â€” penting untuk percentage." />}
            <Input label="Min Order (Rupiah)" type="number" value={String(form.minOrder)} onChange={(v) => setForm({ ...form, minOrder: Number(v) })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Quota Total" type="number" value={String(form.totalQuota)} onChange={(v) => setForm({ ...form, totalQuota: Number(v) })} helpText="0 = unlimited" />
              <Input label="Limit Per User" type="number" value={String(form.perUserLimit)} onChange={(v) => setForm({ ...form, perUserLimit: Number(v) })} />
            </div>
          </>
        ) : (
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <div>Code: <code>{voucher.code}</code> Â· Type: {voucher.type} Â· Value: {voucher.type === 'percentage' ? `${voucher.value}%` : `Rp ${Number(voucher.value).toLocaleString('id-ID')}`}</div>
            <div className="text-xs text-slate-500">Pemakaian: {voucher.usedCount} / {voucher.totalQuota ?? 'âˆž'}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {!isEdit && <Input label="Berlaku Dari" type="datetime-local" required value={form.validFrom} onChange={(v) => setForm({ ...form, validFrom: v })} error={errors.validFrom} />}
          <Input label="Berlaku Sampai" type="datetime-local" required value={form.validUntil} onChange={(v) => setForm({ ...form, validUntil: v })} error={errors.validUntil} />
        </div>
        {isEdit && <Input label="Quota Total" type="number" value={String(form.totalQuota)} onChange={(v) => setForm({ ...form, totalQuota: Number(v) })} />}
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

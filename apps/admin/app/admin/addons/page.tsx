'use client';

import { useEffect, useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, Button, Input, Modal, Switch, Textarea, useConfirm, useToast } from '../../../components/ui';

type Addon = {
  id: string;
  code: string | null;
  name: string;
  price: number;
  durationMin: number;
  displayOrder: number;
  description: string | null;
  isActive: boolean;
  inputType: 'qty' | 'checkbox';
};

function rupiah(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

export default function AddonsPage(): React.ReactElement | null {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Addon> | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.admin.addons();
      setList(data as Addon[]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal load');
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggleActive(a: Addon) {
    try {
      await api.admin.updateAddon(a.id, { isActive: !a.isActive });
      void load();
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  async function del(a: Addon) {
    const ok = await confirm({
      title: 'Hapus add-on',
      message: `Yakin hapus "${a.name}"? Data booking lama yang pakai add-on ini tidak terpengaruh.`,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.admin.deleteAddon(a.id);
      toast.success('Add-on dihapus');
      void load();
    } catch (e: any) {
      toast.error(e?.message);
    }
  }

  const activeCount = list.filter((a) => a.isActive).length;
  const inactiveCount = list.length - activeCount;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add-On Layanan</h1>
          <p className="text-sm text-slate-500">Kelola daftar add-on yang bisa dipilih customer saat booking.</p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>
          Tambah Add-On
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Memuat...</div>
      ) : list.length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed p-14 text-center text-sm text-slate-500">
          <Package size={32} className="mx-auto mb-2 text-slate-400" />
          Belum ada add-on. Klik "Tambah Add-On" untuk mulai.
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-md border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-center">Urut</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Nama</th>
                  <th className="px-3 py-2 text-right">Harga</th>
                  <th className="px-3 py-2 text-right">Durasi</th>
                  <th className="px-3 py-2 text-center">Input</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((a) => (
                  <tr key={a.id} className={a.isActive ? '' : 'opacity-50'}>
                    <td className="px-3 py-2 text-center font-mono text-xs text-slate-500">{a.displayOrder ?? 0}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{a.code ?? '-'}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{a.name}</div>
                      {a.description && <div className="text-xs text-slate-500">{a.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-brand-700">{rupiah(Number(a.price))}</td>
                    <td className="px-3 py-2 text-right text-xs text-slate-500">{a.durationMin} mnt</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={a.inputType === 'checkbox' ? 'blue' : 'slate'}>
                        {a.inputType === 'checkbox' ? 'centang' : 'qty'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => toggleActive(a)}>
                        {a.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={<Pencil size={11} />} onClick={() => setEditing(a)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} onClick={() => del(a)}>
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {activeCount} aktif · {inactiveCount} nonaktif · {list.length} total
          </p>
        </>
      )}

      {editing !== null && (
        <AddonFormModal
          addon={editing.id ? (editing as Addon) : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function AddonFormModal({
  addon,
  onClose,
  onSaved,
}: {
  addon: Addon | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState(addon?.code ?? '');
  const [name, setName] = useState(addon?.name ?? '');
  const [description, setDescription] = useState(addon?.description ?? '');
  const [price, setPrice] = useState<number>(Number(addon?.price ?? 0));
  const [durationMin, setDurationMin] = useState<number>(Number(addon?.durationMin ?? 30));
  const [displayOrder, setDisplayOrder] = useState<number>(Number(addon?.displayOrder ?? 0));
  const [isActive, setIsActive] = useState<boolean>(addon?.isActive ?? true);
  const [inputType, setInputType] = useState<'qty' | 'checkbox'>(addon?.inputType ?? 'qty');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !price) {
      toast.error('Nama dan Harga wajib diisi');
      return;
    }
    if (durationMin < 1) {
      toast.error('Durasi minimal 1 menit');
      return;
    }
    setBusy(true);
    try {
      const body = {
        code: code.trim().toLowerCase() || undefined,
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        durationMin: Number(durationMin),
        displayOrder: Number(displayOrder) || 0,
        isActive,
        inputType,
      };
      if (addon) await api.admin.updateAddon(addon.id, body);
      else await api.admin.createAddon(body);
      toast.success(addon ? 'Add-on ter-update' : 'Add-on dibuat');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal simpan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={addon ? 'Edit Add-On' : 'Tambah Add-On'}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Code (opsional, unik)"
            value={code}
            onChange={setCode}
            placeholder="vacuum_lantai"
            hint="Huruf kecil + underscore"
            disabled={!!addon}
          />
          <Input label="Nama" value={name} onChange={setName} placeholder="Vacuum + Pel Lantai" />
        </div>
        <Textarea
          label="Deskripsi (opsional)"
          value={description ?? ''}
          onChange={setDescription}
          rows={2}
          placeholder="Keterangan singkat untuk customer"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Harga (Rp)"
            type="number"
            value={String(price)}
            onChange={(v) => setPrice(Number(v))}
            hint={price ? rupiah(price) : undefined}
          />
          <Input
            label="Durasi (menit)"
            type="number"
            value={String(durationMin)}
            onChange={(v) => setDurationMin(Number(v))}
            hint="Estimasi waktu pengerjaan"
          />
        </div>
        <Input
          label="Urutan Tampil"
          type="number"
          value={String(displayOrder)}
          onChange={(v) => setDisplayOrder(Number(v))}
          hint="Angka kecil tampil lebih dulu"
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Tipe Input di App</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInputType('qty')}
              className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition ${inputType === 'qty' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              +/- Quantity
            </button>
            <button
              type="button"
              onClick={() => setInputType('checkbox')}
              className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition ${inputType === 'checkbox' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Centang
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {inputType === 'checkbox'
              ? 'Cocok untuk item yang biasanya cukup 1 unit (kulkas, kompor, dll).'
              : 'Cocok untuk item yang bisa dipilih lebih dari 1 (kasur, sofa, dll).'}
          </p>
        </div>
        <div className="flex items-center justify-between rounded border p-2">
          <span className="text-sm">Aktif (tampil di app)</span>
          <Switch checked={isActive} onChange={setIsActive} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  );
}

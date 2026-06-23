'use client';

import { useEffect, useState } from 'react';
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, Button, Input, Modal, Switch, Textarea, useConfirm, useToast } from '../../../components/ui';

type Tier = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  pricePerHour: number;
  minHours: number;
  maxHours: number;
  cleanerSharePct: number;
  isActive: boolean;
  displayOrder: number;
};

function rupiah(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

export default function HourlyTiersPage(): React.ReactElement {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Tier> | null>(null);
  const [perRoomEnabled, setPerRoomEnabled] = useState(true);
  const [perHourEnabled, setPerHourEnabled] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const tiers = await api.admin.hourlyTiers();
      setList(tiers as Tier[]);
      const configs = await api.admin.appConfig();
      const perRoom = configs.find((c: any) => c.key === 'booking.modes.per_room.enabled');
      const perHour = configs.find((c: any) => c.key === 'booking.modes.per_hour.enabled');
      setPerRoomEnabled(perRoom?.value === true || perRoom?.value === 'true' || perRoom?.value === undefined);
      setPerHourEnabled(perHour?.value === true || perHour?.value === 'true' || perHour?.value === undefined);
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal load');
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggleMode(key: string, value: boolean) {
    try {
      await api.admin.setAppConfig(key, { value, category: 'booking' });
      toast.success('Mode di-update');
      void load();
    } catch (e: any) { toast.error(e?.message); }
  }

  async function toggleActive(t: Tier) {
    try {
      await api.admin.updateHourlyTier(t.id, { isActive: !t.isActive });
      void load();
    } catch (e: any) { toast.error(e?.message); }
  }

  async function del(t: Tier) {
    const ok = await confirm({ title: 'Nonaktifkan tier', message: `Yakin nonaktifkan "${t.name}"? (data history tidak dihapus, hanya disembunyikan)`, variant: 'danger' });
    if (!ok) return;
    try {
      await api.admin.deleteHourlyTier(t.id);
      toast.success('Tier dinonaktifkan');
      void load();
    } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Booking Mode & Tier Per-Jam</h1>
          <p className="text-sm text-slate-500">Atur tarif booking per-jam + toggle mode booking (per-ruangan / per-jam).</p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Tier</Button>
      </div>

      {/* Mode toggles */}
      <div className="mt-5 rounded-md border bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Mode Booking Aktif</h2>
        <p className="text-xs text-slate-500">Nonaktifkan salah satu kalau ingin batasi pilihan customer.</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center justify-between rounded border p-3">
            <div>
              <div className="text-sm font-semibold">Per Ruangan / Paket</div>
              <div className="text-xs text-slate-500">Harga tetap berdasarkan jumlah kamar/area</div>
            </div>
            <Switch checked={perRoomEnabled} onChange={(v) => toggleMode('booking.modes.per_room.enabled', v)} />
          </div>
          <div className="flex flex-1 items-center justify-between rounded border p-3">
            <div>
              <div className="text-sm font-semibold">Per Jam</div>
              <div className="text-xs text-slate-500">Bayar sesuai durasi (min 2 jam)</div>
            </div>
            <Switch checked={perHourEnabled} onChange={(v) => toggleMode('booking.modes.per_hour.enabled', v)} />
          </div>
        </div>
        {!perRoomEnabled && !perHourEnabled && (
          <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
            âš  Kedua mode dinonaktifkan â€” customer tidak bisa booking sama sekali.
          </div>
        )}
      </div>

      {/* Tier list */}
      <div className="mt-5">
        <h2 className="text-sm font-semibold text-slate-900">Tier Per-Jam</h2>
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
        ) : list.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
            <Clock size={28} className="mx-auto mb-2 text-slate-400" />
            Belum ada tier per-jam. Klik "Tambah Tier" untuk setup.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-md border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Nama</th>
                  <th className="px-3 py-2 text-right">Tarif/Jam</th>
                  <th className="px-3 py-2 text-center">Minâ€“Max</th>
                  <th className="px-3 py-2 text-right">Komisi Cleaner</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((t) => (
                  <tr key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                    <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{t.name}</div>
                      {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{rupiah(Number(t.pricePerHour))}</td>
                    <td className="px-3 py-2 text-center text-xs">{t.minHours}â€“{t.maxHours} jam</td>
                    <td className="px-3 py-2 text-right">{Number(t.cleanerSharePct)}%</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => toggleActive(t)}>
                        {t.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={<Pencil size={11} />} onClick={() => setEditing(t)}>Edit</Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} onClick={() => del(t)}>Hapus</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && (
        <TierFormModal
          tier={editing.id ? (editing as Tier) : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

function TierFormModal({ tier, onClose, onSaved }: { tier: Tier | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(tier?.code ?? '');
  const [name, setName] = useState(tier?.name ?? '');
  const [description, setDescription] = useState(tier?.description ?? '');
  const [pricePerHour, setPricePerHour] = useState<number>(Number(tier?.pricePerHour ?? 90000));
  const [minHours, setMinHours] = useState<number>(Number(tier?.minHours ?? 2));
  const [maxHours, setMaxHours] = useState<number>(Number(tier?.maxHours ?? 8));
  const [cleanerSharePct, setCleanerSharePct] = useState<number>(Number(tier?.cleanerSharePct ?? 60));
  const [displayOrder, setDisplayOrder] = useState<number>(Number(tier?.displayOrder ?? 0));
  const [isActive, setIsActive] = useState<boolean>(tier?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!code.trim() || !name.trim() || !pricePerHour) {
      toast.error('Code, Nama, Tarif/Jam wajib diisi');
      return;
    }
    if (minHours < 1 || maxHours < minHours) {
      toast.error('Min jam â‰¥ 1 dan Max â‰¥ Min');
      return;
    }
    setBusy(true);
    try {
      const body = {
        code: code.trim().toLowerCase(),
        name: name.trim(),
        description: description.trim() || null,
        pricePerHour: Number(pricePerHour),
        minHours: Number(minHours),
        maxHours: Number(maxHours),
        cleanerSharePct: Number(cleanerSharePct),
        displayOrder: Number(displayOrder),
        isActive,
      };
      if (tier) await api.admin.updateHourlyTier(tier.id, body);
      else await api.admin.createHourlyTier(body);
      toast.success(tier ? 'Tier ter-update' : 'Tier dibuat');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal simpan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tier ? 'Edit Tier Per-Jam' : 'Buat Tier Per-Jam'}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Code (unik)" value={code} onChange={setCode} placeholder="general / deep" disabled={!!tier} />
          <Input label="Nama" value={name} onChange={setName} placeholder="General Cleaning" />
        </div>
        <Textarea label="Deskripsi" value={description ?? ''} onChange={setDescription} rows={2} placeholder="Sapu, pel, lap, rapikan" />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Tarif per Jam (Rp)"
            type="number"
            value={String(pricePerHour)}
            onChange={(v) => setPricePerHour(Number(v))}
            hint={pricePerHour ? rupiah(pricePerHour) : undefined}
          />
          <Input label="Komisi Cleaner (%)" type="number" value={String(cleanerSharePct)} onChange={(v) => setCleanerSharePct(Number(v))} hint="0-100" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Min Jam" type="number" value={String(minHours)} onChange={(v) => setMinHours(Number(v))} />
          <Input label="Max Jam" type="number" value={String(maxHours)} onChange={(v) => setMaxHours(Number(v))} />
          <Input label="Urutan" type="number" value={String(displayOrder)} onChange={(v) => setDisplayOrder(Number(v))} hint="kecil = atas" />
        </div>
        <div className="flex items-center justify-between rounded border p-2">
          <span className="text-sm">Aktif</span>
          <Switch checked={isActive} onChange={setIsActive} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Menyimpanâ€¦' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  );
}

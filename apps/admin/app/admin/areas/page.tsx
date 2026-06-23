'use client';

import { useEffect, useState } from 'react';
import { Inbox, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, Button, Input, Modal, Switch, Textarea, useConfirm, useToast } from '../../../components/ui';
import { MapPicker } from '../../../components/MapPicker';

type SubTab = 'areas' | 'requests';

export default function AreasPage(): React.ReactElement {
  const [tab, setTab] = useState<SubTab>('areas');
  const [requestCount, setRequestCount] = useState(0);

  // Sum total individual entries (not unique cities) for the badge.
  useEffect(() => {
    api.admin.listCityRequests()
      .then((rows: any[]) => setRequestCount(rows.reduce((acc, r) => acc + (r.requestCount ?? 0), 0)))
      .catch(() => setRequestCount(0));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Area Layanan</h1>
      <p className="text-sm text-slate-500">Kelola kota yang dilayani + request ekspansi dari customer.</p>

      <div className="mt-4 flex gap-1 border-b">
        <SubTabBtn active={tab === 'areas'} onClick={() => setTab('areas')} icon={<MapPin size={14} />} label="Area Aktif" />
        <SubTabBtn
          active={tab === 'requests'}
          onClick={() => setTab('requests')}
          icon={<Inbox size={14} />}
          label="Request Kota"
          badge={requestCount}
        />
      </div>

      <div className="mt-6">
        {tab === 'areas' && <AreasTab />}
        {tab === 'requests' && <RequestsTab onChange={() => api.admin.listCityRequests().then((r: any[]) => setRequestCount(r.reduce((a, x) => a + (x.requestCount ?? 0), 0))).catch(() => {})} />}
      </div>
    </div>
  );
}

function SubTabBtn({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: any; label: string; badge?: number }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${active ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}>
      {icon} {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

// ============ AREAS (existing service areas â€” copied from old content/page) ============
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
      <div className="mb-3 flex justify-between">
        <h2 className="text-base font-semibold">Area Aktif ({list.length})</h2>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>Tambah Area</Button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Kota</th><th className="px-4 py-2">Radius</th><th className="px-4 py-2">Surge</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Aksi</th></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2">{a.city}</td>
                <td className="px-4 py-2 text-xs">{(Number(a.radiusM) / 1000).toFixed(1)} km</td>
                <td className="px-4 py-2 text-xs">{Number(a.surgeMultiplier).toFixed(2)}Ã—</td>
                <td className="px-4 py-2"><button onClick={() => toggle(a)}><Badge>{a.isActive ? 'aktif' : 'nonaktif'}</Badge></button></td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={<Pencil size={11} />} onClick={() => setEditing(a)}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={11} />} onClick={() => del(a)}>Hapus</Button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada area aktif.</td></tr>}
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
    lat: String(area?.lat ?? '-7.7956'),
    lng: String(area?.lng ?? '110.3695'),
    radiusM: String(area?.radiusM ?? '15000'),
    surgeMultiplier: String(area?.surgeMultiplier ?? '1'),
    notes: area?.notes ?? '',
    isActive: area?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (isEdit) {
        await api.admin.updateServiceArea(area.id, {
          name: form.name,
          isActive: form.isActive,
          surgeMultiplier: Number(form.surgeMultiplier),
          radiusM: Number(form.radiusM),
          notes: form.notes,
          lat: Number(form.lat),
          lng: Number(form.lng),
        });
      } else {
        // City auto = nama area
        await api.admin.createServiceArea({ ...form, city: form.name, lat: Number(form.lat), lng: Number(form.lng), radiusM: Number(form.radiusM), surgeMultiplier: Number(form.surgeMultiplier) });
      }
      toast.success(isEdit ? 'Di-update.' : 'Dibuat.');
      onSaved();
    } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isEdit ? `Edit ${area.name}` : 'Tambah Area'} open={true} onClose={onClose} size="md" footer={
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Batal</Button><Button variant="primary" onClick={save} loading={busy}>Simpan</Button></div>
    }>
      <div className="space-y-3">
        <Input label="Nama Kota / Area" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Yogyakarta" />
        <div>
          <label className="text-xs font-semibold text-slate-700">Titik Pusat (Centroid)</label>
          <div className="mt-1">
            <MapPicker
              lat={Number(form.lat) || -7.7956}
              lng={Number(form.lng) || 110.3695}
              onChange={(lat, lng) => setForm((f) => ({ ...f, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }))}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input label="Latitude" value={form.lat} onChange={(v) => setForm({ ...form, lat: v })} placeholder="-7.7956" />
            <Input label="Longitude" value={form.lng} onChange={(v) => setForm({ ...form, lng: v })} placeholder="110.3695" />
          </div>
        </div>
        <Input label="Radius (meter)" type="number" value={form.radiusM} onChange={(v) => setForm({ ...form, radiusM: v })} helpText="15000 = radius 15 km" />
        <Input label="Surge Multiplier" value={form.surgeMultiplier} onChange={(v) => setForm({ ...form, surgeMultiplier: v })} helpText="1.0 = normal, 1.2 = +20%" />
        <Textarea label="Notes" rows={2} value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        {isEdit && <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={form.isActive ? 'Aktif' : 'Nonaktif'} />}
      </div>
    </Modal>
  );
}

// ============ CITY REQUESTS ============
function RequestsTab({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() { setLoading(true); try { setList(await api.admin.listCityRequests()); } catch (e: any) { toast.error(e?.message); } setLoading(false); onChange(); }
  useEffect(() => { void load(); }, []);

  async function delEntry(id: string, city: string) {
    const ok = await confirm({ title: 'Hapus request', message: `Hapus 1 entry untuk "${city}"?`, variant: 'danger' });
    if (!ok) return;
    try { await api.admin.deleteCityRequest(id); toast.success('Dihapus.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  async function ackEntry(id: string) {
    try { await api.admin.ackCityRequest(id); toast.success('Ditandai sudah ditinjau.'); void load(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <h2 className="text-base font-semibold">Request Kota Baru ({list.length} kota)</h2>
      <p className="mt-1 text-xs text-slate-500">Customer di kota yang belum dilayani submit lewat mobile app. Diurutkan berdasarkan jumlah request terbanyak.</p>
      {loading ? (
        <div className="mt-8 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : list.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
          Belum ada request kota baru.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {list.map((r: any) => (
            <div key={r.city} className="rounded-md border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-bold capitalize text-slate-900">{r.city}</div>
                  <div className="text-xs text-slate-500">
                    {r.requestCount} request Â· terakhir {new Date(r.lastRequestAt).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <Badge>{r.requestCount}Ã—</Badge>
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
                          <td className="px-2 py-1">{s.contactName ?? 'â€”'}</td>
                          <td className="px-2 py-1">{s.contactPhone ?? 'â€”'}</td>
                          <td className="px-2 py-1">{s.notes ?? 'â€”'}</td>
                          <td className="px-2 py-1 flex gap-3">
                            <button onClick={() => ackEntry(s.id)} className="text-green-600 hover:underline">Acc</button>
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

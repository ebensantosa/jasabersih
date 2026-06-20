'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, Button, Input, Modal, Switch, Textarea, useToast } from '../../../components/ui';

type Tier = {
  id: string;
  code: string;
  label: string;
  tagline: string | null;
  multiplier: number;
  scope: string[];
  isActive: boolean;
  displayOrder: number;
};

export default function SubscriptionTiersPage() {
  const toast = useToast();
  const [list, setList] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tier | null>(null);

  async function load() {
    setLoading(true);
    try {
      setList((await api.admin.subscriptionTiers()) as Tier[]);
    } catch (e: any) { toast.error(e?.message ?? 'Gagal load'); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggleActive(t: Tier) {
    try {
      await api.admin.updateSubscriptionTier(t.id, { isActive: !t.isActive });
      void load();
    } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tier Paket Berlangganan</h1>
          <p className="text-sm text-slate-500">Atur deskripsi, scope layanan, & multiplier harga untuk Basic / Standard / Premium / Ultimate.</p>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Memuat…</div>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Label & Tagline</th>
                  <th className="px-3 py-2 text-center">Multiplier</th>
                  <th className="px-3 py-2 text-left">Scope</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((t) => (
                  <tr key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                    <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{t.label}</div>
                      {t.tagline && <div className="text-xs text-slate-500">{t.tagline}</div>}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">{Number(t.multiplier).toFixed(2)}×</td>
                    <td className="px-3 py-2">
                      <div className="text-xs text-slate-600">{(t.scope ?? []).length} layanan</div>
                      {(t.scope ?? []).slice(0, 2).map((s, i) => (
                        <div key={i} className="text-[10px] text-slate-500 truncate max-w-xs">✓ {s}</div>
                      ))}
                      {(t.scope ?? []).length > 2 && <div className="text-[10px] text-slate-400">+{t.scope.length - 2} lainnya</div>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => toggleActive(t)}>
                        {t.isActive ? <Badge variant="green">aktif</Badge> : <Badge>nonaktif</Badge>}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" icon={<Pencil size={11} />} onClick={() => setEditing(t)}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <TierFormModal tier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function TierFormModal({ tier, onClose, onSaved }: { tier: Tier; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(tier.label);
  const [tagline, setTagline] = useState(tier.tagline ?? '');
  const [multiplier, setMultiplier] = useState<number>(Number(tier.multiplier));
  const [scopeText, setScopeText] = useState((tier.scope ?? []).join('\n'));
  const [isActive, setIsActive] = useState(tier.isActive);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!label.trim()) { toast.error('Label wajib'); return; }
    setBusy(true);
    try {
      const scope = scopeText.split('\n').map((s) => s.trim()).filter(Boolean);
      await api.admin.updateSubscriptionTier(tier.id, {
        label: label.trim(),
        tagline: tagline.trim() || null,
        multiplier,
        scope,
        isActive,
      });
      toast.success('Tier ter-update');
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? 'Gagal simpan'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${tier.label}`}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Code" value={tier.code} onChange={() => {}} disabled />
          <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Basic / Standard / ..." />
        </div>
        <Input label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Bersih dasar harian" />
        <Input
          label="Multiplier Harga"
          type="number"
          value={String(multiplier)}
          onChange={(e) => setMultiplier(Number(e.target.value))}
          hint="Contoh: 1.0 = harga normal, 1.25 = 25% lebih mahal, 1.85 = 85% lebih mahal"
        />
        <Textarea
          label="Scope Layanan (satu per baris)"
          value={scopeText}
          onChange={(e) => setScopeText(e.target.value)}
          rows={8}
          hint="Tiap baris jadi 1 item bullet point. Contoh: 'Sapu & pel seluruh lantai'"
        />
        <div className="flex items-center justify-between rounded border p-2">
          <span className="text-sm">Aktif</span>
          <Switch checked={isActive} onChange={setIsActive} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </div>
      </div>
    </Modal>
  );
}

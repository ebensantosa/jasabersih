'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Eye, X, Check, Clock, AlertCircle, Plus, RefreshCcw, Trash2 } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Switch, Textarea, Button, Badge, useConfirm, useToast } from '../../../components/ui';

type Cleaner = { user_id: string; name: string | null; phone: string; email: string | null; joined_at: string; kyc_status: string; pending_docs: number; total_docs: number };
type Detail = {
  profile: { user_id: string; name: string | null; phone: string; email: string | null; joined_at: string; kyc_status: string; bio: string | null; rejection_reason: string | null };
  documents: Array<{ id: string; doc_type: string | null; storage_path: string; status: string | null; uploaded_at: string; verified_at: string | null; rejected_reason: string | null; viewUrl: string }>;
};

const TABS: Array<{ key: 'pending' | 'under_review' | 'approved' | 'rejected'; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function KycPage(): React.ReactElement | null {
  const toast = useToast();
  const [tab, setTab] = useState<'pending' | 'under_review' | 'approved' | 'rejected'>('pending');
  const [list, setList] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSelect(userId: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds((s) => s.size === list.length ? new Set() : new Set(list.map((c) => c.user_id)));
  }
  async function bulkApprove() {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: `Bulk Approve ${selectedIds.size} cleaner?`,
      message: 'Pastikan semua dokumen mereka udah dicek. Tindakan ini tidak bisa di-undo via UI (harus reject manual satu-satu).',
      confirmLabel: 'Ya, Approve Semua',
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const r = await api.admin.kycBulkApprove(Array.from(selectedIds));
      toast.success(`${r.approved} cleaner di-approve. ${r.errors.length > 0 ? `${r.errors.length} gagal.` : ''}`);
      setSelectedIds(new Set());
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Bulk approve gagal');
    } finally { setBulkBusy(false); }
  }
  const confirm = useConfirm();

  async function deleteCleaner(c: Cleaner) {
    const ok = await confirm({
      title: `Hapus ${c.name ?? c.phone}?`,
      message: 'Cleaner ini akan dihapus permanen dari database. Tindakan ini tidak bisa dibatalkan.',
      variant: 'danger',
      confirmLabel: 'Hapus Cleaner',
    });
    if (!ok) return;
    try {
      await api.admin.deleteCleaner(c.user_id, 'Dihapus oleh admin via KYC page');
      toast.success(`Cleaner ${c.name ?? c.phone} dihapus`);
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal hapus');
    }
  }

  async function load() {
    setLoading(true);
    try { setList((await api.admin.kycQueue(tab)) as Cleaner[]); } catch (e: any) { toast.error(e?.message); setList([]); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [tab]);

  async function openDetail(userId: string) {
    try { setSelected((await api.admin.kycDetail(userId)) as Detail); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">KYC Cleaner</h1>
          <p className="text-sm text-slate-500">Verifikasi dokumen cleaner sebelum aktif terima order.</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && tab !== 'approved' && (
            <Button variant="primary" loading={bulkBusy} onClick={bulkApprove}>
              âœ“ Approve {selectedIds.size} terpilih
            </Button>
          )}
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Tambah Cleaner</Button>
        </div>
      </div>

      <div className="mb-4 flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 text-sm font-medium ${tab === t.key ? 'text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}
          >
            {t.label}
            {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          <BadgeCheck size={32} className="mx-auto mb-2 text-slate-400" />
          Tidak ada cleaner di status <b>{tab}</b>.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 w-8">
                  {tab !== 'approved' && (
                    <input
                      type="checkbox"
                      checked={selectedIds.size === list.length && list.length > 0}
                      onChange={selectAll}
                    />
                  )}
                </th>
                <th className="px-4 py-3">Nama</th><th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Daftar</th><th className="px-4 py-3">Dokumen</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.user_id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {tab !== 'approved' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.user_id)}
                        onChange={() => toggleSelect(c.user_id)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(c.joined_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3"><Badge>{c.pending_docs} pending / {c.total_docs} total</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="secondary" icon={<Eye size={12} />} onClick={() => openDetail(c.user_id)}>Review</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => deleteCleaner(c)}>Hapus</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <KycDetailModal data={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); void load(); }} />}
      {addOpen && <AddCleanerModal onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); void load(); }} />}
    </div>
  );
}

function AddCleanerModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '', phone: '', email: '', password: '',
    bringsTools: false, autoApprove: false, tier: 'standard',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name || form.name.length < 2) e.name = 'Nama wajib (min 2 karakter)';
    if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(form.phone.replace(/\s/g, ''))) e.phone = 'Format: 08xxxx atau +62xxxx';
    if (form.email && !/^.+@.+\..+$/.test(form.email)) e.email = 'Format email tidak valid';
    if (!form.password || form.password.length < 8) e.password = 'Password min 8 karakter';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      await api.admin.createCleaner({
        name: form.name,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        bringsTools: form.bringsTools,
        autoApprove: form.autoApprove,
        tier: form.tier,
      });
      toast.success(`Cleaner ${form.name} dibuat`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal buat cleaner');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Tambah Cleaner Manual"
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Buat Cleaner</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-900">
          â“˜ Cleaner dibuat tanpa OTP (admin-trusted). Mereka langsung bisa login dengan nomor HP + password yang kamu set.
        </div>
        <Input label="Nama Lengkap" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} />
        <Input label="Nomor HP" required value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="08123456789" error={errors.phone} />
        <Input label="Email (opsional)" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="cleaner@example.com" error={errors.email} />
        <Input label="Password" type="password" required value={form.password} onChange={(v) => setForm({ ...form, password: v })} error={errors.password} helpText="Min 8 karakter. Berikan ke cleaner secara langsung." />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Bawa Alat Sendiri</label>
          <Switch checked={form.bringsTools} onChange={(v) => setForm({ ...form, bringsTools: v })} label={form.bringsTools ? 'Ya, bawa alat (komisi lebih tinggi)' : 'Tidak'} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Auto-approve KYC</label>
          <Switch checked={form.autoApprove} onChange={(v) => setForm({ ...form, autoApprove: v })} label={form.autoApprove ? 'Ya, langsung approved (skip review)' : 'Tidak, masuk antrian KYC pending'} />
        </div>
      </div>
    </Modal>
  );
}

function KycDetailModal({ data, onClose, onDone }: { data: Detail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rejecting, setRejecting] = useState(false);
  const [redoc, setRedoc] = useState(false);

  async function approve() {
    const ok = await confirm({ title: 'Approve KYC', message: 'Approve cleaner ini? Mereka bisa terima order setelah approve.', confirmLabel: 'Approve' });
    if (!ok) return;
    try { await api.admin.kycApprove(data.profile.user_id); toast.success('Cleaner di-approve.'); onDone(); }
    catch (e: any) { toast.error(e?.message); }
  }

  return (
    <>
      <Modal title={data.profile.name ?? 'Cleaner'} open={!rejecting && !redoc} onClose={onClose} size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRedoc(true)} icon={<RefreshCcw size={14} />}>Minta Upload Ulang</Button>
            <Button variant="danger" onClick={() => setRejecting(true)} icon={<X size={14} />}>Reject</Button>
            <Button variant="success" onClick={approve} icon={<Check size={14} />}>Approve</Button>
          </div>
        }
      >
        <div className="text-xs text-slate-500">
          {data.profile.phone} Â· {data.profile.email ?? 'no email'} Â· Status: <span className="font-semibold">{data.profile.kyc_status}</span>
        </div>

        {data.profile.rejection_reason && (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertCircle size={16} />
            <div><b>Catatan sebelumnya:</b> {data.profile.rejection_reason}</div>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {data.documents.length === 0 ? (
            <div className="col-span-full rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Belum ada dokumen di-upload.
            </div>
          ) : data.documents.map((d) => (
            <div key={d.id} className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs">
                <div className="font-medium">{labelDocType(d.doc_type)}</div>
                <div className="flex items-center gap-1 text-slate-500"><Clock size={12} />{new Date(d.uploaded_at).toLocaleDateString('id-ID')}</div>
              </div>
              {/(\.jpg|\.jpeg|\.png|\.webp)$/i.test(d.storage_path) ? (
                <img src={d.viewUrl} alt={d.doc_type ?? 'doc'} className="h-64 w-full bg-slate-100 object-contain" />
              ) : (
                <div className="bg-slate-100 p-6 text-center">
                  <a href={d.viewUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">Open file</a>
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2 text-xs">
                <Badge variant={d.status === 'approved' ? 'green' : d.status === 'rejected' ? 'red' : 'slate'}>{d.status ?? 'pending'}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {rejecting && <ReasonModal title="Reject KYC" placeholder="Alasan reject (akan dikirim ke cleaner)" submitLabel="Reject" variant="danger" onClose={() => setRejecting(false)} onSubmit={async (reason) => {
        try { await api.admin.kycReject(data.profile.user_id, reason); toast.success('KYC di-reject.'); onDone(); }
        catch (e: any) { toast.error(e?.message); }
      }} />}

      {redoc && <ReasonModal title="Minta Upload Ulang" placeholder="Alasan minta upload ulang dokumen" submitLabel="Kirim" variant="primary" onClose={() => setRedoc(false)} onSubmit={async (reason) => {
        try { await api.admin.kycRequestRedoc(data.profile.user_id, reason); toast.success('Permintaan dikirim.'); onDone(); }
        catch (e: any) { toast.error(e?.message); }
      }} />}
    </>
  );
}

function ReasonModal({ title, placeholder, submitLabel, variant, onClose, onSubmit }: {
  title: string; placeholder: string; submitLabel: string; variant: 'danger' | 'primary';
  onClose: () => void; onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e: Record<string, string> = {};
    if (reason.length < 5) e.reason = 'Min 5 karakter.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try { await onSubmit(reason); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={title}
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant={variant} onClick={submit} loading={busy}>{submitLabel}</Button>
        </div>
      }
    >
      <Textarea label="Alasan" required rows={4} value={reason} onChange={setReason} placeholder={placeholder} />
      {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason}</p>}
    </Modal>
  );
}

function labelDocType(t: string | null): string {
  switch (t) {
    case 'ktp': return 'KTP';
    case 'selfie_ktp': return 'Selfie + KTP';
    case 'bank_book': return 'Buku Tabungan';
    case 'sim': return 'SIM';
    case 'npwp': return 'NPWP';
    default: return t ?? 'Dokumen';
  }
}

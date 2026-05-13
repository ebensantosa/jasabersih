'use client';

import { useEffect, useState } from 'react';
import { Briefcase, Eye, Loader2, Plus, Search, ShieldOff, Trash2, User, UserX, Wallet } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Switch, Textarea, Button, Badge, useConfirm, useToast } from '../../../components/ui';

type Tab = 'customer' | 'cleaner';

type Row = {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string;
  photoUrl?: string | null;
  status?: string | null;
  joinedAt?: string;
  totalOrders?: number;
  strikes?: number;
  // Cleaner-only
  rating?: number | string;
  jobsDone?: number | string;
  bringsTools?: boolean;
  serviceAreas?: unknown;
};

export default function UsersPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('customer');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [viewing, setViewing] = useState<Row | null>(null);
  const [walletUser, setWalletUser] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();

  async function deleteRow(r: Row) {
    const label = tab === 'customer' ? 'Customer' : 'Cleaner';
    const ok = await confirm({
      title: `Hapus ${r.name ?? r.phone}?`,
      message: `${label} ini akan dihapus permanen dari database. Tindakan ini tidak bisa dibatalkan.`,
      variant: 'danger',
      confirmLabel: `Hapus ${label}`,
    });
    if (!ok) return;
    try {
      if (tab === 'customer') await api.admin.deleteCustomer(r.id, 'Dihapus oleh admin');
      else await api.admin.deleteCleaner(r.id, 'Dihapus oleh admin');
      toast.success(`${label} ${r.name ?? r.phone} dihapus`);
      void load();
    } catch (e: any) { toast.error(e?.message ?? 'Gagal hapus'); }
  }

  async function load() {
    setLoading(true);
    try {
      if (tab === 'customer') {
        const r = await api.admin.listUsers({ q: q || undefined, status: filterStatus === 'all' ? undefined : filterStatus, role: 'customer' }) as Row[];
        setRows(r);
      } else {
        const r = await api.admin.listCleaners({ status: filterStatus === 'all' ? undefined : filterStatus }) as Row[];
        setRows(r);
      }
    } catch (e: any) { toast.error(e?.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [tab, filterStatus]);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500">Lihat customer & cleaner, suspend, ban, audit trail.</p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
          Tambah {tab === 'customer' ? 'Customer' : 'Cleaner'}
        </Button>
      </div>

      <div className="mt-4 inline-flex rounded-xl bg-slate-100 p-1">
        <button onClick={() => setTab('customer')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'customer' ? 'bg-white text-slate-900 shadow' : 'text-slate-600'}`}>
          <User size={16} /> Customer
        </button>
        <button onClick={() => setTab('cleaner')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'cleaner' ? 'bg-white text-slate-900 shadow' : 'text-slate-600'}`}>
          <Briefcase size={16} /> Cleaner
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Cari nama / email / no HP…"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} /> Memuat…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">Belum ada {tab}.</div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2">Kontak</th>
                  {tab === 'customer' ? (
                    <>
                      <th className="px-4 py-2">Total Order</th>
                      <th className="px-4 py-2">Strikes</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-2">Rating</th>
                      <th className="px-4 py-2">Jobs</th>
                      <th className="px-4 py-2">Alat</th>
                    </>
                  )}
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Bergabung</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        {r.photoUrl ? (
                          <img src={r.photoUrl} alt={r.name ?? ''} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                            {(r.name ?? r.phone ?? '?')[0]?.toUpperCase()}
                          </div>
                        )}
                        <span>{r.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs"><div>{r.email ?? '—'}</div><div className="text-slate-500">{r.phone}</div></td>
                    {tab === 'customer' ? (
                      <>
                        <td className="px-4 py-2 font-bold">{Number(r.totalOrders ?? 0)}</td>
                        <td className="px-4 py-2">{Number(r.strikes ?? 0) > 0 ? <Badge variant="red">{r.strikes}x</Badge> : <span className="text-xs text-slate-400">0</span>}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">⭐ {r.rating != null ? Number(r.rating).toFixed(2) : '—'}</td>
                        <td className="px-4 py-2 font-bold">{Number(r.jobsDone ?? 0)}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={async () => {
                              try {
                                await api.admin.updateCleaner(r.id, { bringsTools: !r.bringsTools });
                                toast.success(r.bringsTools ? 'Set ke Tanpa Alat' : 'Set ke Bawa Alat');
                                void load();
                              } catch (e: any) { toast.error(e?.message ?? 'Gagal update'); }
                            }}
                            title="Klik untuk toggle"
                          >
                            {r.bringsTools ? <Badge variant="green">Bawa Alat</Badge> : <Badge>Tanpa Alat</Badge>}
                          </button>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2"><StatusBadge status={r.status ?? 'active'} /></td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.joinedAt ? new Date(r.joinedAt).toLocaleDateString('id-ID') : '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="secondary" icon={<Eye size={12} />} onClick={() => setViewing(r)}>Detail</Button>
                        <Button size="sm" variant="secondary" icon={<Wallet size={12} />} onClick={() => setWalletUser(r)}>Saldo</Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => deleteRow(r)}>Hapus</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && <UserDetailModal row={viewing} onClose={() => setViewing(null)} onChanged={() => { setViewing(null); void load(); }} />}
      {walletUser && <WalletModal user={walletUser} onClose={() => setWalletUser(null)} />}
      {adding && (
        <AddUserModal
          role={tab}
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); void load(); }}
        />
      )}
    </div>
  );
}

function AddUserModal({ role, onClose, onDone }: { role: 'customer' | 'cleaner'; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '', phone: '', email: '', password: '',
    bringsTools: false, autoApprove: false,
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
      if (role === 'customer') {
        await api.admin.createCustomer({
          name: form.name, phone: form.phone.trim(),
          email: form.email.trim() || undefined, password: form.password,
        });
      } else {
        await api.admin.createCleaner({
          name: form.name, phone: form.phone.trim(),
          email: form.email.trim() || undefined, password: form.password,
          bringsTools: form.bringsTools, autoApprove: form.autoApprove,
        });
      }
      toast.success(`${role === 'customer' ? 'Customer' : 'Cleaner'} ${form.name} dibuat`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal buat user');
    } finally { setBusy(false); }
  }

  const label = role === 'customer' ? 'Customer' : 'Cleaner';
  return (
    <Modal
      title={`Tambah ${label} Manual`}
      open={true}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button variant="primary" onClick={save} loading={busy}>Buat {label}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-900">
          ⓘ Akun dibuat tanpa OTP (admin-trusted). User langsung bisa login dengan nomor HP + password yang kamu set.
        </div>
        <Input label="Nama Lengkap" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} />
        <Input label="Nomor HP" required value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="08123456789" error={errors.phone} />
        <Input label="Email (opsional)" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="user@example.com" error={errors.email} />
        <Input label="Password" type="password" required value={form.password} onChange={(v) => setForm({ ...form, password: v })} error={errors.password} helpText="Min 8 karakter. Berikan ke user secara langsung." />
        {role === 'cleaner' && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Bawa Alat Sendiri</label>
              <Switch checked={form.bringsTools} onChange={(v) => setForm({ ...form, bringsTools: v })} label={form.bringsTools ? 'Ya, bawa alat (komisi lebih tinggi)' : 'Tidak'} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Auto-approve KYC</label>
              <Switch checked={form.autoApprove} onChange={(v) => setForm({ ...form, autoApprove: v })} label={form.autoApprove ? 'Ya, langsung approved (skip review)' : 'Tidak, masuk antrian KYC pending'} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'suspended') return <Badge variant="amber">suspended</Badge>;
  if (status === 'banned') return <Badge variant="red">banned</Badge>;
  return <Badge variant="green">aktif</Badge>;
}

function UserDetailModal({ row, onClose, onChanged }: { row: Row; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState(false);
  const [banning, setBanning] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [d, a] = await Promise.all([api.admin.getUser(row.id), api.admin.userAuditTrail(row.id)]);
      setDetail(d);
      setAudit(a);
    } catch (e: any) { toast.error(e?.message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  async function unsuspend() {
    const ok = await confirm({ title: 'Aktifkan Kembali', message: 'User akan bisa login + booking lagi.', confirmLabel: 'Aktifkan' });
    if (!ok) return;
    try { await api.admin.unsuspendUser(row.id); toast.success('User aktifkan kembali.'); onChanged(); } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <Modal title={`${row.name ?? '—'} (${row.phone})`} open={true} onClose={onClose} size="lg">
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Memuat…</div>
      ) : !detail ? null : (
        <div className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2">
            <InfoRow label="Status" value={<StatusBadge status={detail.user.status ?? 'active'} />} />
            <InfoRow label="Email" value={detail.user.email ?? '—'} />
            <InfoRow label="Phone Verified" value={detail.user.phoneVerifiedAt ? '✓' : '✗'} />
            <InfoRow label="Total Strikes" value={String(detail.strikes?.length ?? 0)} />
          </div>

          {detail.user.suspendReason && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <b>Alasan suspend:</b> {detail.user.suspendReason}
              {detail.user.suspendedUntil && <div className="mt-1">Sampai: {new Date(detail.user.suspendedUntil).toLocaleString('id-ID')}</div>}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Recent Bookings ({detail.recentBookings.length})</h3>
            {detail.recentBookings.length === 0 ? <p className="text-xs text-slate-500">—</p> : (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-xs">
                  <tbody>
                    {detail.recentBookings.slice(0, 10).map((b: any) => (
                      <tr key={b.id} className="border-t first:border-t-0">
                        <td className="px-3 py-1.5 font-mono">{b.id?.slice(0, 8)}…</td>
                        <td className="px-3 py-1.5"><Badge>{b.status}</Badge></td>
                        <td className="px-3 py-1.5 text-right font-bold">Rp {Number(b.total ?? 0).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{b.createdAt ? new Date(b.createdAt).toLocaleDateString('id-ID') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {detail.strikes && detail.strikes.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Fraud Strikes</h3>
              <div className="space-y-1">
                {detail.strikes.slice(0, 10).map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs">
                    <Badge variant="red">{s.strikeType}</Badge>
                    <span className="text-slate-700">{new Date(s.createdAt).toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {audit.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Audit Trail ({audit.length})</summary>
              <div className="mt-2 max-h-60 overflow-auto space-y-1">
                {audit.map((a: any) => (
                  <div key={a.id ?? a.performedAt} className="rounded border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge variant="blue">{a.action}</Badge>
                      <span className="text-slate-500">{new Date(a.performedAt).toLocaleString('id-ID')}</span>
                    </div>
                    <div className="mt-1 text-slate-600">{a.adminName ?? a.adminEmail}</div>
                    {a.changes && <code className="mt-1 block text-[10px]">{JSON.stringify(a.changes)}</code>}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            {detail.user.status === 'active' || !detail.user.status ? (
              <>
                <Button variant="secondary" icon={<UserX size={14} />} onClick={() => setSuspending(true)}>Suspend</Button>
                <Button variant="danger" icon={<ShieldOff size={14} />} onClick={() => setBanning(true)}>Ban</Button>
              </>
            ) : (
              <Button variant="success" onClick={unsuspend}>Aktifkan Kembali</Button>
            )}
          </div>
        </div>
      )}

      {suspending && <ReasonModal title="Suspend User" placeholder="Alasan suspend (akan ditampilkan ke user)" durationField onClose={() => setSuspending(false)} onSubmit={async (reason, days) => {
        try { await api.admin.suspendUser(row.id, reason, days); toast.success('User di-suspend.'); onChanged(); } catch (e: any) { toast.error(e?.message); }
      }} />}
      {banning && <ReasonModal title="Ban User (Permanen)" placeholder="Alasan ban — auto-cancel pending bookings" variant="danger" onClose={() => setBanning(false)} onSubmit={async (reason) => {
        try { await api.admin.banUser(row.id, reason); toast.success('User di-ban.'); onChanged(); } catch (e: any) { toast.error(e?.message); }
      }} />}
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-slate-50 p-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function ReasonModal({ title, placeholder, durationField, variant = 'primary', onClose, onSubmit }: {
  title: string; placeholder: string; durationField?: boolean;
  variant?: 'primary' | 'danger';
  onClose: () => void; onSubmit: (reason: string, days?: number) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  async function go() {
    if (reason.length < 5) return;
    setBusy(true);
    try { await onSubmit(reason, days); onClose(); } finally { setBusy(false); }
  }
  return (
    <Modal title={title} open={true} onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button variant={variant} onClick={go} loading={busy}>{title}</Button>
      </div>
    }>
      <div className="space-y-3">
        <Textarea label="Alasan" required rows={3} value={reason} onChange={setReason} placeholder={placeholder} helpText="Min 5 karakter." />
        {durationField && <Input label="Durasi (hari)" type="number" value={String(days)} onChange={(v) => setDays(Number(v))} helpText="Default 7 hari." />}
      </div>
    </Modal>
  );
}

function WalletModal({ user, onClose }: { user: Row; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.admin.getUserWallet>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try { setData(await api.admin.getUserWallet(user.id)); } catch (e: any) { toast.error(e?.message ?? 'Gagal load'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [user.id]);

  async function submit() {
    const amt = parseInt(amount.replace(/[^\d]/g, ''), 10);
    if (!amt || amt <= 0) { toast.error('Nominal harus > 0'); return; }
    if (reason.length < 5) { toast.error('Alasan min 5 karakter'); return; }
    setBusy(true);
    try {
      await api.admin.adjustUserWallet(user.id, type, amt, reason);
      toast.success(`${type === 'credit' ? 'Tambah' : 'Kurangi'} saldo Rp ${amt.toLocaleString('id-ID')} berhasil`);
      setAmount(''); setReason('');
      await load();
    } catch (e: any) { toast.error(e?.message ?? 'Gagal'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Saldo · ${user.name ?? user.phone}`} open={true} onClose={onClose} size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-500"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-emerald-600 p-5 text-white">
            <div className="text-xs uppercase tracking-wider text-white/80">Saldo</div>
            <div className="mt-1 text-3xl font-bold">Rp {Number(data?.balance ?? 0).toLocaleString('id-ID')}</div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 text-sm font-bold text-slate-900">Adjust Saldo Manual</div>
            <div className="flex gap-2">
              <button onClick={() => setType('credit')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${type === 'credit' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200'}`}>+ Tambah Saldo</button>
              <button onClick={() => setType('debit')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${type === 'debit' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200'}`}>− Kurangi Saldo</button>
            </div>
            <div className="mt-3 space-y-2">
              <Input label="Nominal (Rp)" type="text" value={amount} onChange={setAmount} placeholder="mis. 50000" />
              <Textarea label="Alasan" required rows={2} value={reason} onChange={setReason} placeholder="Min 5 karakter" />
              <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Memproses...' : 'Submit'}</Button>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-bold text-slate-900">Riwayat ({data?.ledger?.length ?? 0})</div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              {(data?.ledger ?? []).length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">Belum ada transaksi</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left text-[10px] uppercase text-slate-500">
                    <tr><th className="px-3 py-2">Tipe</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">Keterangan</th></tr>
                  </thead>
                  <tbody>
                    {(data?.ledger ?? []).map((e: any) => {
                      const isOut = ['credit_use', 'withdrawal', 'admin_debit'].includes(e.accountType);
                      return (
                        <tr key={e.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-[10px]">{e.accountType}</td>
                          <td className={`px-3 py-2 font-bold ${isOut ? 'text-red-600' : 'text-emerald-600'}`}>{isOut ? '−' : '+'} Rp {Number(e.amount).toLocaleString('id-ID')}</td>
                          <td className="px-3 py-2">{e.status}</td>
                          <td className="px-3 py-2 text-slate-500">{new Date(e.createdAt).toLocaleString('id-ID')}</td>
                          <td className="px-3 py-2 text-slate-600">{e.description ?? '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

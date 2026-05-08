'use client';

import { useEffect, useState } from 'react';
import { Briefcase, Eye, Loader2, Search, ShieldOff, User, UserX } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Textarea, Button, Badge, useConfirm, useToast } from '../../../components/ui';

type Tab = 'customer' | 'cleaner';

type Row = {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string;
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
      <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
      <p className="text-sm text-slate-500">Lihat customer & cleaner, suspend, ban, audit trail.</p>

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
                    <td className="px-4 py-2 font-medium">{r.name ?? '—'}</td>
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
                      </>
                    )}
                    <td className="px-4 py-2"><StatusBadge status={r.status ?? 'active'} /></td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.joinedAt ? new Date(r.joinedAt).toLocaleDateString('id-ID') : '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="secondary" icon={<Eye size={12} />} onClick={() => setViewing(r)}>Detail</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && <UserDetailModal row={viewing} onClose={() => setViewing(null)} onChanged={() => { setViewing(null); void load(); }} />}
    </div>
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

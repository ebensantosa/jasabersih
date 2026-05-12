'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, Loader2, MoreHorizontal, Search, Trash2, UserPlus, Wallet, WifiOff, XCircle } from 'lucide-react';
import { Modal } from '../../../components/ui';

import { ApiOffline, api } from '../../../lib/api';
import { useConfirm, usePrompt, useToast } from '../../../components/ui';
import {
  STATUS_BADGE,
  type Order,
  type OrderStatus,
  formatRupiah,
} from '../../../lib/mock';

const FILTERS: { key: OrderStatus | 'all' | 'needs_manual'; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'needs_manual', label: '⚠️ Butuh Assign Manual' },
  { key: 'pending_payment', label: '💳 Belum Bayar' },
  { key: 'searching', label: 'Cari Cleaner' },
  { key: 'matched', label: 'Sudah Match' },
  { key: 'in_progress', label: 'Dikerjakan' },
  { key: 'completed', label: 'Selesai' },
  { key: 'disputed', label: 'Sengketa' },
  { key: 'canceled', label: 'Batal' },
];

export default function Bookings() {
  const [filter, setFilter] = useState<OrderStatus | 'all' | 'needs_manual'>('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const prompt = usePrompt();
  const confirm = useConfirm();
  const toast = useToast();
  const [needsAttention, setNeedsAttention] = useState<Awaited<ReturnType<typeof api.admin.bookingsNeedsAttention>>>([]);

  useEffect(() => {
    api.admin.bookingsNeedsAttention().then(setNeedsAttention).catch(() => setNeedsAttention([]));
  }, [orders]);

  function toggleSel(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function rowAction(id: string, action: 'cancel' | 'complete' | 'mark_paid' | 'delete') {
    const labels = { cancel: 'batalkan', complete: 'tandai selesai', mark_paid: 'tandai lunas', delete: 'hapus' };
    const reason = await prompt({
      title: `Konfirmasi ${labels[action]}`,
      message: `Alasan untuk ${labels[action]} pesanan ini:`,
      placeholder: 'Min 5 karakter',
      multiline: true,
      minLength: 5,
      variant: action === 'delete' || action === 'cancel' ? 'danger' : 'primary',
      confirmLabel: 'Lanjut',
    });
    if (!reason) return;
    setBusy(true);
    try {
      if (action === 'cancel') await api.admin.forceCancelBooking(id, reason);
      else if (action === 'complete') await api.admin.forceCompleteBooking(id, reason);
      else if (action === 'mark_paid') await api.admin.forceMarkPaid(id, reason);
      else if (action === 'delete') await api.admin.bulkBookingAction([id], 'delete', reason);
      setOpenMenu(null);
      toast.success('Berhasil');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkAction(action: 'cancel' | 'complete' | 'mark_paid' | 'delete') {
    if (selected.size === 0) return;
    const labels = { cancel: 'membatalkan', complete: 'menyelesaikan', mark_paid: 'menandai lunas', delete: 'menghapus' };
    const reason = await prompt({
      title: `${labels[action]} ${selected.size} booking`,
      message: `Alasan untuk ${labels[action]} ${selected.size} booking sekaligus:`,
      placeholder: 'Min 5 karakter',
      multiline: true,
      minLength: 5,
      variant: action === 'delete' || action === 'cancel' ? 'danger' : 'primary',
      confirmLabel: 'Lanjut',
    });
    if (!reason) return;
    const ok = await confirm({
      title: 'Konfirmasi bulk action',
      message: `Yakin ${labels[action]} ${selected.size} booking? Tindakan ini tidak bisa dibatalkan.`,
      variant: action === 'delete' ? 'danger' : 'primary',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.admin.bulkBookingAction(Array.from(selected), action, reason);
      toast.success(`Selesai: ${res.succeeded}/${res.total} sukses.`);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = (await api.admin.listBookings({
        status: filter === 'all' || filter === 'needs_manual' ? undefined : filter,
        from: from || undefined,
        to: to || undefined,
      })) as Order[];
      setOrders(data);
    } catch (e) {
      setError(e instanceof ApiOffline ? 'offline' : (e as Error).message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  const needsManualIds = new Set(needsAttention.map((b) => b.id));
  const filtered = (orders ?? []).filter((o) => {
    if (filter === 'needs_manual') {
      if (!needsManualIds.has(o.id)) return false;
    } else if (filter !== 'all' && o.status !== filter) return false;
    if (
      q &&
      !`${o.id} ${o.customerName} ${o.service} ${o.city}`.toLowerCase().includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Pesanan <span className="ml-2 align-middle text-[10px] font-mono text-slate-400">v2</span></h1>
      <p className="text-sm text-slate-500">Manage order, assign cleaner manual, resolve sengketa</p>

      {error === 'offline' && <OfflineCard onRetry={load} />}
      {error && error !== 'offline' && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
          <Search size={16} className="text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari ID, nama, layanan, kota…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500">Tanggal:</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <span className="text-xs text-slate-400">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <button onClick={() => void load()} className="rounded-md bg-blue-700 px-3 py-1 text-xs font-medium text-white">Apply</button>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo(''); setTimeout(() => load(), 100); }} className="rounded-md border border-slate-300 px-3 py-1 text-xs">Reset</button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setTimeout(() => load(), 50); }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === f.key
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {needsAttention.length > 0 && (
        <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div className="text-sm font-bold text-amber-900">
              {needsAttention.length} booking belum diambil cleaner — kemungkinan di luar coverage area, butuh assign manual
            </div>
          </div>
          <div className="mt-2 space-y-1.5">
            {needsAttention.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{b.customerName ?? '—'} · {b.serviceName ?? '—'}</div>
                  <div className="truncate text-slate-500">{b.addressLine}</div>
                  <div className="text-amber-700">Searching {Math.floor(b.searchingSec / 60)} menit</div>
                </div>
                <button
                  onClick={() => setAssigning(b.id)}
                  className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  Assign Manual
                </button>
              </div>
            ))}
            {needsAttention.length > 5 && (
              <div className="pt-1 text-center text-[11px] text-amber-800">+{needsAttention.length - 5} lainnya</div>
            )}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-semibold text-blue-900">{selected.size} dipilih</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => bulkAction('mark_paid')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <Wallet size={12} /> Tandai Lunas
            </button>
            <button disabled={busy} onClick={() => bulkAction('complete')} className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <CheckCircle2 size={12} /> Selesaikan
            </button>
            <button disabled={busy} onClick={() => bulkAction('cancel')} className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <XCircle size={12} /> Batalkan
            </button>
            <button disabled={busy} onClick={() => bulkAction('delete')} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <Trash2 size={12} /> Hapus
            </button>
            <button onClick={() => setSelected(new Set())} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Batal pilih</button>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} /> Memuat data…
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((o) => selected.has(o.id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(filtered.map((o) => o.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Layanan</th>
                <th className="px-4 py-3">Jadwal</th>
                <th className="px-4 py-3">Cleaner</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((o) => {
                const s = STATUS_BADGE[o.status];
                const canAssign = o.status === 'searching' || !o.cleanerName;
                return (
                  <tr key={o.id} className={`hover:bg-slate-50 ${needsManualIds.has(o.id) ? 'border-l-4 border-amber-400 bg-amber-50/30' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleSel(o.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{o.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.customerName ?? '—'}</div>
                      <div className="text-[11px] text-slate-500">{o.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{o.service ?? o.pricingMode}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{o.scheduledAt}</td>
                    <td className="px-4 py-3">
                      {o.cleanerName ?? <span className="text-amber-700">—</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatRupiah(o.total ?? 0)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{ backgroundColor: s?.bg, color: s?.fg }}
                      >
                        {s?.label ?? o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDetail(o.id)}
                          className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100"
                          title="Lihat detail"
                        >
                          <Eye size={14} />
                        </button>
                        {canAssign && (
                          <button
                            onClick={() => setAssigning(o.id)}
                            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white"
                          >
                            <UserPlus size={12} /> Assign
                          </button>
                        )}
                        <div>
                          <button
                            onClick={(e) => {
                              if (openMenu?.id === o.id) { setOpenMenu(null); return; }
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setOpenMenu({ id: o.id, top: r.bottom + 4, left: r.right - 176 });
                            }}
                            className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {openMenu?.id === o.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                              <div
                                className="fixed z-50 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                                style={{ top: openMenu.top, left: openMenu.left }}
                              >
                                {o.status === 'pending_payment' && (
                                  <button onClick={() => rowAction(o.id, 'mark_paid')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50">
                                    <Wallet size={12} className="text-emerald-600" /> Tandai Lunas
                                  </button>
                                )}
                                {o.status !== 'completed' && o.status !== 'canceled' && (
                                  <button onClick={() => rowAction(o.id, 'complete')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50">
                                    <CheckCircle2 size={12} className="text-blue-700" /> Tandai Selesai
                                  </button>
                                )}
                                {o.status !== 'canceled' && o.status !== 'completed' && (
                                  <button onClick={() => rowAction(o.id, 'cancel')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50">
                                    <XCircle size={12} className="text-amber-600" /> Batalkan
                                  </button>
                                )}
                                <button onClick={() => rowAction(o.id, 'delete')} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50">
                                  <Trash2 size={12} /> Hapus Permanen
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-500">
            {orders && orders.length === 0
              ? 'Belum ada order di database. Buat booking dari mobile app dulu.'
              : 'Tidak ada order yang cocok dengan filter.'}
          </div>
        )}
      </div>

      {assigning && (
        <AssignModal
          bookingId={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => {
            setAssigning(null);
            void load();
          }}
        />
      )}

      {detail && <BookingDetailModal bookingId={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function BookingDetailModal({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.admin.getBookingDetail>> | null>(null);
  useEffect(() => { api.admin.getBookingDetail(bookingId).then(setData).catch(() => {}); }, [bookingId]);

  const before = data?.photos?.filter((p) => p.photoType === 'before') ?? [];
  const after = data?.photos?.filter((p) => p.photoType === 'after') ?? [];
  const damage = data?.photos?.filter((p) => p.photoType === 'damage') ?? [];

  return (
    <Modal title="Detail Pesanan" open={true} onClose={onClose} size="lg">
      {!data ? (
        <div className="py-12 text-center text-sm text-slate-500">Memuat…</div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">ID</div>
            <div className="font-mono text-xs">{(data.booking as any)?.id}</div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
              <div><b>Customer:</b><br/>{(data.booking as any)?.customer_name} · {(data.booking as any)?.customer_phone}</div>
              <div><b>Cleaner:</b><br/>{(data.booking as any)?.cleaner_name ?? '—'}</div>
              <div><b>Status:</b> {(data.booking as any)?.status}</div>
              <div><b>Total:</b> Rp {Number((data.booking as any)?.total_amount ?? 0).toLocaleString('id-ID')}</div>
              <div><b>Jadwal:</b> {new Date((data.booking as any)?.scheduled_at).toLocaleString('id-ID')}</div>
              <div><b>Bayar:</b> {(data.booking as any)?.paid_at ? new Date((data.booking as any).paid_at).toLocaleString('id-ID') : '—'}</div>
            </div>
            <div className="mt-2 text-xs"><b>Alamat:</b> {(data.booking as any)?.address_line}</div>
          </div>

          {before.length + after.length + damage.length > 0 && (
            <div>
              <div className="text-sm font-bold text-slate-900 mb-2">Foto Pengerjaan</div>
              <PhotoSection title="Sebelum" photos={before} />
              <PhotoSection title="Sesudah" photos={after} />
              {damage.length > 0 && <PhotoSection title="⚠️ Kerusakan" photos={damage} />}
            </div>
          )}

          {data.payments?.length > 0 && (
            <div>
              <div className="text-sm font-bold text-slate-900 mb-2">Riwayat Pembayaran</div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-[10px] uppercase text-slate-500"><tr><th className="px-2 py-1">Status</th><th className="px-2 py-1">Amount</th><th className="px-2 py-1">Paid At</th></tr></thead>
                <tbody>
                  {data.payments.map((p: any) => (
                    <tr key={p.id} className="border-t"><td className="px-2 py-1">{p.status}</td><td className="px-2 py-1">Rp {Number(p.amount).toLocaleString('id-ID')}</td><td className="px-2 py-1">{p.paidAt ? new Date(p.paidAt).toLocaleString('id-ID') : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function PhotoSection({ title, photos }: { title: string; photos: { url: string; uploadedAt: string }[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold text-slate-700 mb-1">{title} ({photos.length})</div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <a key={i} href={p.url} target="_blank" rel="noreferrer" className="block">
            <img src={p.url} alt={title} className="aspect-square w-full rounded-lg border border-slate-200 object-cover hover:opacity-80" />
            <div className="mt-1 text-[10px] text-slate-500">{new Date(p.uploadedAt).toLocaleString('id-ID')}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function OfflineCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <WifiOff className="text-amber-700" size={20} />
      <div className="flex-1">
        <div className="text-sm font-bold text-amber-900">Backend tidak terkoneksi</div>
        <div className="text-xs text-amber-900">
          Pastikan API jalan: <code>npm run dev -w @jasabersih/api</code>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
      >
        Coba Lagi
      </button>
    </div>
  );
}

function AssignModal({
  bookingId,
  onClose,
  onAssigned,
}: {
  bookingId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [cleaners, setCleaners] = useState<{ id: string; name: string; rating?: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const data = (await api.admin.listCleaners({ status: 'active' })) as {
          id: string;
          name: string;
          rating?: number;
        }[];
        setCleaners(data);
      } catch {
        setCleaners([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toast = useToast();
  async function pick(cleanerId: string) {
    try {
      await api.admin.assignCleaner(bookingId, cleanerId);
      onAssigned();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h3 className="text-lg font-bold">Assign Cleaner Manual</h3>
        <p className="mt-1 text-xs text-slate-500">Order: {bookingId}</p>
        <div className="mt-4 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Loading cleaner…
            </div>
          )}
          {!loading && cleaners.length === 0 && (
            <p className="text-sm text-slate-500">Tidak ada cleaner aktif tersedia.</p>
          )}
          {cleaners.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className="w-full rounded-lg border border-slate-200 p-3 text-left hover:border-primary"
            >
              <div className="font-semibold">{c.name}</div>
              {c.rating != null && (
                <div className="text-[11px] text-slate-500">⭐ {Number(c.rating).toFixed(1)}</div>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-slate-100 py-2 text-sm font-semibold text-slate-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

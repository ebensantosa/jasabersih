'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, Loader2, MoreHorizontal, Radio, Search, Trash2, UserPlus, Wallet, WifiOff, XCircle } from 'lucide-react';
import { Button, Input, Modal, Textarea } from '../../../components/ui';
import { MapPicker } from '../../../components/MapPicker';

import { ApiOffline, api } from '../../../lib/api';
import { formatDateTimeWithTz } from '../../../lib/datetime';
import { useConfirm, usePrompt, useToast } from '../../../components/ui';
import {
  STATUS_BADGE,
  type Order,
  type OrderStatus,
  formatRupiah,
} from '../../../lib/mock';

const FILTERS: { key: OrderStatus | 'all' | 'needs_manual' | 'manual_admin'; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'needs_manual', label: '⚠ Butuh Assign Manual' },
  { key: 'manual_admin', label: '🛠 Pesanan Admin' },
  { key: 'pending_payment', label: '💳 Belum Bayar' },
  { key: 'searching', label: 'Cari Cleaner' },
  { key: 'matched', label: 'Sudah Match' },
  { key: 'in_progress', label: 'Dikerjakan' },
  { key: 'completed', label: 'Selesai' },
  { key: 'disputed', label: 'Sengketa' },
  { key: 'canceled', label: 'Batal' },
];

export default function Bookings(): React.ReactElement | null  {
  const [filter, setFilter] = useState<OrderStatus | 'all' | 'needs_manual' | 'manual_admin'>('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [totalOrders, setTotalOrders] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 25;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
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

  async function refundToCredit(id: string, totalAmount: number) {
    const amountStr = await prompt({
      title: 'Refund ke Saldo Customer',
      message: `Nominal refund (max ${totalAmount.toLocaleString('id-ID')}):`,
      placeholder: 'mis. 50000',
      variant: 'primary',
      confirmLabel: 'Lanjut',
    });
    if (!amountStr) return;
    const amount = parseInt(String(amountStr).replace(/[^\d]/g, ''), 10);
    if (!amount || amount <= 0 || amount > totalAmount) {
      toast.error('Nominal tidak valid');
      return;
    }
    const reason = await prompt({
      title: `Refund Rp ${amount.toLocaleString('id-ID')}`,
      message: 'Alasan refund (akan tercatat di audit & ledger):',
      placeholder: 'Min 5 karakter',
      multiline: true,
      minLength: 5,
      variant: 'primary',
      confirmLabel: 'Refund',
    });
    if (!reason) return;
    setBusy(true);
    try {
      await api.admin.refundCreditToCustomer(id, amount, reason);
      setOpenMenu(null);
      toast.success(`Refund Rp ${amount.toLocaleString('id-ID')} masuk ke saldo customer`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter, from, to]);

  async function exportCsv() {
    try {
      const r = await api.admin.exportBookingsCsv({
        status: filter === 'all' || filter === 'needs_manual' || filter === 'manual_admin' ? undefined : filter,
        from: from || undefined,
        to: to || undefined,
      });
      if (r.items.length === 0) { toast.info('Tidak ada data untuk di-export'); return; }
      const headers = ['ID', 'Status', 'Pricing Mode', 'Total (Rp)', 'Scheduled At', 'Paid At', 'Completed At', 'Alamat', 'Customer Nama', 'Customer Phone', 'Customer Email', 'Cleaner Nama', 'Cleaner Phone', 'Service', 'Package', 'Created At'];
      const rows = r.items.map((b: any) => [
        b.id, b.status, b.pricingMode, Number(b.total ?? 0),
        b.scheduledAt ? new Date(b.scheduledAt).toISOString() : '',
        b.paidAt ? new Date(b.paidAt).toISOString() : '',
        b.completedAt ? new Date(b.completedAt).toISOString() : '',
        b.address ?? '', b.customerName ?? '', b.customerPhone ?? '', b.customerEmail ?? '',
        b.cleanerName ?? '', b.cleanerPhone ?? '', b.service ?? '', b.package ?? '',
        b.createdAt ? new Date(b.createdAt).toISOString() : '',
      ]);
      const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export ${r.count} booking ke CSV${r.limited ? ' (limit 10rb, persempit filter kalau ada lebih)' : ''}`);
    } catch (e: any) { toast.error(e?.message ?? 'Export gagal'); }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = (await api.admin.listBookings({
        status: filter === 'all' || filter === 'needs_manual' || filter === 'manual_admin' ? undefined : filter,
        from: from || undefined,
        to: to || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })) as any;
      // Handle both paginated { items, total } and legacy array
      const items = Array.isArray(res) ? res : (res.items ?? []);
      setOrders(items as Order[]);
      setTotalOrders(Array.isArray(res) ? items.length : Number(res.total ?? items.length));
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
    } else if (filter === 'manual_admin') {
      if (!(o as any).isManual) return false;
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pesanan <span className="ml-2 align-middle text-[10px] font-mono text-slate-400">v2</span></h1>
          <p className="text-sm text-slate-500">Manage order, assign cleaner manual, resolve sengketa</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ⬇ Export CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
          >
            + Buat Pesanan Manual
          </button>
        </div>
      </div>

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
              onClick={() => { setFilter(f.key); setPage(1); }}
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
            <span className="text-lg">⚠</span>
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
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={async () => {
                      try {
                        await api.admin.broadcastJob(b.id);
                        toast.success('Broadcast ulang terkirim ke cleaner online');
                      } catch {
                        toast.error('Gagal broadcast');
                      }
                    }}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                    title="Kirim ulang notifikasi ke semua cleaner online"
                  >
                    Re-broadcast
                  </button>
                  <button
                    onClick={() => setAssigning(b.id)}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                  >
                    Assign Manual
                  </button>
                </div>
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
                const isTerminal = o.status === 'completed' || o.status === 'canceled';
                const canAssign = !isTerminal && (!o.cleanerName || ['searching', 'matched', 'on_the_way', 'in_progress', 'disputed'].includes(o.status));
                const isReassign = canAssign && !!o.cleanerName;
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
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDateTimeWithTz(o.scheduledAt, (o as any).address)}</td>
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
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white ${isReassign ? 'bg-blue-700' : 'bg-primary'}`}
                            title={isReassign ? 'Ganti cleaner' : 'Assign cleaner'}
                          >
                            <UserPlus size={12} /> {isReassign ? 'Ganti' : 'Assign'}
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
                                {o.status === 'searching' && !o.cleanerName && (
                                  <button
                                    onClick={async () => {
                                      setOpenMenu(null);
                                      try {
                                        await api.admin.broadcastJob(o.id);
                                        toast.success('Broadcast ulang terkirim ke cleaner online');
                                      } catch {
                                        toast.error('Gagal broadcast');
                                      }
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                                  >
                                    <Radio size={12} className="text-blue-600" /> Broadcast Ulang
                                  </button>
                                )}
                                {o.cleanerName && ['searching', 'matched', 'on_the_way', 'in_progress', 'disputed'].includes(o.status) && (
                                  <button
                                    onClick={() => { setOpenMenu(null); setAssigning(o.id); }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                                  >
                                    <UserPlus size={12} className="text-blue-700" /> Ganti Cleaner
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
                                <button onClick={() => refundToCredit(o.id, Number(o.total ?? 0))} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50">
                                  <Wallet size={12} className="text-emerald-600" /> Refund ke Saldo
                                </button>
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

        {/* Pagination */}
        {totalOrders > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs">
            <span className="text-slate-600">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalOrders)} dari {totalOrders.toLocaleString('id-ID')} order
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="rounded border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                 Prev
              </button>
              <span className="px-3 font-bold text-slate-700">
                {page} / {Math.max(1, Math.ceil(totalOrders / PAGE_SIZE))}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(Math.ceil(totalOrders / PAGE_SIZE), p + 1))}
                disabled={page >= Math.ceil(totalOrders / PAGE_SIZE) || loading}
                className="rounded border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {assigning && (
        <AssignModal
          bookingId={assigning}
          currentCleanerName={(orders ?? []).find((o) => o.id === assigning)?.cleanerName ?? null}
          onClose={() => setAssigning(null)}
          onAssigned={() => {
            setAssigning(null);
            void load();
          }}
        />
      )}

      {detail && <BookingDetailModal bookingId={detail} onClose={() => setDetail(null)} />}
      {showCreate && (
        <CreateBookingModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void load(); toast.success('Pesanan dibuat'); }}
        />
      )}
    </div>
  );
}

function AdminChatPanel({ bookingId }: { bookingId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    try {
      const msgs = await api.admin.chatMessages(bookingId);
      setMessages(msgs);
    } catch {}
  }

  useEffect(() => {
    loadMessages();
    const t = setInterval(loadMessages, 5000);
    return () => clearInterval(t);
  }, [bookingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.admin.chatSend(bookingId, text.trim());
      setText('');
      await loadMessages();
    } catch {
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
        💬 Chat Booking
      </div>
      <div className="flex h-64 flex-col gap-1 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">Belum ada pesan</div>
        ) : (
          messages.map((m: any) => {
            const isAdmin = m.isAdmin || m.senderPhone === '+62000000000001';
            return (
              <div key={m.id} className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                {!isAdmin && (
                  <div className="mb-0.5 text-[10px] text-slate-500">{m.senderName ?? 'User'}</div>
                )}
                <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs ${isAdmin ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 border border-slate-200'}`}>
                  {m.messageType === 'image' ? (
                    <a href={m.attachmentUrl ?? m.content} target="_blank" rel="noreferrer" className="underline">📷 Foto</a>
                  ) : m.content}
                </div>
                <div className="mt-0.5 text-[9px] text-slate-400">
                  {isAdmin ? 'Admin JasaBersih · ' : ''}{new Date(m.createdAt).toLocaleString('id-ID')}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-slate-200 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="Tulis pesan sebagai Admin JasaBersih…"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {sending ? '…' : 'Kirim'}
        </button>
      </div>
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
              <div><b>Jadwal:</b> {formatDateTimeWithTz((data.booking as any)?.scheduled_at, (data.booking as any)?.address_line)}</div>
              <div><b>Bayar:</b> {(data.booking as any)?.paid_at ? new Date((data.booking as any).paid_at).toLocaleString('id-ID') : '—'}</div>
            </div>
            <div className="mt-2 text-xs">
              {(() => {
                const snap = (data.booking as any)?.form_snapshot;
                const city = snap?.cityName ?? (data.booking as any)?.city ?? null;
                return city ? <div className="mb-1"><b>Kota:</b> <span className="text-slate-700">{city}</span></div> : null;
              })()}
              <b>Alamat:</b> {(data.booking as any)?.address_line}
              {(() => {
                const lat = (data.booking as any)?.lat;
                const lng = (data.booking as any)?.lng;
                const addr = (data.booking as any)?.address_line;
                const mapsUrl = lat && lng
                  ? `https://www.google.com/maps?q=${lat},${lng}`
                  : addr
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
                    : null;
                return mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                  >
                     Buka di Maps
                  </a>
                ) : null;
              })()}
            </div>
          </div>

          {(() => {
            const total = Number((data.booking as any)?.total_amount ?? 0);
            const payout = Number((data.booking as any)?.cleaner_payout ?? 0);
            if (total <= 0) return null;
            const platform = Math.max(total - payout, 0);
            const pct = total > 0 ? (payout / total) * 100 : 0;
            return (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="mb-1.5 text-sm font-bold text-emerald-900">Pembagian Pendapatan</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Cleaner terima</div>
                    <div className="text-base font-bold text-emerald-700">Rp {payout.toLocaleString('id-ID')}</div>
                    <div className="text-[10px] text-slate-500">{pct.toFixed(1)}% dari total</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Platform fee</div>
                    <div className="text-base font-bold text-slate-700">Rp {platform.toLocaleString('id-ID')}</div>
                    <div className="text-[10px] text-slate-500">{(100 - pct).toFixed(1)}% dari total</div>
                  </div>
                </div>
                {payout === 0 && (
                  <div className="mt-1.5 text-[10px] text-amber-700">⚠ Cleaner payout belum di-set (kemungkinan booking belum match cleaner).</div>
                )}
              </div>
            );
          })()}

          {/* Additional Charges & Tips */}
          {((data.charges?.length ?? 0) > 0 || (data as any).tipAmount > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="text-sm font-bold text-amber-900">Biaya Tambahan & Tip</div>
              {data.charges?.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="text-left text-[10px] uppercase text-slate-500">
                    <tr><th className="pb-1 pr-2">Alasan</th><th className="pb-1 pr-2">Nominal</th><th className="pb-1">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {data.charges.map((c: any) => (
                      <tr key={c.id}>
                        <td className="py-1 pr-2">{c.reason}</td>
                        <td className="py-1 pr-2">Rp {Number(c.amount).toLocaleString('id-ID')}</td>
                        <td className="py-1">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(data as any).tipAmount > 0 && (
                <div className="flex items-center gap-2 text-xs border-t border-amber-200 pt-2">
                  <span className="text-amber-800 font-semibold">Tip dari customer:</span>
                  <span className="font-bold text-emerald-700">Rp {Number((data as any).tipAmount).toLocaleString('id-ID')}</span>
                </div>
              )}
              {data.charges?.filter((c: any) => c.status === 'approved').length > 0 && (
                <div className="flex items-center gap-2 text-xs border-t border-amber-200 pt-2 font-semibold text-amber-900">
                  <span>Total biaya tambahan (approved):</span>
                  <span>Rp {data.charges.filter((c: any) => c.status === 'approved').reduce((s: number, c: any) => s + Number(c.amount), 0).toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>
          )}

          {(() => {
            const conditionUrls: string[] = Array.isArray((data.booking as any)?.form_snapshot?.conditionPhotos)
              ? (data.booking as any).form_snapshot.conditionPhotos
              : [];
            return conditionUrls.length > 0 && (
              <div>
                <div className="text-sm font-bold text-slate-900 mb-2">Foto Kondisi (dari Customer)</div>
                <div className="grid grid-cols-3 gap-2">
                  {conditionUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`kondisi-${i+1}`} className="aspect-square w-full rounded-lg border object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          {before.length + after.length > 0 && (
            <div>
              <div className="text-sm font-bold text-slate-900 mb-2">Foto Pengerjaan</div>
              <PhotoSection title="Sebelum" photos={before} />
              <PhotoSection title="Sesudah" photos={after} />
            </div>
          )}
          {damage.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">&#9888;&#65039;</span>
                <div>
                  <div className="text-sm font-bold text-red-800">Laporan Kerusakan ({damage.length} foto)</div>
                  <div className="text-xs text-red-600">Cleaner melaporkan adanya kerusakan. Perlu ditindaklanjuti admin.</div>
                </div>
              </div>
              {damage.map((p: any, i: number) => (
                <div key={i} className="mb-3 rounded border border-red-200 bg-white p-2">
                  <a href={p.url} target="_blank" rel="noreferrer" className="block">
                    <img src={p.url} alt="kerusakan" className="max-h-48 w-full rounded object-cover hover:opacity-80" />
                  </a>
                  {p.description && (
                    <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
                      <span className="font-semibold">Deskripsi cleaner:</span> {p.description}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-slate-500">{new Date(p.uploadedAt).toLocaleString('id-ID')}</div>
                </div>
              ))}
            </div>
          )}

          {(data?.booking as any)?.form_snapshot?.createdByAdmin === true ||
           (data?.booking as any)?.form_snapshot?.createdByAdmin === 'true' ? (
            <AdminChatPanel bookingId={bookingId} />
          ) : null}

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
          Server sedang tidak merespon. Coba lagi sebentar atau hubungi tim teknis.
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
  currentCleanerName,
  onClose,
  onAssigned,
}: {
  bookingId: string;
  currentCleanerName?: string | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [cleaners, setCleaners] = useState<{ id: string; name: string; phone?: string; rating?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const isReassign = !!currentCleanerName;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cleaners;
    return cleaners.filter((c) =>
      (c.name ?? '').toLowerCase().includes(q) ||
      (c.id ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q),
    );
  }, [cleaners, search]);

  useEffect(() => {
    void (async () => {
      try {
        const data = (await api.admin.listCleaners({ status: 'active' })) as {
          id: string;
          name: string;
          phone?: string;
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
  const prompt = usePrompt();
  async function pick(cleanerId: string) {
    try {
      if (isReassign) {
        const reason = await prompt({
          title: 'Alasan ganti cleaner',
          message: `Cleaner sekarang: ${currentCleanerName}. Kenapa diganti?`,
          placeholder: 'Min 5 karakter',
          multiline: true,
          minLength: 5,
          variant: 'primary',
          confirmLabel: 'Ganti',
        });
        if (!reason) return;
        await api.admin.reassignCleaner(bookingId, cleanerId, reason);
        toast.success('Cleaner berhasil diganti');
      } else {
        await api.admin.assignCleaner(bookingId, cleanerId);
      }
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
        <h3 className="text-lg font-bold">{isReassign ? 'Ganti Cleaner' : 'Assign Cleaner Manual'}</h3>
        <p className="mt-1 text-xs text-slate-500">Order: {bookingId}</p>
        {isReassign && (
          <p className="mt-1 text-xs text-amber-700">
            Cleaner sekarang: <b>{currentCleanerName}</b> — pilih pengganti.
          </p>
        )}
        <div className="mt-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, ID, atau no HP cleaner..."
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
              autoFocus
            />
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {loading ? 'Memuat...' : `${filtered.length} dari ${cleaners.length} cleaner`}
          </div>
        </div>
        <div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Loading cleaner…
            </div>
          )}
          {!loading && cleaners.length === 0 && (
            <p className="text-sm text-slate-500">Tidak ada cleaner aktif tersedia.</p>
          )}
          {!loading && cleaners.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-slate-500">Tidak ada cleaner yang cocok dengan pencarian.</p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className="w-full rounded-lg border border-slate-200 p-3 text-left hover:border-primary hover:bg-slate-50"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{c.name}</span>
                <span className="font-mono text-[10px] text-slate-400">#{c.id?.slice(0, 8) ?? '—'}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                {c.rating != null && <span> {Number(c.rating).toFixed(1)}</span>}
                {c.phone && <span>· {c.phone}</span>}
              </div>
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

function CreateBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    customerPhone: '',
    customerName: '',
    pricingMode: 'package' as 'package' | 'hourly' | 'wa_survey',
    addressLine: '',
    scheduledAt: '',
    totalAmount: '',
    cleanerId: '',
    paymentStatus: 'unpaid' as 'unpaid' | 'paid',
    adminNote: '',
    cityName: '',
    customerNotes: '',
    lat: -7.7956,
    lng: 110.3695,
  });
  const [geocoding, setGeocoding] = useState(false);
  const [serviceAreas, setServiceAreas] = useState<{ id: string; name: string; city: string }[]>([]);
  const [cleanerMatches, setCleanerMatches] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [cleanerSearch, setCleanerSearch] = useState('');
  const [showCleanerList, setShowCleanerList] = useState(false);
  const [selectedCleanerName, setSelectedCleanerName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerMatches, setCustomerMatches] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [selectedCustomerLabel, setSelectedCustomerLabel] = useState('');
  const [adminCustomer, setAdminCustomer] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [conditionPhotos, setConditionPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.admin.serviceAreas().then((r: any) => setServiceAreas(r ?? [])).catch(() => {});
    api.admin.getAdminCustomer().then(setAdminCustomer).catch(() => {});
  }, []);

  // Debounced search customer
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!customerSearch.trim()) { setCustomerMatches([]); return; }
      try {
        const r = await api.admin.listUsers({ q: customerSearch.trim(), role: 'customer' }) as any[];
        setCustomerMatches(r.slice(0, 20).map((u) => ({ id: u.id, name: u.name ?? u.phone, phone: u.phone })));
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [customerSearch]);

  // Debounced server-side search cleaner
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await api.admin.listCleaners({ status: 'active', q: cleanerSearch.trim() || undefined, limit: 20 });
        setCleanerMatches(r as any);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [cleanerSearch]);

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const { uploadUrl, publicUrl } = await api.admin.cmsUploadUrl(file.type, 'booking-photos');
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setConditionPhotos((prev) => [...prev, publicUrl]);
    } catch {
      toast.error('Gagal upload foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function geocodeAddress() {
    if (!form.addressLine.trim()) return;
    setGeocoding(true);
    try {
      const q = encodeURIComponent(form.addressLine + (form.cityName ? `, ${form.cityName}` : ''));
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'id', 'User-Agent': 'JasaBersih-Admin/1.0' },
      });
      const data = await res.json();
      if (data[0]) {
        setForm((f) => ({ ...f, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }));
        toast.success('Titik lokasi ditemukan');
      } else {
        toast.error('Alamat tidak ditemukan di peta');
      }
    } catch {
      toast.error('Gagal geocode alamat');
    } finally {
      setGeocoding(false);
    }
  }

  async function submit() {
    if (!form.customerPhone || !form.addressLine || !form.scheduledAt || !form.totalAmount || !form.cityName) {
      toast.error('Field wajib kosong — pastikan No HP Customer dan Kota sudah diisi'); return;
    }
    const amount = parseInt(form.totalAmount.replace(/[^\d]/g, ''), 10);
    if (!amount || amount <= 0) { toast.error('Total amount tidak valid'); return; }
    setSubmitting(true);
    try {
      await api.admin.createManualBooking({
        customerPhone: form.customerPhone.trim(),
        customerName: form.customerName.trim() || undefined,
        pricingMode: form.pricingMode,
        addressLine: form.addressLine.trim(),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        totalAmount: amount,
        cleanerId: form.cleanerId || undefined,
        paymentStatus: form.paymentStatus,
        adminNote: form.adminNote.trim() || undefined,
        cityName: form.cityName || undefined,
        customerNotes: form.customerNotes.trim() || undefined,
        conditionPhotos: conditionPhotos.length > 0 ? conditionPhotos : undefined,
        lat: form.lat,
        lng: form.lng,
      });
      onCreated();
    } catch (e: any) { toast.error(e?.message ?? 'Gagal create'); } finally { setSubmitting(false); }
  }

  return (
    <Modal title="Buat Pesanan Manual" open={true} onClose={onClose} size="lg" footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button variant="primary" onClick={submit} loading={submitting}>Buat Pesanan</Button>
      </div>
    }>
      <div className="space-y-3">
        {/* Customer search */}
        {adminCustomer && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <span className="text-xs text-blue-700">Pesanan atas nama admin?</span>
            <button
              type="button"
              onClick={() => {
                setForm({ ...form, customerPhone: adminCustomer.phone, customerName: adminCustomer.name });
                setSelectedCustomerLabel(`${adminCustomer.name} · ${adminCustomer.phone}`);
                setCustomerSearch('');
              }}
              className="ml-auto rounded-md bg-blue-700 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-800"
            >
              Gunakan Akun Admin
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="relative col-span-2">
            <label className="block text-xs font-semibold text-slate-700">Customer <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={selectedCustomerLabel || customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setSelectedCustomerLabel('');
                setForm({ ...form, customerPhone: '', customerName: '' });
                setShowCustomerList(true);
              }}
              onFocus={() => { if (customerSearch) setShowCustomerList(true); }}
              onBlur={() => setTimeout(() => setShowCustomerList(false), 150)}
              placeholder="Cari nama atau No HP customer…"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${!form.customerPhone && selectedCustomerLabel === '' && customerSearch ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
            />
            {selectedCustomerLabel && (
              <button type="button" onClick={() => { setForm({ ...form, customerPhone: '', customerName: '' }); setSelectedCustomerLabel(''); setCustomerSearch(''); }}
                className="absolute right-2 top-7 text-xs text-slate-400 hover:text-red-600">×</button>
            )}
            {showCustomerList && customerMatches.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {customerMatches.map((c) => (
                  <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setForm({ ...form, customerPhone: c.phone, customerName: c.name });
                      setSelectedCustomerLabel(`${c.name} · ${c.phone}`);
                      setCustomerSearch('');
                      setShowCustomerList(false);
                    }}
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50 last:border-b-0"
                  >
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-[10px] text-slate-500">{c.phone}</div>
                  </button>
                ))}
              </div>
            )}
            {!selectedCustomerLabel && customerSearch && customerMatches.length === 0 && (
              <p className="mt-1 text-[10px] text-red-600">Customer tidak ditemukan — tambah dulu di halaman <b>Customers</b></p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Alamat <span className="text-red-500">*</span></label>
            <div className="mt-1 flex gap-1">
              <input
                value={form.addressLine}
                onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && geocodeAddress()}
                placeholder="Jl. Mawar No. 5, Yogyakarta"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <button type="button" onClick={geocodeAddress} disabled={geocoding}
                className="shrink-0 rounded-md bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                title="Cari titik di peta">
                {geocoding ? '…' : ''}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Kota / Area Layanan <span className="text-red-500">*</span></label>
            <select
              value={form.cityName}
              onChange={(e) => setForm({ ...form, cityName: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            >
              <option value="">-- Pilih Kota --</option>
              {serviceAreas.map((a) => (
                <option key={a.id} value={a.city}>{a.name} ({a.city})</option>
              ))}
            </select>
          </div>
        </div>

        <MapPicker
          lat={form.lat}
          lng={form.lng}
          onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
          height={260}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tanggal & Jam" required type="datetime-local" value={form.scheduledAt} onChange={(v) => setForm({ ...form, scheduledAt: v })} />
          <Input label="Total Bayar (Rp)" required value={form.totalAmount} onChange={(v) => setForm({ ...form, totalAmount: v.replace(/[^\d]/g, '') })} placeholder="150000" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700">Cleaner (opsional, assign manual)</label>
            <input
              type="text"
              value={selectedCleanerName || cleanerSearch}
              onChange={(e) => {
                setCleanerSearch(e.target.value);
                setSelectedCleanerName('');
                setForm({ ...form, cleanerId: '' });
                setShowCleanerList(true);
              }}
              onFocus={() => setShowCleanerList(true)}
              onBlur={() => setTimeout(() => setShowCleanerList(false), 150)}
              placeholder="Cari nama/HP, atau biarkan kosong utk broadcast"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {form.cleanerId && (
              <button
                type="button"
                onClick={() => { setForm({ ...form, cleanerId: '' }); setSelectedCleanerName(''); setCleanerSearch(''); }}
                className="absolute right-2 top-7 text-xs text-slate-400 hover:text-red-600"
              >×</button>
            )}
            {showCleanerList && cleanerMatches.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {cleanerMatches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setForm({ ...form, cleanerId: c.id });
                      setSelectedCleanerName(c.name);
                      setCleanerSearch('');
                      setShowCleanerList(false);
                    }}
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50 last:border-b-0"
                  >
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    {c.phone && <div className="text-[10px] text-slate-500">{c.phone}</div>}
                  </button>
                ))}
                {cleanerMatches.length === 20 && (
                  <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-center text-[10px] text-slate-500">
                    Max 20 hasil — ketik lebih spesifik kalau gak ketemu
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Status Bayar</label>
            <select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as any })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="unpaid">Belum Bayar (pending_payment)</option>
              <option value="paid">Sudah Bayar (langsung searching/matched)</option>
            </select>
          </div>
        </div>
        <Textarea label="Catatan Customer" rows={2} value={form.customerNotes} onChange={(v) => setForm({ ...form, customerNotes: v })} placeholder="Mis. tolong bawa alat sendiri, ada anjing, kunci di bawah pot, dll" />

        {/* Foto Kondisi */}
        <div>
          <label className="block text-xs font-semibold text-slate-700">Foto Kondisi (opsional)</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {conditionPhotos.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} alt={`foto-${i + 1}`} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                <button
                  type="button"
                  onClick={() => setConditionPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white"
                >×</button>
              </div>
            ))}
            {conditionPhotos.length < 5 && (
              <label className={`flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-[10px] text-slate-500 hover:border-blue-400 hover:text-blue-500 ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-xl leading-none">{uploadingPhoto ? '…' : '+'}</span>
                <span>Foto</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }} />
              </label>
            )}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Maks 5 foto. Foto kondisi rumah sebelum pengerjaan.</p>
        </div>

        <Textarea label="Catatan Admin" rows={2} value={form.adminNote} onChange={(v) => setForm({ ...form, adminNote: v })} placeholder="Mis. order via WA, customer minta cleaner perempuan, dll" />
        <p className="text-[11px] text-slate-500">Pilih customer dari daftar yang sudah terdaftar. Belum ada? Tambah dulu di halaman <b>Customers</b>.</p>
      </div>
    </Modal>
  );
}

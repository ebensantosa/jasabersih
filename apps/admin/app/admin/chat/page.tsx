'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Search, Eye, AlertTriangle, ShieldAlert } from 'lucide-react';

import { api } from '../../../lib/api';
import { Modal, Input, Button, Badge, useToast } from '../../../components/ui';

type Tab = 'bookings' | 'blocked' | 'stats';

export default function ChatAuditPage(): React.ReactElement | null {
  const [tab, setTab] = useState<Tab>('bookings');
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Chat Audit</h1>
      <p className="text-sm text-slate-500">Monitor chat customer â†” cleaner. PDP compliant â€” semua akses dicatat.</p>

      <div className="mt-4 flex gap-1 border-b">
        {[
          { k: 'bookings' as const, l: 'Active Chats' },
          { k: 'blocked' as const, l: 'Blocked Messages' },
          { k: 'stats' as const, l: 'Statistik' },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 text-sm font-medium ${tab === t.k ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}>
            {t.l}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'bookings' && <BookingsTab />}
        {tab === 'blocked' && <BlockedTab />}
        {tab === 'stats' && <StatsTab />}
      </div>
    </div>
  );
}

function BookingsTab() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    try { setList(await api.admin.chatBookings({ q: q || undefined, hasBlocked: onlyBlocked || undefined })); }
    catch (e: any) { toast.error(e?.message); setList([]); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [onlyBlocked]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Cari nama atau no HP customer/cleanerâ€¦" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <label className="inline-flex items-center gap-2 text-xs">
          <input type="checkbox" checked={onlyBlocked} onChange={(e) => setOnlyBlocked(e.target.checked)} />
          Hanya yg ada blocked
        </label>
        <Button variant="primary" onClick={load}>Cari</Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
          <MessageSquare size={28} className="mx-auto mb-2 text-slate-400" />
          Belum ada chat aktif.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Booking</th><th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Cleaner</th><th className="px-4 py-2">Service</th>
                <th className="px-4 py-2 text-center">Total</th><th className="px-4 py-2 text-center">Blocked</th>
                <th className="px-4 py-2">Last Message</th><th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.bookingId} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{b.bookingId?.slice(0, 8) ?? 'â€”'}â€¦<div className="text-[10px] text-slate-500">{b.bookingStatus}</div></td>
                  <td className="px-4 py-2"><div className="font-medium">{b.customerName ?? 'â€”'}</div><div className="text-xs text-slate-500">{b.customerPhone}</div></td>
                  <td className="px-4 py-2"><div className="font-medium">{b.cleanerName ?? 'â€”'}</div><div className="text-xs text-slate-500">{b.cleanerPhone ?? 'â€”'}</div></td>
                  <td className="px-4 py-2 text-xs">{b.serviceName ?? 'â€”'}</td>
                  <td className="px-4 py-2 text-center">{b.totalMessages}</td>
                  <td className="px-4 py-2 text-center">{b.blockedCount > 0 ? <Badge variant="red">{b.blockedCount}</Badge> : <span className="text-xs text-slate-400">0</span>}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{b.lastMessageAt ? new Date(b.lastMessageAt).toLocaleString('id-ID') : 'â€”'}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="secondary" icon={<Eye size={12} />} onClick={() => setViewing(b)}>Lihat</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && <ThreadModal booking={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ThreadModal({ booking, onClose }: { booking: any; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [messages, setMessages] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!reason || reason.length < 3) return toast.error('Alasan akses wajib (min 3 karakter) â€” dicatat untuk PDP.');
    setBusy(true);
    try { setMessages(await api.admin.chatMessages(booking.bookingId, reason)); }
    catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Chat â€” ${booking.customerName ?? 'â€”'} â†” ${booking.cleanerName ?? 'Cleaner'}`} open={true} onClose={onClose} size="xl">
      {!messages ? (
        <div className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <ShieldAlert size={14} className="inline" /> <b>UU PDP</b> â€” Akses chat ini akan dicatat di <code>data_access_log</code>.
          </div>
          <Input label="Alasan akses" required value={reason} onChange={setReason} placeholder="dispute review / fraud audit / quality check" />
          <Button variant="primary" onClick={load} loading={busy}>Buka Chat</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-slate-500">Total: {messages.length} pesan Â· Akses tercatat: <b>{reason}</b></div>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-md border bg-slate-50 p-3">
            {messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Belum ada pesan.</p>
            ) : messages.map((m) => (
              <div key={m.id} className={`flex ${m.senderId === booking.customerId ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[70%] rounded-lg p-2 text-sm ${m.status === 'blocked' ? 'border border-red-300 bg-red-50' : m.senderId === booking.customerId ? 'bg-white' : 'bg-blue-100'}`}>
                  <div className="text-[10px] text-slate-500">{m.senderName ?? m.senderPhone ?? 'â€”'} Â· {new Date(m.createdAt).toLocaleString('id-ID')}</div>
                  <div className={m.status === 'blocked' ? 'mt-1 italic text-red-800' : 'mt-1'}>{m.content}</div>
                  {m.status === 'blocked' && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-red-700">
                      <AlertTriangle size={10} /> Blocked: {m.blockReason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function BlockedTab() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setList(await api.admin.chatBlocked(200)); } catch (e: any) { toast.error(e?.message); } setLoading(false); }
  useEffect(() => { void load(); }, []);

  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Blocked Messages â€” Off-Platform Detection</h2>
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-slate-500">Belum ada pesan diblokir.</div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Waktu</th><th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Reason</th><th className="px-4 py-2">Konten</th>
                <th className="px-4 py-2">Strikes</th><th className="px-4 py-2">Booking</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-t align-top">
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(m.createdAt).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2"><div className="font-medium">{m.senderName ?? 'â€”'}</div><div className="text-xs text-slate-500">{m.senderPhone}</div>{m.senderStatus && m.senderStatus !== 'active' && <Badge variant="red">{m.senderStatus}</Badge>}</td>
                  <td className="px-4 py-2"><Badge variant="red">{m.blockReason}</Badge></td>
                  <td className="px-4 py-2 max-w-md text-xs italic text-slate-600">{m.content}</td>
                  <td className="px-4 py-2"><Badge variant={m.totalStrikes >= 3 ? 'red' : 'slate'}>{m.totalStrikes}x</Badge></td>
                  <td className="px-4 py-2 font-mono text-xs">{m.bookingId?.slice(0, 8)}â€¦</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatsTab() {
  const toast = useToast();
  const [stats, setStats] = useState<any | null>(null);
  useEffect(() => { (async () => { try { setStats(await api.admin.chatStats()); } catch (e: any) { toast.error(e?.message); } })(); }, []);

  if (!stats) return <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>;
  const last = stats.last7Days ?? {};
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Statistik Chat (7 hari)</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total Messages" value={last.totalMessages ?? 0} />
        <StatCard label="Blocked" value={last.blockedCount ?? 0} highlight={last.blockedCount > 0} />
        <StatCard label="Unique Senders" value={last.uniqueSenders ?? 0} />
        <StatCard label="Active Chats" value={last.activeChats ?? 0} />
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold">Block Reason â€” 30 hari terakhir</h3>
      {!stats.blockedByReason || stats.blockedByReason.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada pesan diblokir 30 hari terakhir.</p>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Reason</th><th className="px-4 py-2 text-right">Count</th></tr>
            </thead>
            <tbody>
              {stats.blockedByReason.map((r: any) => (
                <tr key={r.reason} className="border-t">
                  <td className="px-4 py-2"><Badge variant="red">{r.reason}</Badge></td>
                  <td className="px-4 py-2 text-right font-bold">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${highlight ? 'border-red-300 bg-red-50' : 'bg-white'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${highlight ? 'text-red-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

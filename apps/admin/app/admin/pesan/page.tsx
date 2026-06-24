'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, MapPin, MessageSquare, Package, Paperclip, RefreshCw, Search, Send, User, X } from 'lucide-react';
import { api } from '../../../lib/api';

const ADMIN_PHONE = '+62000000000001';

function InfoRow({ icon, label, value, wide, highlight, badge, badgeColor }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  wide?: boolean;
  highlight?: boolean;
  badge?: string;
  badgeColor?: 'green' | 'red';
}) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
        {icon}{label}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`text-[12px] font-medium ${highlight ? 'text-red-600' : 'text-slate-700'}`}>{value}</span>
        {badge && (
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badgeColor === 'green' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PesanPage(): React.ReactElement | null  {
  const [threads, setThreads] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadThreads(silent = false) {
    try {
      const data = await api.admin.chatInbox();
      setThreads(data);
    } catch {}
  }

  async function loadMessages(bookingId: string) {
    setLoadingMsgs(true);
    try {
      const msgs = await api.admin.chatMessages(bookingId, 'admin-reply');
      setMessages(msgs);
    } catch {} finally {
      setLoadingMsgs(false);
    }
  }

  useEffect(() => {
    void loadThreads();
    const t = setInterval(() => loadThreads(true), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? threads.filter((t) =>
      (t.customerName ?? '').toLowerCase().includes(q) ||
      (t.customerPhone ?? '').includes(q) ||
      (t.serviceName ?? '').toLowerCase().includes(q)
    ) : threads);
  }, [threads, search]);

  useEffect(() => {
    if (!selected) return;
    void loadMessages(selected.bookingId);
    const t = setInterval(() => loadMessages(selected.bookingId), 5000);
    return () => clearInterval(t);
  }, [selected?.bookingId]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [messages.length]);

  async function handleSend(imageUrl?: string) {
    const content = imageUrl ?? text.trim();
    if (!content || sending || !selected) return;
    if (!imageUrl) setText('');
    setSending(true);
    try {
      await api.admin.chatSend(selected.bookingId, content);
      await loadMessages(selected.bookingId);
      void loadThreads(true);
    } catch {} finally {
      setSending(false);
    }
  }

  async function handleImageUpload(file: File) {
    if (!selected) return;
    if (!file.type.startsWith('image/')) { alert('Hanya file gambar yang diizinkan.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Ukuran maksimal 5MB.'); return; }
    setUploadingImg(true);
    try {
      const { uploadUrl, publicUrl } = await api.admin.cmsUploadUrl(file.type, 'chat');
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await handleSend(publicUrl);
    } catch (e: any) {
      alert(e?.message ?? 'Gagal upload gambar');
    } finally {
      setUploadingImg(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const unreadCount = threads.filter((t) => t.lastSenderPhone !== ADMIN_PHONE).length;

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col gap-0">
      {/* Page header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pesan</h1>
          <p className="text-xs text-slate-500">
            Balas chat customer & cleaner sebagai <span className="font-semibold text-blue-600">Admin JasaBersih</span>
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                {unreadCount} belum dibalas
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { void loadThreads(); if (selected) void loadMessages(selected.bookingId); }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Thread list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-slate-100">
          {/* Search */}
          <div className="border-b border-slate-100 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={13} className="shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau nomor…"
                className="flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <X size={12} className="text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>

          {/* Thread items */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-slate-300">
                <MessageSquare size={32} className="mb-2" />
                <div className="text-xs">Belum ada percakapan</div>
              </div>
            ) : filtered.map((t) => {
              const needsReply = t.lastSenderPhone !== ADMIN_PHONE;
              const isSelected = selected?.bookingId === t.bookingId;
              const initials = (t.customerName ?? t.customerPhone ?? 'U').slice(0, 2).toUpperCase();
              const timeStr = t.lastMessageAt
                ? (() => {
                    const d = new Date(t.lastMessageAt);
                    const now = new Date();
                    const isToday = d.toDateString() === now.toDateString();
                    return isToday
                      ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                      : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                  })()
                : '';
              return (
                <button
                  key={t.bookingId}
                  onClick={() => { setSelected(t); setMessages([]); }}
                  className={`group w-full border-b border-slate-50 px-3 py-3 text-left transition-all ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50 border-l-2 border-l-transparent'}`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Avatar */}
                    <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${isSelected ? 'bg-blue-500' : 'bg-slate-400'}`}>
                      {initials}
                      {needsReply && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`truncate text-[13px] font-semibold ${needsReply ? 'text-slate-900' : 'text-slate-600'}`}>
                          {t.customerName ?? t.customerPhone ?? '—'}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">{timeStr}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="truncate text-[11px] text-slate-400">{t.serviceName ?? '—'}</span>
                        {t.isManual && (
                          <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">MANUAL</span>
                        )}
                      </div>
                      <div className={`mt-1 truncate text-[12px] ${needsReply ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
                        {t.lastMessage ?? '—'}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat panel */}
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 text-slate-300">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm mb-3">
              <MessageSquare size={28} className="text-slate-300" />
            </div>
            <div className="text-sm font-medium text-slate-400">Pilih percakapan</div>
            <div className="mt-1 text-xs text-slate-300">Klik salah satu chat di sebelah kiri</div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Thread header */}
            <div className="border-b border-slate-100 bg-white shadow-sm">
              <div className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow">
                  {(selected.customerName ?? 'U').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900">{selected.customerName ?? selected.customerPhone}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-400">{selected.customerPhone}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-[10px] text-slate-400">#{selected.bookingId?.slice(0, 8)}</span>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  selected.bookingStatus === 'searching' ? 'bg-blue-100 text-blue-700' :
                  ['matched', 'in_progress', 'cleaner_otw'].includes(selected.bookingStatus) ? 'bg-green-100 text-green-700' :
                  selected.bookingStatus === 'completed' ? 'bg-slate-100 text-slate-500' :
                  'bg-red-100 text-red-600'
                }`}>
                  {selected.bookingStatus}
                </span>
                <button
                  onClick={() => setInfoOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  {infoOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Info
                </button>
              </div>

              {/* Booking info panel */}
              {infoOpen && (() => {
                const snap = selected.formSnapshot ?? {};
                const city = snap.cityName ?? null;
                const notes = selected.customerNotes ?? snap.customerNotes ?? null;
                const photos: string[] = Array.isArray(snap.conditionPhotos) ? snap.conditionPhotos : [];
                const scheduledAt = selected.scheduledAt ? new Date(selected.scheduledAt) : null;
                const paidAt = selected.paidAt ? new Date(selected.paidAt) : null;
                return (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs">
                    <InfoRow icon={<Package size={11} />} label="Paket" value={selected.packageName ?? selected.serviceName ?? selected.serviceCategory ?? selected.pricingMode ?? '—'} />
                    <InfoRow icon={<User size={11} />} label="Cleaner" value={selected.cleanerName ? `${selected.cleanerName} · ${selected.cleanerPhone ?? ''}` : '—'} />
                    <InfoRow icon={<CalendarDays size={11} />} label="Jadwal" value={scheduledAt ? scheduledAt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} />
                    <InfoRow icon={null} label="Total" value={selected.totalAmount ? `Rp ${Number(selected.totalAmount).toLocaleString('id-ID')}` : '—'} highlight={!paidAt} badge={paidAt ? 'Lunas' : 'Belum bayar'} badgeColor={paidAt ? 'green' : 'red'} />
                    <InfoRow icon={<MapPin size={11} />} label="Alamat" value={[selected.addressLine, city].filter(Boolean).join(' · ') || '—'} wide />
                    {notes && <InfoRow icon={null} label="Catatan Customer" value={notes} wide />}
                    {photos.length > 0 && (
                      <div className="col-span-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Foto Kondisi</div>
                        <div className="flex gap-2 flex-wrap">
                          {photos.map((url, i) => (
                            <button key={i} onClick={() => setPreviewImg(url)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`foto-${i}`} className="h-14 w-14 rounded-lg border object-cover hover:opacity-80 transition-opacity" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-slate-50 px-5 py-4 space-y-3">
              {loadingMsgs && messages.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-xs text-slate-400">Memuat pesan…</div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-slate-300">
                  <MessageSquare size={28} className="mb-2" />
                  <span className="text-xs">Belum ada pesan</span>
                </div>
              ) : messages.map((m) => {
                const isAdmin = m.isAdmin || m.senderPhone === ADMIN_PHONE;
                const isImage = m.messageType === 'image' || (m.content && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(m.content));
                return (
                  <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[65%] ${isAdmin ? 'items-end' : 'items-start'} flex flex-col`}>
                      {!isAdmin && (
                        <span className="mb-1 text-[10px] font-medium text-slate-400">{m.senderName ?? m.senderPhone ?? 'User'}</span>
                      )}
                      {isAdmin && (
                        <span className="mb-1 text-[10px] font-medium text-blue-500 text-right">Admin JasaBersih</span>
                      )}
                      <div className={`rounded-2xl shadow-sm ${isAdmin ? 'rounded-tr-sm bg-blue-600 text-white' : 'rounded-tl-sm bg-white border border-slate-200 text-slate-800'} ${isImage ? 'overflow-hidden p-0' : 'px-4 py-2.5'}`}>
                        {isImage ? (
                          <button onClick={() => setPreviewImg(m.attachmentUrl ?? m.content)} className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={m.attachmentUrl ?? m.content} alt="foto" className="max-h-52 max-w-xs object-cover" />
                          </button>
                        ) : (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        )}
                      </div>
                      <span className={`mt-1 text-[10px] text-slate-400 ${isAdmin ? 'text-right' : ''}`}>
                        {new Date(m.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Compose bar */}
            <div className="border-t border-slate-100 bg-white px-4 py-3">
              <div className="flex items-end gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50 transition-all">
                {/* Image upload */}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImageUpload(f); }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingImg || sending}
                  title="Kirim gambar"
                  className="mb-0.5 shrink-0 text-slate-400 hover:text-blue-600 disabled:opacity-40 transition-colors"
                >
                  {uploadingImg ? (
                    <span className="flex h-5 w-5 items-center justify-center">
                      <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    </span>
                  ) : (
                    <Paperclip size={18} />
                  )}
                </button>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  placeholder="Tulis pesan… (Enter kirim · Shift+Enter baris baru)"
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 max-h-32"
                  style={{ minHeight: '24px' }}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = 'auto';
                    t.style.height = Math.min(t.scrollHeight, 128) + 'px';
                  }}
                />

                <button
                  onClick={() => void handleSend()}
                  disabled={!text.trim() || sending}
                  className="mb-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm disabled:opacity-40 hover:bg-blue-700 active:scale-95 transition-all"
                >
                  {sending ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-slate-400">
                Pesan dikirim atas nama <span className="font-semibold text-blue-600">Admin JasaBersih</span> · Gambar maks 5MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Image preview lightbox */}
      {previewImg && (
        <div
          onClick={() => setPreviewImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <button onClick={() => setPreviewImg(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImg} alt="preview" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

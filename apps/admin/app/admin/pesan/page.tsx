'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import { api } from '../../../lib/api';

const ADMIN_PHONE = '+62000000000001';

export default function PesanPage() {
  const [threads, setThreads] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    try {
      const data = await api.admin.chatInbox();
      setThreads(data);
    } catch {}
    setLoadingThreads(false);
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
    const t = setInterval(loadThreads, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selected) return;
    void loadMessages(selected.bookingId);
    const t = setInterval(() => loadMessages(selected.bookingId), 5000);
    return () => clearInterval(t);
  }, [selected?.bookingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend() {
    if (!text.trim() || sending || !selected) return;
    setSending(true);
    try {
      await api.admin.chatSend(selected.bookingId, text.trim());
      setText('');
      await loadMessages(selected.bookingId);
      // Refresh thread list supaya last message update
      void loadThreads();
    } catch {} finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pesan</h1>
          <p className="text-xs text-slate-500">Balas chat customer & cleaner sebagai Admin JasaBersih</p>
        </div>
        <button
          onClick={() => { void loadThreads(); if (selected) void loadMessages(selected.bookingId); }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Thread list */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-200">
          {loadingThreads && threads.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">Memuat…</div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <MessageSquare size={28} className="mb-2" />
              <div className="text-xs">Belum ada chat</div>
            </div>
          ) : threads.map((t) => {
            const needsReply = t.lastSenderPhone !== ADMIN_PHONE;
            const isSelected = selected?.bookingId === t.bookingId;
            return (
              <button
                key={t.bookingId}
                onClick={() => { setSelected(t); setMessages([]); }}
                className={`w-full border-b border-slate-100 px-3 py-3 text-left transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {needsReply && (
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      )}
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {t.customerName ?? t.customerPhone ?? '—'}
                      </span>
                      {t.isManual && (
                        <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">MANUAL</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">{t.serviceName ?? '—'}</div>
                    <div className="mt-1 truncate text-xs text-slate-600">{t.lastMessage ?? '—'}</div>
                  </div>
                  <div className="shrink-0 text-[10px] text-slate-400">
                    {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Chat panel */}
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
            <MessageSquare size={36} className="mb-3" />
            <div className="text-sm">Pilih percakapan di kiri</div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {(selected.customerName ?? 'U')[0].toUpperCase()}
              </div>
              <div>
                <div className="font-semibold text-slate-900">{selected.customerName ?? selected.customerPhone}</div>
                <div className="text-[11px] text-slate-500">{selected.customerPhone} · {selected.serviceName ?? '—'} · #{selected.bookingId?.slice(0, 8)}</div>
              </div>
              <div className="ml-auto">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected.bookingStatus === 'searching' ? 'bg-blue-100 text-blue-700' : selected.bookingStatus === 'matched' || selected.bookingStatus === 'in_progress' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                  {selected.bookingStatus}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-2 p-4 bg-slate-50">
              {loadingMsgs && messages.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">Memuat pesan…</div>
              ) : messages.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">Belum ada pesan</div>
              ) : [...messages].reverse().map((m) => {
                const isAdmin = m.isAdmin || m.senderPhone === ADMIN_PHONE;
                return (
                  <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[70%]">
                      {!isAdmin && (
                        <div className="mb-0.5 text-[10px] text-slate-500">{m.senderName ?? m.senderPhone ?? 'User'}</div>
                      )}
                      <div className={`rounded-2xl px-3 py-2 text-sm ${isAdmin ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 border border-slate-200'}`}>
                        {m.messageType === 'image' ? (
                          <a href={m.attachmentUrl ?? m.content} target="_blank" rel="noreferrer" className="underline">📷 Foto</a>
                        ) : m.content}
                      </div>
                      <div className={`mt-0.5 text-[9px] text-slate-400 ${isAdmin ? 'text-right' : ''}`}>
                        {isAdmin ? 'Admin JasaBersih · ' : ''}{new Date(m.createdAt).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-slate-200 bg-white p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  placeholder="Tulis pesan sebagai Admin JasaBersih… (Enter kirim, Shift+Enter baris baru)"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"
                >
                  {sending ? <span className="text-xs">…</span> : <Send size={16} />}
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400">Pesan dikirim atas nama <b>Admin JasaBersih</b></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

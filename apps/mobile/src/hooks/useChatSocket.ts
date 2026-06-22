import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import { getChatSocket, type ChatMessage, type SendResult } from '../lib/chatSocket';

type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useChatSocket(bookingId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>('connecting');
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load history via REST first
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/chat/booking/${bookingId}`, { params: { limit: 100 } });
        const items: any[] = (res.data?.data ?? []).reverse(); // backend returns desc
        if (!cancelled) setMessages(items.map((m) => ({
          id: m.id, bookingId, senderId: m.senderId, recipientId: m.recipientId,
          messageType: m.messageType, content: m.content, attachmentUrl: m.attachmentUrl,
          createdAt: m.createdAt, readAt: m.readAt ?? null, isAdmin: !!m.isAdmin,
        })));
      } catch {
        // silent - connection still works
      }
    })();
    return () => { cancelled = true; };
  }, [bookingId]);

  // Socket lifecycle
  useEffect(() => {
    if (!bookingId) return;
    const socket = getChatSocket();

    function onConnect() {
      setStatus('connected');
      socket.emit('join', { bookingId }, (res: { ok: boolean; error?: string }) => {
        if (!res?.ok) setStatus('error');
      });
    }
    function onDisconnect() { setStatus('disconnected'); }
    function onConnectError() { setStatus('error'); }
    function onMessage(msg: ChatMessage & { isAdmin?: boolean }) {
      if (msg.bookingId !== bookingId) return;
      const mapped: ChatMessage = { ...msg, isAdmin: !!msg.isAdmin };
      setMessages((prev) => prev.some((m) => m.id === mapped.id) ? prev : [...prev, mapped]);
    }
    function onTyping(payload: { userId: string; typing: boolean }) {
      setOtherTyping(payload.typing);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setOtherTyping(false), 3000);
    }
    function onRead(payload: { bookingId: string; readerId: string; readAt: string }) {
      if (payload.bookingId !== bookingId) return;
      // Mark semua pesan yg dikirim ke readerId (sebagai recipient) jadi read.
      setMessages((prev) => prev.map((m) =>
        m.recipientId === payload.readerId && !m.readAt
          ? { ...m, readAt: payload.readAt }
          : m,
      ));
    }

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('message', onMessage);
    socket.on('typing', onTyping);
    socket.on('read', onRead);

    return () => {
      socket.emit('leave', { bookingId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('message', onMessage);
      socket.off('typing', onTyping);
      socket.off('read', onRead);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [bookingId]);

  const send = useCallback(async (
    content: string,
    opts?: { messageType?: 'text' | 'image'; attachmentUrl?: string },
  ): Promise<SendResult> => {
    if (!bookingId || !content.trim()) return { ok: false, error: 'empty' };
    const socket = getChatSocket();
    const messageType = opts?.messageType ?? 'text';
    return new Promise((resolve) => {
      let settled = false;
      const finish = (res: SendResult): void => {
        if (settled) return;
        settled = true;
        resolve(res);
      };
      socket.emit(
        'send',
        { bookingId, content: content.trim(), messageType, attachmentUrl: opts?.attachmentUrl },
        (res: SendResult) => finish(res ?? { ok: true }),
      );
      setTimeout(() => finish({ ok: true }), 5000);
    });
  }, [bookingId]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!bookingId) return;
    const socket = getChatSocket();
    socket.emit('typing', { bookingId, typing: isTyping });
  }, [bookingId]);

  return { messages, status, otherTyping, send, setTyping };
}

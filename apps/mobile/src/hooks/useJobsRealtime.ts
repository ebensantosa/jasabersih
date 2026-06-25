import { useEffect, useRef, useState } from 'react';

import { getJobsSocket, type IncomingJob } from '../lib/jobsSocket';
import { useVisiblePoll } from '../lib/useVisiblePoll';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useCleanerStore } from '../stores/cleaner';
import { useModeStore } from '../stores/mode';

// Connect to /jobs socket when:
// - User authenticated
// - Mode = freelancer (cleaner mode active)
// - Cleaner is_available = true
// Listen for 'incoming-job' + 'job-taken' events. Also exposes acceptJob().
export function useJobsRealtime() {
  const tokens = useAuthStore((s) => s.tokens);
  const mode = useModeStore((s) => s.mode);
  const areas = useCleanerStore((s) => s.serviceAreas);
  const userIsAvailable = useCleanerStore((s) => s.isAvailable);
  const [queue, setQueue] = useState<IncomingJob[]>([]);
  const incoming = queue[0] ?? null;
  const queuedCount = Math.max(0, queue.length - 1);
  const [takenIds, setTakenIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const takenIdsRef = useRef(takenIds);
  const dismissedIdsRef = useRef(dismissedIds);
  takenIdsRef.current = takenIds;
  dismissedIdsRef.current = dismissedIds;
  const onlineRef = useRef(false);
  const lastSurfacedIdRef = useRef<string | null>(null);
  const SEARCH_TIMEOUT_SEC = 15 * 60;

  function isPopupEligible(job: IncomingJob): boolean {
    if (!job?.id) return false;
    if (takenIdsRef.current.has(job.id)) return false;
    if (dismissedIdsRef.current.has(job.id)) return false;
    if (!matchesArea(job)) return false;
    const createdAtMs = job.createdAt ? Date.parse(job.createdAt) : Date.now();
    if (!Number.isFinite(createdAtMs)) return true;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
    return elapsedSec < SEARCH_TIMEOUT_SEC;
  }

  function matchesArea(job: IncomingJob): boolean {
    const normalizedAreas = areas
      .map((area) => String(area).trim().toLowerCase())
      .filter(Boolean);
    const address = String(job.addressLine ?? '').toLowerCase();
    if (normalizedAreas.length === 0) return true;
    return normalizedAreas.some((area) => address.includes(area));
  }

  useEffect(() => {
    const shouldBeOnline = !!tokens && mode === 'freelancer' && userIsAvailable;
    if (!shouldBeOnline) {
      if (onlineRef.current) {
        const s = getJobsSocket();
        s.emit('go-offline', {});
        onlineRef.current = false;
      }
      return;
    }

    const socket = getJobsSocket();

    function onConnect() {
      socket.emit('go-online', {}, (res: { ok: boolean }) => {
        onlineRef.current = !!res?.ok;
        if (res?.ok) {
          // Fetch jobs yg sudah 'searching' sebelum kita go-online (misal: customer bayar saldo saat cleaner offline)
          void api.get('/cleaner/jobs/available').then((r) => {
            const list = ((r.data?.data ?? r.data ?? []) as IncomingJob[]).filter((job) => isPopupEligible(job));
            if (list.length === 0) return;
            setQueue((prev) => {
              const existing = new Set(prev.map((j) => j.id));
              const merged = [...prev];
              for (const j of list) if (!existing.has(j.id)) merged.push(j);
              return merged;
            });
          }).catch(() => {});
        }
      });
    }
    function onIncoming(job: IncomingJob) {
      if (!isPopupEligible(job)) return;
      lastSurfacedIdRef.current = job.id;
      setQueue((prev) => (prev.some((j) => j.id === job.id) ? prev : [...prev, job]));
    }
    function onTaken(payload: { bookingId: string }) {
      setTakenIds((prev) => new Set(prev).add(payload.bookingId));
      setQueue((prev) => prev.filter((j) => j.id !== payload.bookingId));
    }

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);
    socket.on('incoming-job', onIncoming);
    socket.on('job-taken', onTaken);

    return () => {
      socket.emit('go-offline', {});
      onlineRef.current = false;
      socket.off('connect', onConnect);
      socket.off('incoming-job', onIncoming);
      socket.off('job-taken', onTaken);
    };
  }, [tokens, mode, areas, userIsAvailable]);

  const [socketConnected, setSocketConnected] = useState(false);
  useEffect(() => {
    const socket = getJobsSocket();
    const onConn = () => setSocketConnected(true);
    const onDisc = () => setSocketConnected(false);
    setSocketConnected(socket.connected);
    socket.on('connect', onConn);
    socket.on('disconnect', onDisc);
    return () => { socket.off('connect', onConn); socket.off('disconnect', onDisc); };
  }, []);

  const shouldBeOnline = !!tokens && mode === 'freelancer' && userIsAvailable;
  const fallbackEnabled = shouldBeOnline && !socketConnected;

  // Sweep /available dan tambah ke queue kalau ada job yang terlewat socket event
  // (misal: order dibayar sebelum cleaner masuk ROOM_AVAILABLE).
  const sweepAvailable = async () => {
    if (queue.length > 0) return; // sudah ada popup, skip
    try {
      const r = await api.get('/cleaner/jobs/available');
      const list = ((r.data?.data ?? r.data ?? []) as IncomingJob[]).filter((job) => isPopupEligible(job));
      if (list.length === 0) return;
      setQueue((prev) => {
        const existing = new Set(prev.map((j) => j.id));
        const merged = [...prev];
        for (const j of list) if (!existing.has(j.id)) merged.push(j);
        if (merged[0]) lastSurfacedIdRef.current = merged[0].id;
        return merged;
      });
    } catch {
      // silent
    }
  };
  useEffect(() => {
    if (fallbackEnabled) void sweepAvailable();
  }, [fallbackEnabled]);
  // 30s saat socket putus (fallback aktif), 60s saat socket nyambung (tangkap missed events)
  useVisiblePoll(sweepAvailable, 30_000, fallbackEnabled);
  useVisiblePoll(sweepAvailable, 60_000, shouldBeOnline && socketConnected);

  function dismiss(bookingId?: string) {
    if (bookingId) {
      setDismissedIds((prev) => new Set(prev).add(bookingId));
      setQueue((prev) => prev.filter((j) => j.id !== bookingId));
    } else {
      setQueue((prev) => prev.slice(1));
    }
  }

  function accept(bookingId: string): Promise<{ ok: boolean; error?: string }> {
    const socket = getJobsSocket();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (res: { ok: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        if (res?.ok) {
          setQueue((prev) => prev.filter((j) => j.id !== bookingId));
          setDismissedIds((prev) => {
            const next = new Set(prev);
            next.delete(bookingId);
            return next;
          });
        }
        resolve(res);
      };
      // Fallback: kalau ACK socket gak datang dalam 6 detik, langsung verify
      // via REST. Bisa terjadi kalau socket disconnect tengah jalan.
      const timer = setTimeout(async () => {
        try {
          const r = await api.post(`/cleaner/jobs/${bookingId}/accept`);
          finish({ ok: !!(r.data?.ok ?? r.data?.data?.ok ?? true) });
        } catch (e: any) {
          const msg = e?.response?.data?.error?.message ?? 'Koneksi lambat, coba lagi';
          finish({ ok: false, error: msg });
        }
      }, 6000);
      socket.emit('accept-job', { bookingId }, (res: { ok: boolean; error?: string }) => {
        clearTimeout(timer);
        finish(res ?? { ok: false, error: 'no response' });
      });
    });
  }

  return { incoming, queuedCount, takenIds, dismiss, accept };
}

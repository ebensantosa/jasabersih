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
  const [incoming, setIncoming] = useState<IncomingJob | null>(null);
  const [takenIds, setTakenIds] = useState<Set<string>>(new Set());
  const onlineRef = useRef(false);
  const lastSurfacedIdRef = useRef<string | null>(null);

  function matchesArea(job: IncomingJob): boolean {
    const normalizedAreas = areas
      .map((area) => String(area).trim().toLowerCase())
      .filter(Boolean);
    const address = String(job.addressLine ?? '').toLowerCase();
    if (normalizedAreas.length === 0) return true;
    return normalizedAreas.some((area) => address.includes(area));
  }

  useEffect(() => {
    const shouldBeOnline = !!tokens && mode === 'freelancer';
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
      });
    }
    function onIncoming(job: IncomingJob) {
      if (!matchesArea(job)) return;
      lastSurfacedIdRef.current = job.id;
      setIncoming((prev) => prev ?? job); // Don't replace if already showing one
    }
    function onTaken(payload: { bookingId: string }) {
      setTakenIds((prev) => new Set(prev).add(payload.bookingId));
      setIncoming((prev) => (prev?.id === payload.bookingId ? null : prev));
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
  }, [tokens, mode, areas]);

  const fallbackEnabled = !!tokens && mode === 'freelancer';
  const pullAvailableFallback = async () => {
    if (!fallbackEnabled) return;
    if (incoming) return;
    try {
      const r = await api.get('/cleaner/jobs/available');
      const list = ((r.data?.data ?? r.data ?? []) as IncomingJob[]).filter((job) => {
        if (!job?.id) return false;
        if (takenIds.has(job.id)) return false;
        if (!matchesArea(job)) return false;
        return true;
      });
      const next = list.find((job) => job.id !== lastSurfacedIdRef.current) ?? list[0];
      if (!next) return;
      lastSurfacedIdRef.current = next.id;
      setIncoming(next);
    } catch {
      // silent fallback
    }
  };
  useEffect(() => {
    if (fallbackEnabled) void pullAvailableFallback();
  }, [fallbackEnabled]);
  useVisiblePoll(pullAvailableFallback, 12_000, fallbackEnabled);

  function dismiss() { setIncoming(null); }

  function accept(bookingId: string): Promise<{ ok: boolean; error?: string }> {
    const socket = getJobsSocket();
    return new Promise((resolve) => {
      socket.emit('accept-job', { bookingId }, (res: { ok: boolean; error?: string }) => {
        if (res?.ok) setIncoming(null);
        resolve(res ?? { ok: false, error: 'no response' });
      });
    });
  }

  return { incoming, takenIds, dismiss, accept };
}

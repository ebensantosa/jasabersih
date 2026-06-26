import { useEffect } from 'react';

import { getJobsSocket } from '../lib/jobsSocket';
import { useAuthStore } from '../stores/auth';
import { mapServerStatus, useBookingsStore } from '../stores/bookings';

// Connect all authenticated users (customer & cleaner) to /jobs socket.
// Handles real-time booking events pushed from server — eliminates polling.
export function useBookingRealtime() {
  const tokens = useAuthStore((s) => s.tokens);
  const patchTimer = useBookingsStore((s) => s.patchTimer);
  const setStatus = useBookingsStore((s) => s.setStatus);
  const signalReload = useBookingsStore((s) => s.signalReload);
  const fetchOne = useBookingsStore((s) => s.fetchOne);

  useEffect(() => {
    if (!tokens?.accessToken) return;

    const socket = getJobsSocket();

    function onTimer(data: { bookingId: string; pauseStartedAt: number | null; pausedTotalSec: number }) {
      if (!data?.bookingId) return;
      patchTimer(data.bookingId, {
        pauseStartedAt: data.pauseStartedAt === null ? undefined : data.pauseStartedAt,
        pausedTotalSec: data.pausedTotalSec ?? 0,
      });
    }

    function onStatus(data: { bookingId: string; status: string }) {
      if (!data?.bookingId || !data?.status) return;
      setStatus(data.bookingId, mapServerStatus(data.status));
      // fetchOne to pull updated timestamps (startedAt, completedAt, cleanerName, etc.)
      void fetchOne(data.bookingId).catch(() => {});
    }

    function onReload(data: { bookingId: string }) {
      if (!data?.bookingId) return;
      signalReload(data.bookingId);
      void fetchOne(data.bookingId).catch(() => {});
    }

    socket.on('booking:timer', onTimer);
    socket.on('booking:status', onStatus);
    socket.on('booking:reload', onReload);

    return () => {
      socket.off('booking:timer', onTimer);
      socket.off('booking:status', onStatus);
      socket.off('booking:reload', onReload);
    };
  }, [tokens, patchTimer, setStatus, signalReload, fetchOne]);
}

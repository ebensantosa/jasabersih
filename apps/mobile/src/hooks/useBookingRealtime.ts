import { useEffect } from 'react';

import { getJobsSocket } from '../lib/jobsSocket';
import { useAuthStore } from '../stores/auth';
import { useBookingsStore } from '../stores/bookings';

type TimerEvent = {
  bookingId: string;
  pauseStartedAt: number | null;
  pausedTotalSec: number;
};

// Connect all authenticated users (customer & cleaner) to /jobs socket
// to receive real-time booking:timer events (pause/resume) pushed from server.
export function useBookingRealtime() {
  const tokens = useAuthStore((s) => s.tokens);
  const patchTimer = useBookingsStore((s) => s.patchTimer);

  useEffect(() => {
    if (!tokens?.accessToken) return;

    const socket = getJobsSocket();

    function onTimer(data: TimerEvent) {
      if (!data?.bookingId) return;
      patchTimer(data.bookingId, {
        pauseStartedAt: data.pauseStartedAt === null ? undefined : data.pauseStartedAt,
        pausedTotalSec: data.pausedTotalSec ?? 0,
      });
    }

    socket.on('booking:timer', onTimer);
    return () => { socket.off('booking:timer', onTimer); };
  }, [tokens, patchTimer]);
}

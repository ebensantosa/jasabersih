import { router, usePathname } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { api } from '../lib/api';
import { useVisiblePoll } from '../lib/useVisiblePoll';
import { useAuthStore } from '../stores/auth';
import { useCleanerKycStore } from '../stores/cleanerKyc';
import { useModeStore } from '../stores/mode';

/**
 * Root-level guard: kalau user freelancer + KYC bukan approved,
 * force redirect ke /cleaner/kyc. User gak bisa keluar dari KYC page
 * sampai admin approve. Polling tiap 20s untuk auto-unlock saat approved.
 */
export function CleanerLockOverlay() {
  const tokens = useAuthStore((s) => s.tokens);
  const mode = useModeStore((s) => s.mode);
  const pathname = usePathname();
  const kycStatus = useCleanerKycStore((s) => s.status);
  const setKycStatus = useCleanerKycStore((s) => s.setStatus);
  const hydrate = useCleanerKycStore((s) => s.hydrate);

  // Hydrate persisted status on mount → no flash on cold start
  useEffect(() => { hydrate(); }, [hydrate]);

  const fetchStatus = useCallback(async () => {
    if (!tokens || mode !== 'freelancer') return;
    try {
      const res = await api.get('/cleaner/profile');
      const p = res.data?.data ?? res.data;
      setKycStatus(p?.kycStatus ?? 'pending');
    } catch { /* keep cached */ }
  }, [tokens, mode, setKycStatus]);

  // Refresh tiap 60s - auto unlock kalau admin approve di server.
  // Pause saat app di background biar gak buang baterai.
  useVisiblePoll(fetchStatus, 60_000, !!tokens && mode === 'freelancer');

  useEffect(() => {
    if (!tokens || mode !== 'freelancer' || kycStatus === null) return;

    if (kycStatus !== 'approved') {
      // Force ke /cleaner/kyc kalau gak lagi di KYC page atau auth pages
      const allowedPaths = ['/cleaner/kyc', '/(auth)/', '/suspended'];
      const isAllowed = allowedPaths.some((p) => pathname?.startsWith(p));
      if (!isAllowed) {
        router.replace('/cleaner/kyc');
      }
    } else {
      // Approved cleaner stuck di KYC page → auto-redirect ke Job Board
      if (pathname === '/cleaner/kyc') {
        router.replace('/(tabs)/jobs');
      }
    }
  }, [tokens, mode, kycStatus, pathname]);

  return null;
}

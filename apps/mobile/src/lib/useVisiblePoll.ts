import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Polling yang otomatis berhenti saat app di background, dan jalan ulang
 * saat kembali aktif. Hemat baterai + bandwidth.
 *
 * Pakai untuk polling endpoint API yang gak urgent - kalau user lagi
 * gak liat layar, gak perlu fetch terus.
 */
export function useVisiblePoll(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void cbRef.current();
      timer = setInterval(() => { void cbRef.current(); }, intervalMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    // Mulai polling kalau app aktif
    if (AppState.currentState === 'active') start();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [intervalMs, enabled]);
}

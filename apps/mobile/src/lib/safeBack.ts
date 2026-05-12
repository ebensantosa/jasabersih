import type { Router } from 'expo-router';

// router.back() jadi no-op kalau navigation stack kosong (deep link, push
// notification, screen pertama setelah replace). Helper ini menambah
// fallback ke tab utama biar tombol back selalu ada kelanjutannya.
export function safeBack(router: Router, fallback: string = '/(tabs)'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

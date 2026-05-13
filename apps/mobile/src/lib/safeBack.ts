import { router } from 'expo-router';

/**
 * router.back() yang aman saat tidak ada history stack
 * (mis. user buka deep link langsung). Fallback ke route default.
 */
export function safeBack(fallback: string = '/(tabs)') {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {}
  router.replace(fallback as never);
}

/**
 * Analytics wrapper untuk Firebase Analytics + Crashlytics.
 * Web → no-op (Firebase Analytics web pakai SDK terpisah).
 * Native (iOS/Android) → push event ke Firebase.
 *
 * Pakai try-catch defensif biar gak ngegangguin app kalau Firebase belum init.
 */
import { Platform } from 'react-native';

type EventParams = Record<string, string | number | boolean | undefined | null>;

/** Lazy-import biar gak break di web (firebase native module gak ada). */
let analytics: any = null;
let crashlytics: any = null;
let initStarted = false;

async function ensureInit(): Promise<void> {
  if (initStarted || Platform.OS === 'web') return;
  initStarted = true;
  try {
    const [analyticsModule, crashlyticsModule] = await Promise.all([
      import('@react-native-firebase/analytics'),
      import('@react-native-firebase/crashlytics'),
    ]);
    analytics = analyticsModule.default;
    crashlytics = crashlyticsModule.default;
    // Enable Crashlytics collection (production only - di dev mode auto-disable)
    if (!__DEV__) {
      crashlytics().setCrashlyticsCollectionEnabled(true);
    }
  } catch (e) {
    // Module gak ke-link / Expo Go → silent fail
    // eslint-disable-next-line no-console
    if (__DEV__) console.warn('[analytics] Firebase not available:', (e as Error).message);
  }
}

/**
 * Log custom event ke Firebase Analytics.
 * Naming convention: snake_case, max 40 char.
 */
export function trackEvent(name: string, params?: EventParams): void {
  if (Platform.OS === 'web') return;
  void (async () => {
    await ensureInit();
    try {
      if (!analytics) return;
      // Filter null/undefined supaya Firebase gak nolak
      const clean: Record<string, string | number | boolean> = {};
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null) clean[k] = v;
        }
      }
      await analytics().logEvent(name, clean);
    } catch { /* silent */ }
  })();
}

/** Set user property (mis. mode: 'customer' / 'cleaner', tier, dll) */
export function setUserProperty(key: string, value: string | null): void {
  if (Platform.OS === 'web') return;
  void (async () => {
    await ensureInit();
    try { if (analytics) await analytics().setUserProperty(key, value); } catch {}
  })();
}

/** Set user ID (untuk cross-session tracking) */
export function setUserId(id: string | null): void {
  if (Platform.OS === 'web') return;
  void (async () => {
    await ensureInit();
    try {
      if (analytics) await analytics().setUserId(id);
      if (crashlytics && id) crashlytics().setUserId(id);
    } catch {}
  })();
}

/** Log non-fatal error ke Crashlytics (untuk error yang di-handle tapi mau di-track) */
export function trackError(error: Error, context?: string): void {
  if (Platform.OS === 'web') return;
  void (async () => {
    await ensureInit();
    try {
      if (!crashlytics) return;
      if (context) crashlytics().log(context);
      crashlytics().recordError(error);
    } catch {}
  })();
}

/** Log screen view manual (kalau gak pakai expo-router auto-tracking) */
export function trackScreen(name: string, params?: EventParams): void {
  trackEvent('screen_view', { screen_name: name, ...params });
}

// ============================================================
// Convenience wrappers untuk event utama JasaBersih
// ============================================================

export const Track = {
  // Auth
  signupStarted: () => trackEvent('signup_started'),
  signupSuccess: (method: string) => trackEvent('signup_success', { method }),
  loginSuccess: (method: string) => trackEvent('login_success', { method }),
  logout: () => trackEvent('logout'),

  // Service / browsing
  serviceView: (code: string, name: string) => trackEvent('service_view', { service_code: code, service_name: name }),
  serviceSelected: (code: string, name: string) => trackEvent('service_selected', { service_code: code, service_name: name }),

  // Booking funnel
  bookingStarted: (code: string) => trackEvent('booking_started', { service_code: code }),
  addonAdded: (code: string, name: string, price: number) => trackEvent('addon_added', { addon_code: code, addon_name: name, price }),
  // GA4 standard 'begin_checkout' supaya Google Ads bisa pakai sebagai mid-funnel signal.
  // value+currency wajib untuk value-based bidding (tROAS).
  bookingCreated: (bookingId: string, total: number, mode: string) => {
    trackEvent('booking_created', { booking_id: bookingId, total_amount: total, mode });
    trackEvent('begin_checkout', { transaction_id: bookingId, value: total, currency: 'IDR', items: [{ item_id: bookingId, item_category: mode }] });
  },

  // Payment funnel.
  // payment_success di-emit bareng dgn GA4 standard 'purchase' event - Google Ads
  // recognise 'purchase' as transaction utk tROAS bidding & revenue attribution.
  paymentStarted: (bookingId: string, method: string, amount: number) =>
    trackEvent('payment_started', { booking_id: bookingId, method, amount, value: amount, currency: 'IDR' }),
  paymentSuccess: (bookingId: string, method: string, amount: number) => {
    trackEvent('payment_success', { booking_id: bookingId, method, amount });
    trackEvent('purchase', { transaction_id: bookingId, value: amount, currency: 'IDR', payment_type: method });
  },
  paymentFailed: (bookingId: string, method: string, reason?: string) => trackEvent('payment_failed', { booking_id: bookingId, method, reason: reason ?? null }),

  // Cleaner flow
  cleanerOnline: () => trackEvent('cleaner_online'),
  cleanerOffline: () => trackEvent('cleaner_offline'),
  jobAccepted: (bookingId: string) => trackEvent('job_accepted', { booking_id: bookingId }),
  jobCompleted: (bookingId: string) => trackEvent('job_completed', { booking_id: bookingId }),

  // Booking lifecycle
  bookingCompleted: (bookingId: string, rating?: number) => trackEvent('booking_completed', { booking_id: bookingId, rating: rating ?? null }),
  bookingCancelled: (bookingId: string, reason?: string) => trackEvent('booking_cancelled', { booking_id: bookingId, reason: reason ?? null }),
  rated: (bookingId: string, rating: number) => trackEvent('booking_rated', { booking_id: bookingId, rating }),

  // Engagement
  notificationTapped: (type: string) => trackEvent('notification_tapped', { type }),
  bannerTapped: (id: string) => trackEvent('banner_tapped', { banner_id: id }),
};

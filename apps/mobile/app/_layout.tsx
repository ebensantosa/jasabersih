import '../global.css';
import 'react-native-gesture-handler';
import { registerGlobals } from '@livekit/react-native';
registerGlobals();
import { showIncomingCallNotification, cancelCallNotification, subscribeNotifeeCallEvents } from '../src/lib/callNotification';

let notifee: any = null;
try { notifee = require('@notifee/react-native').default; } catch { /* native module not in APK */ }

let messaging: any = null;
try { messaging = require('@react-native-firebase/messaging').default; } catch { /* native module not in APK */ }

// Background + killed state: Firebase message handler harus di module level
// Guard: messaging null kalau APK lama belum include Firebase native module
if (messaging) {
  messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    const type = remoteMessage.data?.type as string | undefined;
    const bookingId = remoteMessage.data?.bookingId as string | undefined;
    const callerName = remoteMessage.data?.callerName as string | undefined;
    if (type === 'incoming_call' && bookingId) {
      await showIncomingCallNotification({ bookingId, callerName: callerName ?? 'Penelepon' });
    }
  });
}
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { router, Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../src/lib/api';
import { trackEvent, setUserId, Track } from '../src/lib/analytics';
import { toast } from '../src/stores/ui';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';

// Tahan native splash sampai fonts + auth siap — di-hide manual via SplashScreen.hideAsync()
SplashScreen.preventAutoHideAsync().catch(() => {});

import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { PopupRenderer } from '../src/components/PopupRenderer';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { SuspendedOverlay } from '../src/components/SuspendedOverlay';
import { CleanerLockOverlay } from '../src/components/CleanerLockOverlay';
import { SplashOverlay } from '../src/components/SplashOverlay';
import { RealtimeJobModal } from '../src/components/RealtimeJobModal';
import { ToastHost } from '../src/components/Toast';
import { UpdatePromptHost } from '../src/components/UpdatePrompt';
import { useAppContent } from '../src/stores/appContent';
import { useLocaleStore } from '../src/lib/i18n';
import { registerForPushAsync } from '../src/lib/pushSetup';
import { hydrateStorageCache, persistKeys } from '../src/lib/storage';
import { QueryProvider } from '../src/providers/QueryProvider';
import { useBookingRealtime } from '../src/hooks/useBookingRealtime';
import { useAddressesStore } from '../src/stores/addresses';
import { useAuthStore } from '../src/stores/auth';
import { useBookingsStore } from '../src/stores/bookings';
import { useCleanerStore } from '../src/stores/cleaner';
import { useCleanerWalletStore } from '../src/stores/cleanerWallet';
import { useCleaningModeStore } from '../src/stores/cleaningMode';
import { useUserStore } from '../src/stores/user';
import { useLocationStore } from '../src/stores/location';
import { useModeStore } from '../src/stores/mode';
import { useCallStore } from '../src/stores/call';
import { CallOverlay } from '../src/components/CallOverlay';
import { CallBanner } from '../src/components/CallBanner';
import { IncomingCallOverlay } from '../src/components/IncomingCallOverlay';

function BookingRealtimeMount() {
  useBookingRealtime();
  return null;
}

export default function RootLayout() {
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const refreshAuth = useAuthStore((s) => s.refresh);
  const hydrateMode = useModeStore((s) => s.hydrate);
  const hydrateCleaner = useCleanerStore((s) => s.hydrate);
  const hydrateBookings = useBookingsStore((s) => s.hydrate);
  const hydrateLocation = useLocationStore((s) => s.hydrate);
  const hydrateAddresses = useAddressesStore((s) => s.hydrate);
  const hydrateWallet = useCleanerWalletStore((s) => s.hydrate);
  const fetchAppContent = useAppContent((s) => s.fetch);
  const syncBookings = useBookingsStore((s) => s.syncFromApi);
  const syncAddresses = useAddressesStore((s) => s.syncFromApi);
  const syncWallet = useCleanerWalletStore((s) => s.syncFromApi);
  const hydrateLocale = useLocaleStore((s) => s.hydrate);
  const hydrateCleaningMode = useCleaningModeStore((s) => s.hydrate);
  const hydrateUser = useUserStore((s) => s.hydrate);
  const fetchUser = useUserStore((s) => s.fetch);
  const profile = useUserStore((s) => s.profile);

  const callActive = useCallStore(s => s.active);
  const callMinimized = useCallStore(s => s.minimized);
  const callMinimize = useCallStore(s => s.minimize);
  const callEnd = useCallStore(s => s.end);

  const [incomingCallNotif, setIncomingCallNotif] = useState<{ bookingId: string; callerName: string } | null>(null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Visible diagnostic - kalau ada error startup, tampilin di layar (bukan silent blank)
  const [startupError, setStartupError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const lastBootstrappedTokenRef = useRef<string | null>(null);

  async function syncSessionData(nextProfile?: any): Promise<void> {
    const activeMode = useModeStore.getState().mode;
    const profileMode = nextProfile?.role === 'freelancer' ? 'freelancer' : activeMode;

    if (profileMode === 'freelancer') {
      void syncBookings();
      void syncWallet();
      return;
    }

    void syncBookings();
    void syncAddresses();
  }

  function isIgnorableRuntimeError(err: any): boolean {
    const text = String(err?.message ?? err ?? '').toLowerCase();
    return (
      text.includes('failed to fetch')
      || text.includes('network request failed')
      || text.includes('network error')
      || text.includes('load failed')
      || text.includes('timeout')
      || text.includes('abort')
    );
  }

  // Hide native splash (icon) segera saat fonts ready — JS SplashOverlay cover selama auth wait
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  // Safety net: max 6 detik JS SplashOverlay supaya tidak stuck kalau API lambat/offline
  useEffect(() => {
    const t = setTimeout(() => setAuthReady(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Global error capture - catch unhandled rejection & errorUtils dari Hermes
  useEffect(() => {
    const orig = (globalThis as any).ErrorUtils?.getGlobalHandler?.();
    (globalThis as any).ErrorUtils?.setGlobalHandler?.((err: any, isFatal: boolean) => {
      if (isIgnorableRuntimeError(err)) {
        orig?.(err, false);
        return;
      }
      const msg = `${isFatal ? 'FATAL' : 'ERROR'}: ${err?.message ?? String(err)}\n${(err?.stack ?? '').slice(0, 500)}`;
      setStartupError(msg);
      orig?.(err, isFatal);
    });
    return () => { (globalThis as any).ErrorUtils?.setGlobalHandler?.(orig); };
  }, []);

  useEffect(() => {
    // Canary: confirm OTA bundle loaded + API reachable. Check /var/log/jasabersih/api-out-0.log for "[trace]"
    void api.post('/health/trace', { step: 'boot', ota: '2026-06-30-v1.5.0' }).catch(() => {});
    void hydrateStorageCache([
      'app.mode',
      'app.onboarded',
      'cleaner.profile',
      'cleaner.wallet',
      'bookings.list',
      'user.location',
      'addresses.list',
      'update.skipped',
    ]).then(() => {
      hydrateAuth();
      hydrateMode();
      hydrateCleaner();
      hydrateBookings();
      hydrateLocation();
      hydrateAddresses();
      hydrateWallet();
      hydrateLocale();
      hydrateCleaningMode();
      hydrateUser();
      // Fetch fresh app content (banners/services/config/popups) - non-blocking
      void fetchAppContent();
      // Anonymous users: ensure no stale user-bound data leaks to UI
      if (!useAuthStore.getState().tokens) {
        useAuthStore.getState().logout();
        setAuthReady(true);
        return;
      }
      setAuthReady(false);
    });
  }, [
    hydrateAuth,
    hydrateMode,
    hydrateCleaner,
    hydrateBookings,
    hydrateLocation,
    hydrateAddresses,
    hydrateWallet,
    fetchAppContent,
    syncBookings,
    syncAddresses,
    syncWallet,
    hydrateCleaningMode,
    hydrateUser,
    fetchUser,
  ]);

  // Auto re-sync when access token changes (login / refresh).
  // Prevents stale empty UI after login: addresses/bookings/wallet/user
  // are immediately refetched once tokens are available.
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  useEffect(() => {
    if (!accessToken) {
      lastBootstrappedTokenRef.current = null;
      setUserId(null);
      setAuthReady(true);
      return;
    }
    if (lastBootstrappedTokenRef.current === accessToken) return;
    lastBootstrappedTokenRef.current = accessToken;
    trackEvent('app_open');
    void (async () => {
      let refreshFailed = false;
      try {
        await refreshAuth();
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 401 || status === 403) {
          useAuthStore.getState().logout();
          setAuthReady(true);
          return;
        }
        // Network/server error — keep tokens, proceed with cached data
        refreshFailed = true;
      }
      const profile = await fetchUser();
      // Jangan logout dari fetchUser failure — user mungkin online tapi /auth/me lambat.
      // Satu-satunya alasan logout yang valid: 401/403 dari refreshAuth (sudah ditangani di atas).
      // Kalau profile null, lanjut dengan cached profile atau tanpa profile (push tetap bisa register).
      setUserId(String((profile as any)?.id ?? (profile as any)?.userId ?? ''));
      // Guard: kalau mode tersimpan 'freelancer' tapi user bukan freelancer, reset ke customer.
      // Ini mencegah customer lihat layout cleaner karena stale persisted mode.
      if (profile && useModeStore.getState().mode === 'freelancer' && !(profile as any)?.isFreelancer) {
        useModeStore.getState().setMode('customer');
      }
      await syncSessionData(profile);
      const currentMode = useModeStore.getState().mode;
      void registerForPushAsync(currentMode === 'freelancer' ? 'freelancer' : 'customer').catch(() => {});
      setAuthReady(true);
    })();
  }, [accessToken, refreshAuth, fetchUser, syncAddresses, syncBookings, syncWallet]);

  // Foreground: tampilkan in-app overlay saat app terbuka dan ada incoming call push
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      const data = notif.request.content.data as any;
      if (data?.type === 'incoming_call' && data?.bookingId && !useCallStore.getState().active) {
        setIncomingCallNotif({ bookingId: data.bookingId, callerName: data.callerName ?? 'Penelepon' });
      }
    });
    return () => sub.remove();
  }, []);

  // Notifee: handle Angkat/Tolak dari full-screen incoming call notification
  useEffect(() => {
    // Cold start: app dibuka dari tombol "Angkat" di notifee saat app killed
    notifee?.getInitialNotification().then((initial: any) => {
      if (!initial) return;
      const data = initial.notification?.data as Record<string, unknown> | undefined;
      const bookingId = data?.bookingId as string | undefined;
      if (data?.type === 'incoming_call' && bookingId && initial.pressAction?.id !== 'decline') {
        void cancelCallNotification();
        router.navigate({ pathname: '/chat/[id]', params: { id: bookingId, incomingCall: '1', autoAnswer: '1' } });
      }
    }).catch(() => {});

    // Foreground: Angkat/Tolak saat app terbuka
    const unsub = subscribeNotifeeCallEvents(
      (bookingId) => router.navigate({ pathname: '/chat/[id]', params: { id: bookingId, incomingCall: '1', autoAnswer: '1' } }),
      () => { /* tolak — tidak perlu navigasi */ },
    );
    return () => unsub();
  }, []);

  // Notification tap → deep link
  useEffect(() => {
    function handleNotifData(data: Record<string, unknown> | undefined) {
      const type = data?.type as string | undefined;
      const bookingId = data?.bookingId as string | undefined;
      const ctaLink = data?.ctaLink as string | undefined;
      const isCleaner = useModeStore.getState().mode === 'freelancer';

      if (type) Track.notificationTapped(type);
      if (!type) return;

      // Incoming call → buka chat dengan banner "Angkat / Tolak"
      if (type === 'incoming_call' && bookingId) {
        router.navigate({ pathname: '/chat/[id]', params: { id: bookingId, incomingCall: '1', autoAnswer: '1' } });
        return;
      }

      // Chat → langsung ke chat booking
      if (type === 'chat' && bookingId) {
        router.navigate({ pathname: '/chat/[id]', params: { id: bookingId } });
        return;
      }

      // Semua notif yang butuh buka detail booking
      const BOOKING_DETAIL_TYPES = new Set([
        'booking_matched', 'booking_searching', 'booking_created_by_admin',
        'booking_canceled', 'booking_canceled_admin', 'booking_completed',
        'booking_status_change', 'booking_no_show', 'search_timeout',
        'payment_confirmed', 'payment_paid', 'payment_completed', 'payment_underpaid',
        'hourly_timer_expired', 'auto_completed', 'overtime_paid',
        'upcharge_requested', 'upcharge_approved', 'upcharge_rejected',
        'extension_requested', 'extension_accepted', 'extension_declined',
        'helper_invited', 'helper_accepted', 'helper_declined',
        'reclean_requested', 'reclean_accepted', 'reclean_rejected',
        'rating_reminder', 'cleaner_reminder', 'customer_reminder',
        'job_assigned', 'wallet_credit',
      ]);
      if (BOOKING_DETAIL_TYPES.has(type) && bookingId) {
        router.navigate({ pathname: '/booking/[id]', params: { id: bookingId } });
        return;
      }

      // Job baru masuk (cleaner) → jobs tab
      if (type === 'incoming_job' || type === 'incoming_job_v2') {
        router.navigate('/(tabs)/');
        return;
      }

      // Wallet & withdrawal
      const WALLET_TYPES = new Set([
        'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_completed',
        'withdrawal_failed', 'withdrawal_pending_maintenance',
        'rating_received', 'earnings_cleared',
      ]);
      if (WALLET_TYPES.has(type)) {
        router.navigate(isCleaner ? '/cleaner/wallet' : '/account/wallet');
        return;
      }

      // KYC
      if (type === 'kyc_approved' || type === 'kyc_rejected') {
        router.navigate('/cleaner/kyc');
        return;
      }

      // Dispute resolved → notif list (dispute screen belum ada, tapi info ada di notif)
      if (type === 'dispute_resolved' || type === 'fraud_report_approved') {
        router.navigate('/notifications');
        return;
      }

      // Broadcast dengan CTA link → buka link atau notif list
      if (type === 'broadcast') {
        if (ctaLink) {
          Linking.openURL(ctaLink).catch(() => router.navigate('/notifications'));
        } else {
          router.navigate('/notifications');
        }
        return;
      }

      // Fallback: buka notif list
      router.navigate('/notifications');
    }

    // Cold-start: app was killed, user tapped notification
    Notifications.getLastNotificationResponseAsync().then((res) => {
      if (res) handleNotifData(res.notification.request.content.data as Record<string, unknown> | undefined);
    }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      handleNotifData(res.notification.request.content.data as Record<string, unknown> | undefined);
    });
    return () => sub.remove();
  }, []);

  // Kalau ada error startup, render visible fallback - jangan blank
  if (startupError) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#FEF2F2' }}>
        <View style={{ flex: 1, padding: 24, paddingTop: 80, justifyContent: 'flex-start' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#B91C1C', marginBottom: 8 }}>
            ⚠ Aplikasi gagal startup
          </Text>
          <Text style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 16 }}>
            Screenshot pesan di bawah & kirim ke admin developer:
          </Text>
          <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8 }}>
            <Text style={{ fontSize: 11, color: '#1F2937', fontFamily: 'monospace' }}>
              {startupError}
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>
    );
  }

  // Native splash masih tampil saat fonts belum siap — render null agar Stack tidak crash
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryProvider>
            <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F8FAFC' } }}>
        <Stack.Screen name="(tabs)" />
        {/* Auth full-screen (bukan modal). Modal presentation di web bikin
            content ke-tengah dgn white margin kiri/kanan. Slide animation
            tetap dapat dari default Stack transition. */}
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="services/[code]" />
        <Stack.Screen name="booking/new" />
        <Stack.Screen name="booking/hourly" />
        <Stack.Screen name="booking/wa-survey" />
        <Stack.Screen name="booking/[id]" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="account/addresses" />
        <Stack.Screen name="account/edit-profile" />
        <Stack.Screen name="account/wallet" />
        <Stack.Screen name="account/withdraw" />
        <Stack.Screen name="account/bank-accounts" />
        <Stack.Screen name="account/notifications" />
        <Stack.Screen name="account/security" />
        <Stack.Screen name="account/change-password" />
        <Stack.Screen name="account/help" />
        <Stack.Screen name="account/settings" />
        <Stack.Screen name="account/referral" />
        <Stack.Screen name="account/vouchers" />
        <Stack.Screen name="account/language" />
        <Stack.Screen name="account/about" />
        <Stack.Screen name="account/terms" />
        <Stack.Screen name="account/privacy" />
        <Stack.Screen name="account/faq" />
        <Stack.Screen name="cleaner/areas" />
        <Stack.Screen name="cleaner/wallet" />
        <Stack.Screen name="cleaner/withdraw" />
        <Stack.Screen name="cleaner/kyc" />
        <Stack.Screen name="cleaner/profile" />
        <Stack.Screen name="cleaner/public/[id]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="suspended" options={{ gestureEnabled: false }} />
        <Stack.Screen name="payment/[bookingId]" />
        <Stack.Screen name="addresses/edit" />
      </Stack>
        <ToastHost />
        <OfflineBanner />
        <UpdatePromptHost />
        <RealtimeJobModal />
        {authReady && profile ? <PopupRenderer event="app_open" /> : null}
        <SuspendedOverlay />
        <CleanerLockOverlay />
        <SplashOverlay visible={!authReady} />
        <BookingRealtimeMount />
        {callActive && (
          <CallOverlay
            token={callActive.token}
            serverUrl={callActive.serverUrl}
            callerLabel={callActive.callerLabel}
            maxDurationSec={callActive.maxDurationSec}
            startMuted={callActive.startMuted}
            minimized={callMinimized}
            onMinimize={callMinimize}
            onEnd={async (reason, info) => {
              const sessionId = callActive.sessionId;
              const bookingId = callActive.bookingId;
              callEnd();
              if (reason === 'error') {
                const detail = info?.errorMsg ? `\n${info.errorMsg}` : '';
                toast.error(`Gagal terhubung ke panggilan.${detail || ' Cek koneksi atau coba lagi.'}`);
              }
              if (bookingId) {
                void api.post('/call/end', {
                  bookingId,
                  sessionId: sessionId ?? undefined,
                  endReason: reason ?? 'hangup',
                  durationSec: info?.durationSec ?? 0,
                  answered: info?.answered ?? false,
                }).catch(() => {});
              }
            }}
          />
        )}
        <CallBanner />
        {incomingCallNotif && !callActive && (
          <IncomingCallOverlay
            callerName={incomingCallNotif.callerName}
            onAnswer={() => {
              const { bookingId } = incomingCallNotif;
              setIncomingCallNotif(null);
              router.navigate({ pathname: '/chat/[id]', params: { id: bookingId, incomingCall: '1', autoAnswer: '1' } });
            }}
            onDecline={() => setIncomingCallNotif(null)}
          />
        )}
          </QueryProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

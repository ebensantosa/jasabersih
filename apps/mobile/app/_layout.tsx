import '../global.css';
import 'react-native-gesture-handler';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { trackEvent, setUserId, Track } from '../src/lib/analytics';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { IncomingJobModal } from '../src/components/IncomingJobModal';
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
import { useAddressesStore } from '../src/stores/addresses';
import { useAuthStore } from '../src/stores/auth';
import { useBookingsStore } from '../src/stores/bookings';
import { useCleanerStore } from '../src/stores/cleaner';
import { useCleanerWalletStore } from '../src/stores/cleanerWallet';
import { useCleaningModeStore } from '../src/stores/cleaningMode';
import { useUserStore } from '../src/stores/user';
import { useLocationStore } from '../src/stores/location';
import { useModeStore } from '../src/stores/mode';

export default function RootLayout() {
  const hydrateAuth = useAuthStore((s) => s.hydrate);
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

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Tahan SplashOverlay sebentar biar transisi smooth (no flash).
  const [splashHold, setSplashHold] = useState(true);
  // Visible diagnostic - kalau ada error startup, tampilin di layar (bukan silent blank)
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSplashHold(false), 800);
    return () => clearTimeout(t);
  }, []);

  // Global error capture - catch unhandled rejection & errorUtils dari Hermes
  useEffect(() => {
    const orig = (globalThis as any).ErrorUtils?.getGlobalHandler?.();
    (globalThis as any).ErrorUtils?.setGlobalHandler?.((err: any, isFatal: boolean) => {
      const msg = `${isFatal ? 'FATAL' : 'ERROR'}: ${err?.message ?? String(err)}\n${(err?.stack ?? '').slice(0, 500)}`;
      setStartupError(msg);
      orig?.(err, isFatal);
    });
    return () => { (globalThis as any).ErrorUtils?.setGlobalHandler?.(orig); };
  }, []);

  useEffect(() => {
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
      }
      // Validate token via /auth/me first; only fire other syncs if profile fetch succeeds
      setTimeout(() => {
        if (!useAuthStore.getState().tokens) return;
        void fetchUser().then((profile) => {
          if (!profile) {
            // /auth/me failed - token bogus (orphan from old fake-register flow).
            // Force logout so user gets a clean state instead of seeing "Pengguna" forever.
            useAuthStore.getState().logout();
            return;
          }
          void syncBookings();
          void syncAddresses();
          void syncWallet();
          void registerForPushAsync().catch(() => {});
        });
      }, 500);
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
    if (!accessToken) { setUserId(null); return; }
    trackEvent('app_open');
    void fetchUser().then((profile) => {
      if (!profile) return;
      setUserId(String((profile as any).id ?? (profile as any).userId ?? ''));
      void syncAddresses();
      void syncBookings();
      void syncWallet();
      void registerForPushAsync().catch(() => {});
    });
  }, [accessToken, fetchUser, syncAddresses, syncBookings, syncWallet]);

  // Notification tap → deep link
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as Record<string, unknown> | undefined;
      const type = data?.type as string | undefined;
      const bookingId = data?.bookingId as string | undefined;
      if (type) Track.notificationTapped(type);
      if (type === 'chat' && bookingId) router.push({ pathname: '/chat/[id]', params: { id: bookingId } });
      else if ((type === 'booking_completed' || type === 'wallet_credit') && bookingId) router.push({ pathname: '/booking/[id]', params: { id: bookingId } });
    });
    return () => sub.remove();
  }, []);

  const splashVisible = !fontsLoaded || splashHold;

  // Saat fonts belum siap, render minimal tree (cuma SplashOverlay) - Stack belum
  // boleh render karena akan crash kalau ada navigation call sebelum siap.
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

  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryProvider>
              <SplashOverlay visible />
            </QueryProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

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
        <Stack.Screen name="booking/preview-hourly" />
        <Stack.Screen name="booking/wa-survey" />
        <Stack.Screen name="booking/[id]" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="account/addresses" />
        <Stack.Screen name="account/edit-profile" />
        <Stack.Screen name="account/wallet" />
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
        <IncomingJobModal />
        <RealtimeJobModal />
        <PopupRenderer event="app_open" />
        <SuspendedOverlay />
        <CleanerLockOverlay />
        <SplashOverlay visible={splashVisible} />
          </QueryProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import '../global.css';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { IncomingJobModal } from '../src/components/IncomingJobModal';
import { PopupRenderer } from '../src/components/PopupRenderer';
import { ToastHost } from '../src/components/Toast';
import { UpdatePromptHost } from '../src/components/UpdatePrompt';
import { useAppContent } from '../src/stores/appContent';
import { hydrateStorageCache, persistKeys } from '../src/lib/storage';
import { QueryProvider } from '../src/providers/QueryProvider';
import { useAddressesStore } from '../src/stores/addresses';
import { useAuthStore } from '../src/stores/auth';
import { useBookingsStore } from '../src/stores/bookings';
import { useCleanerStore } from '../src/stores/cleaner';
import { useCleanerWalletStore } from '../src/stores/cleanerWallet';
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

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

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
      // Fetch fresh app content (banners/services/config/popups) — non-blocking
      void fetchAppContent();
      // Sync bookings + addresses + wallet from server kalau sudah login
      setTimeout(() => {
        void syncBookings();
        void syncAddresses();
        void syncWallet();
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
  ]);

  if (!fontsLoaded) {
    return <View className="flex-1 bg-white" />;
  }

  return (
    <ErrorBoundary>
      <QueryProvider>
        <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F8FAFC' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
        <Stack.Screen name="services/[code]" />
        <Stack.Screen name="booking/new" />
        <Stack.Screen name="booking/hourly" />
        <Stack.Screen name="booking/wa-survey" />
        <Stack.Screen name="booking/[id]" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="account/addresses" />
        <Stack.Screen name="account/wallet" />
        <Stack.Screen name="account/notifications" />
        <Stack.Screen name="account/security" />
        <Stack.Screen name="account/help" />
        <Stack.Screen name="account/settings" />
        <Stack.Screen name="cleaner/areas" />
        <Stack.Screen name="cleaner/wallet" />
        <Stack.Screen name="cleaner/withdraw" />
        <Stack.Screen name="cleaner/kyc" />
        <Stack.Screen name="addresses/edit" />
      </Stack>
        <ToastHost />
        <UpdatePromptHost />
        <IncomingJobModal />
        <PopupRenderer event="app_open" />
      </QueryProvider>
    </ErrorBoundary>
  );
}

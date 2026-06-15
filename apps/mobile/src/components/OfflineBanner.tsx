import { WifiOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Banner global: nampil di atas screen kalau device offline. Dipasang di
// root layout, sekali pasang utk seluruh app. Listener netinfo cuma 1 instance.
// NetInfo gak fully support web -> pakai navigator.onLine di web,
// dynamic-import NetInfo cuma di native.
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Browser API: window online/offline events.
      const update = () => setOnline(typeof navigator !== 'undefined' ? navigator.onLine !== false : true);
      update();
      if (typeof window !== 'undefined') {
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
          window.removeEventListener('online', update);
          window.removeEventListener('offline', update);
        };
      }
      return;
    }
    // Native: dynamic import + guard error.
    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@react-native-community/netinfo');
        if (cancelled) return;
        unsub = mod.default.addEventListener((state) => {
          setOnline(state.isConnected !== false && state.isInternetReachable !== false);
        });
      } catch { /* netinfo gagal init - default online=true */ }
    })();
    return () => {
      cancelled = true;
      try { unsub?.(); } catch { /* noop */ }
    };
  }, []);

  if (online) return null;

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#B91C1C', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9998, elevation: 12 }}>
      <View className="flex-row items-center justify-center gap-2 px-4 py-2">
        <WifiOff color="white" size={14} strokeWidth={2.4} />
        <Text className="font-bold text-[12px] text-white">Tidak ada koneksi internet</Text>
      </View>
    </SafeAreaView>
  );
}

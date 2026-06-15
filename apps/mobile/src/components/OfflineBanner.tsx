import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Banner global: nampil di atas screen kalau device offline. Dipasang di
// root layout, sekali pasang utk seluruh app. Listener netinfo cuma 1 instance.
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return unsub;
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

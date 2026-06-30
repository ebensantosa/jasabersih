import { router } from 'expo-router';
import { Phone } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallStore } from '../stores/call';

export function CallBanner() {
  const active = useCallStore(s => s.active);
  const minimized = useCallStore(s => s.minimized);
  const maximize = useCallStore(s => s.maximize);
  const { top } = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || !minimized) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [active, minimized]);

  if (!active || !minimized) return null;

  function fmt(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  return (
    <Pressable
      onPress={() => { maximize(); router.navigate({ pathname: '/chat/[id]', params: { id: active.bookingId } }); }}
      style={{
        position: 'absolute', top, left: 0, right: 0, zIndex: 998,
        backgroundColor: '#16A34A', flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10, gap: 8,
      }}
    >
      <Phone color="white" size={14} strokeWidth={2.4} />
      <Text style={{ color: 'white', fontSize: 13, fontWeight: '600', flex: 1 }}>
        Sedang dalam panggilan · {fmt(elapsed)}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>Ketuk untuk kembali →</Text>
    </Pressable>
  );
}

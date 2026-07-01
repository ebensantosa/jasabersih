import { Audio } from 'expo-av';
import { Phone, PhoneOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { prepareAudiblePlayback } from '../lib/sound';

const RING_TIMEOUT_SEC = 25;

type Props = {
  callerName: string;
  onAnswer: () => void;
  onDecline: () => void;
};

export function IncomingCallOverlay({ callerName, onAnswer, onDecline }: Props) {
  const { top } = useSafeAreaInsets();
  const [countdown, setCountdown] = useState(RING_TIMEOUT_SEC);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Ringtone
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await prepareAudiblePlayback();
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/call_incoming.wav'),
          { shouldPlay: true, isLooping: true, volume: 1.0 },
        );
        if (cancelled) { void sound.unloadAsync(); return; }
        soundRef.current = sound;
      } catch { /* non-fatal */ }
    })();
    return () => {
      cancelled = true;
      soundRef.current?.stopAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  // Auto-decline setelah timeout
  useEffect(() => {
    if (countdown <= 0) { onDecline(); return; }
    const t = setInterval(() => setCountdown(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  function stopRing() {
    soundRef.current?.stopAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
  }

  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.75)',
      justifyContent: 'flex-start', paddingTop: top + 12,
    }}>
      <View style={{
        marginHorizontal: 16, backgroundColor: '#0F172A',
        borderRadius: 20, padding: 24, alignItems: 'center', gap: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5, shadowRadius: 16, elevation: 20,
      }}>
        {/* Avatar */}
        <View style={{
          width: 80, height: 80, borderRadius: 40, backgroundColor: '#1D4ED8',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: 'white', fontSize: 30, fontWeight: '700' }}>
            {callerName[0]?.toUpperCase()}
          </Text>
        </View>

        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ color: '#94A3B8', fontSize: 12 }}>Panggilan masuk</Text>
          <Text style={{ color: 'white', fontSize: 20, fontWeight: '700' }}>{callerName}</Text>
          <Text style={{ color: '#475569', fontSize: 11 }}>Otomatis tolak dalam {countdown}s</Text>
        </View>

        {/* Tombol */}
        <View style={{ flexDirection: 'row', gap: 32, marginTop: 8 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => { stopRing(); onDecline(); }}
              style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <PhoneOff color="white" size={26} strokeWidth={2.2} />
            </Pressable>
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>Tolak</Text>
          </View>

          <View style={{ alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => { stopRing(); onAnswer(); }}
              style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Phone color="white" size={26} strokeWidth={2.2} />
            </Pressable>
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>Angkat</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

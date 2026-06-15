import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Sparkles, Users } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

const STATUS_MESSAGES = [
  { min: 0,  text: 'Mencari cleaner terdekat dari lokasimu…' },
  { min: 1,  text: 'Mengirim notifikasi ke cleaner aktif di area kamu…' },
  { min: 3,  text: 'Cleaner butuh waktu untuk respons. Mohon tunggu sebentar.' },
  { min: 7,  text: 'Sedang ekspand pencarian ke area sekitar…' },
  { min: 12, text: 'Hampir batas waktu. Kalau gak match, tim CS akan ambil alih.' },
];

type Props = {
  elapsedSec: number;
  timeoutSec?: number;
  broadcastedTo?: number;
};

/**
 * Performance-optimized "finding cleaner" view:
 * - 2 pulse rings (was 3) - visually still good, half the work
 * - useNativeDriver: true - animasi jalan di UI thread, gak block JS thread
 * - Auto-pause kalau screen unfocused (lewat useFocusEffect)
 * - Slow rotate (8s loop) - barely consumes CPU
 */
export function SearchingCleanerView({ elapsedSec, timeoutSec = 15 * 60, broadcastedTo }: Props) {
  const remainingSec = Math.max(0, timeoutSec - elapsedSec);
  const minLeft = Math.floor(remainingSec / 60);
  const secLeft = remainingSec % 60;
  const elapsedMin = Math.floor(elapsedSec / 60);
  const progressPct = Math.min(100, (elapsedSec / timeoutSec) * 100);
  const statusMsg = [...STATUS_MESSAGES].reverse().find((s) => elapsedMin >= s.min)?.text ?? STATUS_MESSAGES[0].text;

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const animsRef = useRef<Animated.CompositeAnimation[]>([]);

  // Auto-pause animasi saat screen unfocus (gak buang battery di background)
  useFocusEffect(
    useCallback(() => {
      function makePulse(val: Animated.Value, delay: number) {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(val, { toValue: 1, duration: 2800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        );
      }
      const a1 = makePulse(pulse1, 0);
      const a2 = makePulse(pulse2, 1400);
      const r = Animated.loop(
        Animated.timing(rotate, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true }),
      );
      animsRef.current = [a1, a2, r];
      a1.start(); a2.start(); r.start();
      return () => {
        animsRef.current.forEach((a) => a.stop());
        pulse1.setValue(0); pulse2.setValue(0); rotate.setValue(0);
      };
    }, [pulse1, pulse2, rotate]),
  );

  function ringStyle(val: Animated.Value) {
    return {
      position: 'absolute' as const,
      left: 0, top: 0, right: 0, bottom: 0,
      borderRadius: 50,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.5)',
      opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
      transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
    };
  }
  const rotateInterpolate = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View className="overflow-hidden rounded-2xl">
      <LinearGradient colors={['#1E3A8A', '#047857', '#0E7490']} style={{ paddingVertical: 28, paddingHorizontal: 16 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center', height: 140, marginBottom: 12 }}>
          <View style={{ position: 'relative', height: 100, width: 100, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={ringStyle(pulse1)} />
            <Animated.View style={ringStyle(pulse2)} />
            <View style={{ height: 80, width: 80, borderRadius: 40, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', elevation: 6 }}>
              <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
                <Search color="#1D4ED8" size={36} strokeWidth={2.2} />
              </Animated.View>
            </View>
          </View>
        </View>

        <Text style={{ color: 'white', textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 16 }}>
          Mencari Cleaner
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6, lineHeight: 18, paddingHorizontal: 8 }}>
          {statusMsg}
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, alignItems: 'center' }}>
            <Users color="white" size={16} strokeWidth={2.2} />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 4, textTransform: 'uppercase' }}>
              Cleaner dihubungi
            </Text>
            <Text style={{ color: 'white', fontSize: 18, fontFamily: 'Inter_800ExtraBold', marginTop: 2 }}>
              {broadcastedTo ?? '…'}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, alignItems: 'center' }}>
            <Sparkles color="white" size={16} strokeWidth={2.2} />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 4, textTransform: 'uppercase' }}>
              Sudah berlalu
            </Text>
            <Text style={{ color: 'white', fontSize: 18, fontFamily: 'Inter_800ExtraBold', marginTop: 2 }}>
              {elapsedMin}m {elapsedSec % 60}s
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 3 }} />
          </View>
          <Text style={{ marginTop: 6, textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'Inter_500Medium' }}>
            Sisa {minLeft}:{String(secLeft).padStart(2, '0')} sebelum tim CS ambil alih
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BellRing, MapPin, Search, Sparkles, Users } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

const STATUS_MESSAGES: { min: number; text: string }[] = [
  { min: 0, text: 'Mencari cleaner terdekat dari lokasi kamu.' },
  { min: 1, text: 'Mengirim notifikasi ke cleaner aktif di area kamu.' },
  { min: 3, text: 'Cleaner butuh waktu untuk respons. Mohon tunggu sebentar.' },
  { min: 7, text: 'Pencarian diperluas ke area sekitar.' },
  { min: 12, text: 'Hampir batas waktu. Jika belum cocok, customer service akan membantu manual.' },
];

type Props = {
  elapsedSec: number;
  timeoutSec?: number;
  broadcastedTo?: number;
};

export function SearchingCleanerView({ elapsedSec, timeoutSec = 15 * 60, broadcastedTo }: Props) {
  const safeElapsed = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;
  const safeTimeout = Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec : 15 * 60;
  const remainingSec = Math.max(0, safeTimeout - safeElapsed);
  const reachedManualAssist = remainingSec === 0;
  const minLeft = Math.floor(remainingSec / 60);
  const secLeft = remainingSec % 60;
  const elapsedMin = Math.floor(safeElapsed / 60);
  const progressPct = Math.max(0, Math.min(100, (safeElapsed / safeTimeout) * 100));
  const statusMsg = reachedManualAssist
    ? 'Customer service sedang membantu mencarikan cleaner secara manual. Kamu tidak perlu mengulang pesanan.'
    : ([...STATUS_MESSAGES].reverse().find((s) => elapsedMin >= s.min)?.text ?? 'Mencari cleaner terdekat dari lokasi kamu.');

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const dotWave = useRef(new Animated.Value(0)).current;
  const animsRef = useRef<Animated.CompositeAnimation[]>([]);

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
      const d = Animated.loop(
        Animated.sequence([
          Animated.timing(dotWave, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dotWave, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      animsRef.current = [a1, a2, r, d];
      a1.start();
      a2.start();
      r.start();
      d.start();
      return () => {
        animsRef.current.forEach((a) => a.stop());
        pulse1.setValue(0);
        pulse2.setValue(0);
        rotate.setValue(0);
        dotWave.setValue(0);
      };
    }, [dotWave, pulse1, pulse2, rotate]),
  );

  function ringStyle(val: Animated.Value) {
    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      borderRadius: 50,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.5)',
      opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
      transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
    };
  }

  const rotateInterpolate = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const dotOpacity = (index: number) =>
    dotWave.interpolate({
      inputRange: [0, 0.33, 0.66, 1],
      outputRange:
        index === 0 ? [0.35, 1, 0.45, 0.35]
          : index === 1 ? [0.45, 0.35, 1, 0.45]
            : [1, 0.45, 0.35, 1],
    });

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
          {reachedManualAssist ? 'Pencarian Manual Berjalan' : 'Mencari Cleaner'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6, lineHeight: 18, paddingHorizontal: 8 }}>
          {statusMsg}
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {[0, 1, 2].map((index) => (
            <Animated.View
              key={index}
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: 'white',
                opacity: dotOpacity(index),
                transform: [{
                  scale: dotWave.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: index === 1 ? [0.95, 1.2, 0.95] : [0.9, 1.05, 0.9],
                  }),
                }],
              }}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin color="white" size={14} strokeWidth={2.2} />
              <Text style={{ color: 'white', fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                Area terdekat
              </Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6, lineHeight: 14 }}>
              Sistem sedang mencari cleaner aktif di sekitar alamat kamu secara realtime.
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <BellRing color="white" size={14} strokeWidth={2.2} />
              <Text style={{ color: 'white', fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                Notifikasi dikirim
              </Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6, lineHeight: 14 }}>
              {reachedManualAssist
                ? 'Jika belum ada yang ambil, customer service melanjutkan follow up manual ke cleaner yang sesuai.'
                : 'Cleaner yang cocok akan menerima notifikasi dan bisa ambil pesanan ini.'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, alignItems: 'center' }}>
            <Users color="white" size={16} strokeWidth={2.2} />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 4, textTransform: 'uppercase' }}>
              Cleaner dihubungi
            </Text>
            <Text style={{ color: 'white', fontSize: 18, fontFamily: 'Inter_800ExtraBold', marginTop: 2 }}>
              {broadcastedTo ?? '...'}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, alignItems: 'center' }}>
            <Sparkles color="white" size={16} strokeWidth={2.2} />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 4, textTransform: 'uppercase' }}>
              Sudah berlalu
            </Text>
            <Text style={{ color: 'white', fontSize: 18, fontFamily: 'Inter_800ExtraBold', marginTop: 2 }}>
              {elapsedMin}m {safeElapsed % 60}s
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 3 }} />
          </View>
          <Text style={{ marginTop: 6, textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'Inter_500Medium' }}>
            {reachedManualAssist
              ? 'Customer service sedang melanjutkan pencarian manual'
              : `Sisa ${minLeft}:${String(secLeft).padStart(2, '0')} sebelum customer service mengambil alih`}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BellRing, MapPin, Search, Users } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  /** Optional CTA tombol di bawah - bisa dipake render 'Kembali ke beranda' */
  footerCta?: { label: string; onPress: () => void; helper?: string };
};

export function SearchingCleanerView({ elapsedSec, timeoutSec = 15 * 60, broadcastedTo, footerCta }: Props) {
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
  const pulse3 = useRef(new Animated.Value(0)).current;
  const dotWave = useRef(new Animated.Value(0)).current;
  const animsRef = useRef<Animated.CompositeAnimation[]>([]);

  useFocusEffect(
    useCallback(() => {
      function makePulse(val: Animated.Value, delay: number) {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(val, { toValue: 1, duration: 3000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        );
      }
      const a1 = makePulse(pulse1, 0);
      const a2 = makePulse(pulse2, 1000);
      const a3 = makePulse(pulse3, 2000);
      const d = Animated.loop(
        Animated.sequence([
          Animated.timing(dotWave, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dotWave, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      animsRef.current = [a1, a2, a3, d];
      a1.start();
      a2.start();
      a3.start();
      d.start();
      return () => {
        animsRef.current.forEach((a) => a.stop());
        pulse1.setValue(0);
        pulse2.setValue(0);
        pulse3.setValue(0);
        dotWave.setValue(0);
      };
    }, [dotWave, pulse1, pulse2, pulse3]),
  );

  function ringStyle(val: Animated.Value, baseSize: number) {
    return {
      position: 'absolute' as const,
      width: baseSize,
      height: baseSize,
      borderRadius: baseSize / 2,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.4)',
      opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
      transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
    };
  }

  const dotOpacity = (index: number) =>
    dotWave.interpolate({
      inputRange: [0, 0.33, 0.66, 1],
      outputRange:
        index === 0 ? [0.35, 1, 0.45, 0.35]
          : index === 1 ? [0.45, 0.35, 1, 0.45]
            : [1, 0.45, 0.35, 1],
    });

  return (
    <LinearGradient
      colors={['#1E3A8A', '#047857', '#0E7490']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' }}>
          {/* Header label */}
          <View style={{ alignItems: 'center', paddingTop: 16 }}>
            <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
              {[0, 1, 2].map((index) => (
                <Animated.View
                  key={index}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: 'white',
                    opacity: dotOpacity(index),
                  }}
                />
              ))}
              <Text style={{ marginLeft: 6, color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter_700Bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                {reachedManualAssist ? 'Customer Service Mengambil Alih' : 'Pencarian Aktif'}
              </Text>
            </View>
          </View>

          {/* Hero - sentral animasi */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'relative', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={ringStyle(pulse1, 240)} />
              <Animated.View style={ringStyle(pulse2, 240)} />
              <Animated.View style={ringStyle(pulse3, 240)} />
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.25,
                  shadowRadius: 24,
                  elevation: 10,
                }}
              >
                <Search color="#1E3A8A" size={48} strokeWidth={2.2} />
              </View>
            </View>

            <Text style={{ marginTop: 32, color: 'white', textAlign: 'center', fontFamily: 'Inter_800ExtraBold', fontSize: 26, letterSpacing: -0.3 }}>
              {reachedManualAssist ? 'Pencarian Manual\nBerjalan' : 'Mencari Cleaner\nUntuk Kamu'}
            </Text>
            <Text style={{ marginTop: 12, color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, paddingHorizontal: 20 }}>
              {statusMsg}
            </Text>
          </View>

          {/* Footer - info & stats */}
          <View>
            {/* Info cards */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin color="white" size={14} strokeWidth={2.4} />
                  <Text style={{ color: 'white', fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                    Area Terdekat
                  </Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6, lineHeight: 14 }}>
                  Sistem cari cleaner aktif di sekitar alamat kamu realtime.
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <BellRing color="white" size={14} strokeWidth={2.4} />
                  <Text style={{ color: 'white', fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                    Notifikasi Terkirim
                  </Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6, lineHeight: 14 }}>
                  {reachedManualAssist
                    ? 'CS lanjut follow up manual ke cleaner yang sesuai.'
                    : 'Cleaner yang cocok akan terima notif & ambil pesanan ini.'}
                </Text>
              </View>
            </View>

            {/* Stats */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14, alignItems: 'center' }}>
                <Users color="white" size={18} strokeWidth={2.4} />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontFamily: 'Inter_700Bold', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Cleaner Dihubungi
                </Text>
                <Text style={{ color: 'white', fontSize: 24, fontFamily: 'Inter_800ExtraBold', marginTop: 4 }}>
                  {broadcastedTo ?? '—'}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14, alignItems: 'center' }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 2, height: 6, backgroundColor: 'white', borderRadius: 1 }} />
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontFamily: 'Inter_700Bold', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Sudah Berlalu
                </Text>
                <Text style={{ color: 'white', fontSize: 24, fontFamily: 'Inter_800ExtraBold', marginTop: 4 }}>
                  {elapsedMin}m {String(safeElapsed % 60).padStart(2, '0')}s
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 3 }} />
            </View>
            <Text style={{ marginTop: 8, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'Inter_500Medium' }}>
              {reachedManualAssist
                ? 'Customer service melanjutkan pencarian manual'
                : `Sisa ${minLeft}:${String(secLeft).padStart(2, '0')} sebelum CS mengambil alih`}
            </Text>

            {/* Footer CTA - inline (bukan absolute overlay) supaya layout di atasnya kompensasi space */}
            {footerCta && (
              <View style={{ marginTop: 18 }}>
                <Pressable
                  onPress={footerCta.onPress}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.35)',
                  }}
                >
                  <Text style={{ color: 'white', fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                    {footerCta.label}
                  </Text>
                </Pressable>
                {footerCta.helper && (
                  <Text style={{ marginTop: 6, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'Inter_400Regular' }}>
                    {footerCta.helper}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

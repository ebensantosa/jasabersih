import { LinearGradient } from 'expo-linear-gradient';
import { Search, Sparkles, Users } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

const STATUS_MESSAGES = [
  { min: 0,  text: 'Mencari cleaner terdekat dari lokasimu…' },
  { min: 1,  text: 'Mengirim notifikasi ke cleaner aktif di area kamu…' },
  { min: 3,  text: 'Cleaner butuh waktu untuk respons. Mohon tunggu sebentar.' },
  { min: 7,  text: 'Sedang ekspand pencarian ke area sekitar…' },
  { min: 12, text: 'Hampir batas waktu. Kalau gak match, tim CS akan ambil alih.' },
];

type Props = {
  /** Total elapsed seconds since booking created */
  elapsedSec: number;
  /** Total countdown limit (default 15 min) */
  timeoutSec?: number;
  /** Optional: live count of cleaners notified (from backend) */
  broadcastedTo?: number;
};

/**
 * Gojek-style "finding driver" view dengan radar pulse animation,
 * rotating status messages, dan smart countdown.
 */
export function SearchingCleanerView({ elapsedSec, timeoutSec = 15 * 60, broadcastedTo }: Props) {
  const remainingSec = Math.max(0, timeoutSec - elapsedSec);
  const minLeft = Math.floor(remainingSec / 60);
  const secLeft = remainingSec % 60;
  const elapsedMin = Math.floor(elapsedSec / 60);
  const progressPct = Math.min(100, (elapsedSec / timeoutSec) * 100);

  // Pick status message berdasar elapsed minutes
  const statusMsg = [...STATUS_MESSAGES].reverse().find((s) => elapsedMin >= s.min)?.text ?? STATUS_MESSAGES[0].text;

  // Pulse rings animation
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    function makePulse(val: Animated.Value, delay: number) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: false }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: false }),
        ]),
      );
    }
    const a1 = makePulse(pulse1, 0);
    const a2 = makePulse(pulse2, 800);
    const a3 = makePulse(pulse3, 1600);
    const r = Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: false }),
    );
    a1.start(); a2.start(); a3.start(); r.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); r.stop(); };
  }, [pulse1, pulse2, pulse3, rotate]);

  function ringStyle(val: Animated.Value) {
    return {
      position: 'absolute' as const,
      left: 0, top: 0, right: 0, bottom: 0,
      borderRadius: 9999,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.6)',
      opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
      transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
    };
  }
  const rotateInterpolate = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View className="overflow-hidden rounded-2xl">
      <LinearGradient colors={['#1E40AF', '#3B82F6']} style={{ paddingVertical: 28, paddingHorizontal: 16 }}>
        {/* Pulse rings + center avatar */}
        <View style={{ alignItems: 'center', justifyContent: 'center', height: 160, marginBottom: 16 }}>
          <View style={{ position: 'relative', height: 100, width: 100, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={ringStyle(pulse1)} />
            <Animated.View style={ringStyle(pulse2)} />
            <Animated.View style={ringStyle(pulse3)} />
            <View style={{ height: 80, width: 80, borderRadius: 40, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', elevation: 6 }}>
              <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
                <Search color="#1D4ED8" size={36} strokeWidth={2.2} />
              </Animated.View>
            </View>
          </View>
        </View>

        {/* Status message */}
        <Text style={{ color: 'white', textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 16 }}>
          Mencari Cleaner
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6, lineHeight: 18, paddingHorizontal: 8 }}>
          {statusMsg}
        </Text>

        {/* Stats row */}
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

        {/* Countdown bar */}
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

/** Fallback view when search times out (15 min). CS take over via WA. */
export function SearchTimeoutView({ onCancel, onContactCs, onWa }: { onCancel: () => void; onContactCs: () => void; onWa: () => void }) {
  return (
    <View className="overflow-hidden rounded-2xl">
      <LinearGradient colors={['#92400E', '#F59E0B']} style={{ padding: 20 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ height: 72, width: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Users color="white" size={32} strokeWidth={2.2} />
          </View>
          <Text style={{ color: 'white', textAlign: 'center', fontFamily: 'Inter_800ExtraBold', fontSize: 18, marginTop: 12 }}>
            Tim CS Akan Bantu Carikan
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6, lineHeight: 18 }}>
            Belum ada cleaner yang respons dalam 15 menit. Tim CS kami akan bantu carikan cleaner manual — biasanya selesai dalam 30 menit. Notifikasi akan dikirim begitu cleaner ditemukan.
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/react-native';
import { Audio } from 'expo-av';
import { ChevronDown, Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { toast } from '../stores/ui';

const CALL_TIMEOUT_SEC = 25;

type EndInfo = {
  durationSec: number;
  answered: boolean;
  errorMsg?: string;
};

type Props = {
  token: string;
  serverUrl: string;
  callerLabel: string;
  maxDurationSec?: number;
  startMuted?: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onEnd: (reason?: 'timeout' | 'hangup' | 'error' | 'max_duration', info?: EndInfo) => void;
};

export function CallOverlay({ token, serverUrl, callerLabel, maxDurationSec = 0, startMuted = false, minimized, onMinimize, onEnd }: Props) {
  // Track if the other side has connected — mid-call disconnects are not fatal errors
  const answeredRef = useRef(false);

  useEffect(() => {
    AudioSession.startAudioSession().catch(() => {});
    return () => { AudioSession.stopAudioSession().catch(() => {}); };
  }, []);

  function handleError(err?: any) {
    const errMsg = err?.message ?? (err != null ? String(err) : undefined);
    if (answeredRef.current) {
      onEnd('hangup', { durationSec: 0, answered: true, errorMsg: errMsg });
    } else {
      onEnd('error', { durationSec: 0, answered: false, errorMsg: errMsg });
    }
  }

  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 999, backgroundColor: '#0F172A',
      display: minimized ? 'none' : 'flex',
    }}>
      <LiveKitRoom
        serverUrl={serverUrl}
        token={token}
        connect={true}
        audio={!startMuted}
        video={false}
        onError={handleError}
      >
        <CallUI
          callerLabel={callerLabel}
          maxDurationSec={maxDurationSec}
          startMuted={startMuted}
          onEnd={onEnd}
          answeredRef={answeredRef}
          onMinimize={onMinimize}
        />
      </LiveKitRoom>
    </View>
  );
}

function CallUI({
  callerLabel,
  maxDurationSec,
  startMuted,
  onEnd,
  answeredRef,
  onMinimize,
}: {
  callerLabel: string;
  maxDurationSec: number;
  startMuted: boolean;
  onEnd: (reason?: 'timeout' | 'hangup' | 'error' | 'max_duration', info?: EndInfo) => void;
  answeredRef: React.MutableRefObject<boolean>;
  onMinimize: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const [muted, setMuted] = useState(startMuted);
  const [speaker, setSpeaker] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(CALL_TIMEOUT_SEC);
  const [timedOut, setTimedOut] = useState(false);
  const [showDurationWarning, setShowDurationWarning] = useState(false);
  const elapsedRef = useRef(0);

  const otherConnected = remoteParticipants.length > 0;
  if (otherConnected) answeredRef.current = true;

  const ringbackRef = useRef<Audio.Sound | null>(null);

  // Ringback tone untuk pemanggil — loop selama menunggu jawaban
  useEffect(() => {
    if (otherConnected || timedOut) {
      ringbackRef.current?.stopAsync().catch(() => {});
      ringbackRef.current?.unloadAsync().catch(() => {});
      ringbackRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
        const { sound } = await Audio.Sound.createAsync(
          require('../../../assets/sounds/call_ringback.wav'),
          { shouldPlay: true, isLooping: true, volume: 0.8 },
        );
        if (cancelled) { void sound.unloadAsync(); return; }
        ringbackRef.current = sound;
      } catch { /* non-fatal */ }
    })();
    return () => {
      cancelled = true;
      ringbackRef.current?.stopAsync().catch(() => {});
      ringbackRef.current?.unloadAsync().catch(() => {});
      ringbackRef.current = null;
    };
  }, [otherConnected, timedOut]);

  // Timer durasi call — mulai saat pihak lain connect
  useEffect(() => {
    if (!otherConnected) return;
    const t = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [otherConnected]);

  // Batas maksimum durasi call (dari config admin)
  useEffect(() => {
    if (!otherConnected || maxDurationSec <= 0) return;
    // Tampilkan warning 60 detik sebelum batas
    if (maxDurationSec > 60) {
      const warnAt = (maxDurationSec - 60) * 1000;
      const warnTimer = setTimeout(() => setShowDurationWarning(true), warnAt);
      const endTimer = setTimeout(async () => {
        setShowDurationWarning(false);
        await room.disconnect().catch(() => {});
        onEnd('max_duration', { durationSec: elapsedRef.current, answered: true });
      }, maxDurationSec * 1000);
      return () => { clearTimeout(warnTimer); clearTimeout(endTimer); };
    } else {
      const endTimer = setTimeout(async () => {
        await room.disconnect().catch(() => {});
        onEnd('max_duration', { durationSec: elapsedRef.current, answered: true });
      }, maxDurationSec * 1000);
      return () => clearTimeout(endTimer);
    }
  }, [otherConnected, maxDurationSec]);

  // Timeout 60 detik — kalau tidak ada yang angkat, auto-hangup
  useEffect(() => {
    if (otherConnected) return;
    if (countdown <= 0) {
      setTimedOut(true);
      room.disconnect().catch(() => {});
      setTimeout(() => onEnd('timeout', { durationSec: 0, answered: false }), 1500);
      return;
    }
    const t = setInterval(() => setCountdown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [otherConnected, countdown]);

  function formatTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  async function requestMicPermission() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Izin Mikrofon',
        message: 'JasaBersih butuh akses mikrofon untuk panggilan suara.',
        buttonPositive: 'Izinkan',
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    const res = await Audio.requestPermissionsAsync();
    return res.granted;
  }

  async function toggleMute() {
    if (muted) {
      const granted = await requestMicPermission().catch(() => false);
      if (!granted) {
        toast.warning('Mikrofon belum diizinkan. Kamu masih bisa dengar lawan bicara.');
        return;
      }
      await localParticipant.setMicrophoneEnabled(true);
      setMuted(false);
      return;
    }

    await localParticipant.setMicrophoneEnabled(false);
    setMuted(true);
  }

  async function toggleSpeaker() {
    await AudioSession.selectAudioOutput(speaker ? 'earpiece' : 'speaker');
    setSpeaker(!speaker);
  }

  async function hangUp() {
    await room.disconnect().catch(() => {});
    onEnd('hangup', { durationSec: elapsedRef.current, answered: answeredRef.current });
  }

  // Sync answeredRef to parent so onError handler has accurate state
  useEffect(() => {
    if (otherConnected) answeredRef.current = true;
  }, [otherConnected, answeredRef]);

  // Auto-end: lawan bicara disconnect setelah call dijawab → hangup otomatis
  useEffect(() => {
    if (!answeredRef.current || otherConnected || timedOut) return;
    const t = setTimeout(async () => {
      await room.disconnect().catch(() => {});
      onEnd('hangup', { durationSec: elapsedRef.current, answered: true });
    }, 1500);
    return () => clearTimeout(t);
  }, [otherConnected, timedOut]);

  const maxLabel = maxDurationSec > 0
    ? `Batas ${Math.floor(maxDurationSec / 60)} menit`
    : null;

  return (
    <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 48 }}>
      {/* Minimize button — top-left */}
      <Pressable
        onPress={onMinimize}
        style={{ position: 'absolute', top: 16, left: 16, padding: 8, zIndex: 10 }}
      >
        <ChevronDown color="white" size={28} strokeWidth={2.2} />
      </Pressable>

      {/* Avatar + nama */}
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'white', fontSize: 36, fontWeight: '700' }}>
            {callerLabel[0]?.toUpperCase()}
          </Text>
        </View>
        <Text style={{ color: 'white', fontSize: 20, fontWeight: '700' }}>{callerLabel}</Text>

        {timedOut ? (
          <Text style={{ color: '#EF4444', fontSize: 14 }}>Tidak ada jawaban</Text>
        ) : otherConnected ? (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: '#94A3B8', fontSize: 14 }}>{formatTime(elapsed)}</Text>
            {muted && (
              <Text style={{ color: '#CBD5E1', fontSize: 11, textAlign: 'center' }}>
                Mikrofon kamu mati. Kamu tetap bisa dengar lawan bicara.
              </Text>
            )}
            {maxLabel && (
              <Text style={{ color: '#475569', fontSize: 11 }}>{maxLabel}</Text>
            )}
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color="#94A3B8" size="small" />
              <Text style={{ color: '#94A3B8', fontSize: 14 }}>Memanggil…</Text>
            </View>
            <Text style={{ color: '#475569', fontSize: 12 }}>
              Otomatis batalkan dalam {countdown}s
            </Text>
          </View>
        )}

        {/* Warning 1 menit sebelum batas */}
        {showDurationWarning && (
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 }}>
            <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
              ⏰ Panggilan akan berakhir dalam 1 menit
            </Text>
          </View>
        )}
      </View>

      {/* Kontrol */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
        <Pressable
          onPress={toggleSpeaker}
          disabled={timedOut}
          style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', opacity: timedOut ? 0.3 : 1 }}
        >
          {speaker
            ? <Volume2 color="white" size={24} strokeWidth={2.2} />
            : <VolumeX color="#94A3B8" size={24} strokeWidth={2.2} />}
        </Pressable>

        {/* Hang up / tutup */}
        <Pressable
          onPress={hangUp}
          style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}
        >
          <PhoneOff color="white" size={28} strokeWidth={2.2} />
        </Pressable>

        <Pressable
          onPress={toggleMute}
          disabled={timedOut || !otherConnected}
          style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', opacity: (timedOut || !otherConnected) ? 0.3 : 1 }}
        >
          {muted
            ? <MicOff color="#EF4444" size={24} strokeWidth={2.2} />
            : <Mic color="white" size={24} strokeWidth={2.2} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

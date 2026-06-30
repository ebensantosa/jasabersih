import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/react-native';
import { Audio } from 'expo-av';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CALL_TIMEOUT_SEC = 60;

type EndInfo = {
  durationSec: number;
  answered: boolean;
};

type Props = {
  token: string;
  serverUrl: string;
  callerLabel: string;
  maxDurationSec?: number;
  onEnd: (reason?: 'timeout' | 'hangup' | 'error' | 'max_duration', info?: EndInfo) => void;
};

export function CallOverlay({ token, serverUrl, callerLabel, maxDurationSec = 0, onEnd }: Props) {
  useEffect(() => {
    AudioSession.startAudioSession().catch(() => {});
    return () => { AudioSession.stopAudioSession().catch(() => {}); };
  }, []);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onEnd('hangup', { durationSec: 0, answered: false })}>
      <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect={true}
          audio={true}
          video={false}
          onError={() => onEnd('error', { durationSec: 0, answered: false })}
        >
          <CallUI callerLabel={callerLabel} maxDurationSec={maxDurationSec} onEnd={onEnd} />
        </LiveKitRoom>
      </View>
    </Modal>
  );
}

function CallUI({
  callerLabel,
  maxDurationSec,
  onEnd,
}: {
  callerLabel: string;
  maxDurationSec: number;
  onEnd: (reason?: 'timeout' | 'hangup' | 'error' | 'max_duration', info?: EndInfo) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(CALL_TIMEOUT_SEC);
  const [timedOut, setTimedOut] = useState(false);
  const [showDurationWarning, setShowDurationWarning] = useState(false);
  // Keep refs so timeout callbacks always see latest values
  const elapsedRef = useRef(0);
  const answeredRef = useRef(false);

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

  async function toggleMute() {
    await localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }

  async function toggleSpeaker() {
    await AudioSession.selectAudioOutput(speaker ? 'earpiece' : 'speaker');
    setSpeaker(!speaker);
  }

  async function hangUp() {
    await room.disconnect().catch(() => {});
    onEnd('hangup', { durationSec: elapsedRef.current, answered: answeredRef.current });
  }

  const maxLabel = maxDurationSec > 0
    ? `Batas ${Math.floor(maxDurationSec / 60)} menit`
    : null;

  return (
    <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 48 }}>
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
              Otomatis batalkan dalam {countdown}d
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

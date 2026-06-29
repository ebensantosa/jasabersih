import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/react-native';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  token: string;
  serverUrl: string;
  callerLabel: string;
  onEnd: () => void;
};

export function CallOverlay({ token, serverUrl, callerLabel, onEnd }: Props) {
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => { AudioSession.stopAudioSession(); };
  }, []);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onEnd}>
      <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
        <LiveKitRoom serverUrl={serverUrl} token={token} connect audio video={false}>
          <CallUI callerLabel={callerLabel} onEnd={onEnd} />
        </LiveKitRoom>
      </View>
    </Modal>
  );
}

function CallUI({ callerLabel, onEnd }: { callerLabel: string; onEnd: () => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const otherConnected = participants.filter((p) => !p.isLocal).length > 0;

  useEffect(() => {
    if (!otherConnected) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [otherConnected]);

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
    await room.disconnect();
    onEnd();
  }

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
        {otherConnected ? (
          <Text style={{ color: '#94A3B8', fontSize: 14 }}>{formatTime(elapsed)}</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="#94A3B8" size="small" />
            <Text style={{ color: '#94A3B8', fontSize: 14 }}>Menghubungkan…</Text>
          </View>
        )}
      </View>

      {/* Kontrol */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
        <Pressable
          onPress={toggleSpeaker}
          style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' }}
        >
          {speaker
            ? <Volume2 color="white" size={24} strokeWidth={2.2} />
            : <VolumeX color="#94A3B8" size={24} strokeWidth={2.2} />}
        </Pressable>

        {/* Hang up */}
        <Pressable
          onPress={hangUp}
          style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}
        >
          <PhoneOff color="white" size={28} strokeWidth={2.2} />
        </Pressable>

        <Pressable
          onPress={toggleMute}
          style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' }}
        >
          {muted
            ? <MicOff color="#EF4444" size={24} strokeWidth={2.2} />
            : <Mic color="white" size={24} strokeWidth={2.2} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

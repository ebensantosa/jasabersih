import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Phone, Send } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBookingsStore } from '../../src/stores/bookings';
import { toast } from '../../src/stores/ui';

const QUICK_REPLIES = ['Sudah sampai?', 'Pakai pintu samping', 'Terima kasih 🙏', 'Tolong hati-hati'];

const CLEANER_REPLIES = [
  'Baik kak 🙏',
  'Siap, saya kerjakan',
  'Sebentar ya, sedang dikerjakan',
  'Mohon maaf, baru lihat pesannya',
];

export default function Chat() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === id));
  const append = useBookingsStore((s) => s.appendMessage);

  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [booking?.messages.length]);

  if (!booking) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans">Chat tidak ditemukan</Text>
      </SafeAreaView>
    );
  }

  function send(content: string) {
    if (!booking) return;
    if (!content.trim()) return;
    append(booking.id, { senderId: 'me', text: content });
    setText('');
    // Mock auto-reply
    setTimeout(() => {
      const reply = CLEANER_REPLIES[Math.floor(Math.random() * CLEANER_REPLIES.length)] ?? 'Baik kak';
      booking && append(booking.id, { senderId: 'cleaner', text: reply });
    }, 1200);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        className="flex-1 bg-ink-50"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView edges={['top']} className="bg-white">
          <View className="flex-row items-center gap-2 border-b border-ink-100 px-3 py-2">
            <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-100">
              <Text className="font-bold text-sm text-brand-700">
                {(booking.cleanerName ?? 'C')[0]}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-sm text-ink-900">
                {booking.cleanerName ?? 'Menunggu cleaner…'}
              </Text>
              {booking.cleanerName ? (
                <Text className="font-medium text-[11px] text-success">Online</Text>
              ) : (
                <Text className="font-medium text-[11px] text-ink-400">Belum di-assign</Text>
              )}
            </View>
            <Pressable
              onPress={() =>
                toast.warning('Demi keamanan, komunikasi hanya via in-app chat')
              }
              className="h-10 w-10 items-center justify-center rounded-full bg-brand-50"
            >
              <Phone color="#1D4ED8" size={18} strokeWidth={2.2} />
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {booking.messages.map((m) => (
            <Bubble key={m.id} sender={m.senderId} text={m.text} time={m.createdAt} />
          ))}
        </ScrollView>

        {/* Quick replies */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-12">
          <View className="flex-row gap-2 px-4 py-2">
            {QUICK_REPLIES.map((q) => (
              <Pressable
                key={q}
                onPress={() => send(q)}
                className="rounded-full border border-brand-200 bg-white px-3 py-1.5"
              >
                <Text className="font-medium text-xs text-brand-700">{q}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Composer */}
        <SafeAreaView edges={['bottom']} className="border-t border-ink-200 bg-white">
          <View className="flex-row items-center gap-2 px-3 py-2">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Tulis pesan…"
              placeholderTextColor="#94A3B8"
              multiline
              className="font-sans flex-1 rounded-2xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900"
              style={{ maxHeight: 100 }}
            />
            <Pressable
              onPress={() => send(text)}
              disabled={!text.trim()}
              className="h-11 w-11 items-center justify-center rounded-full bg-brand-600 disabled:opacity-50"
            >
              <Send color="white" size={18} strokeWidth={2.4} />
            </Pressable>
          </View>
          <Text className="font-sans px-4 pb-1 text-center text-[10px] text-ink-400">
            Pesan dimoderasi sistem · Jangan kirim nomor HP / link
          </Text>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </>
  );
}

function Bubble({ sender, text, time }: { sender: 'me' | 'cleaner' | 'system'; text: string; time: number }) {
  const t = new Date(time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (sender === 'system') {
    return (
      <View className="self-center rounded-full bg-ink-200 px-3 py-1">
        <Text className="font-sans text-[11px] text-ink-600">{text}</Text>
      </View>
    );
  }
  const isMe = sender === 'me';
  return (
    <View className={isMe ? 'items-end' : 'items-start'}>
      <View
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${
          isMe ? 'bg-brand-600' : 'bg-white'
        }`}
        style={isMe ? {} : { borderWidth: 1, borderColor: '#E2E8F0' }}
      >
        <Text className={`font-sans text-sm ${isMe ? 'text-white' : 'text-ink-800'}`}>{text}</Text>
      </View>
      <Text className="font-sans mx-1 mt-0.5 text-[10px] text-ink-400">{t}</Text>
    </View>
  );
}

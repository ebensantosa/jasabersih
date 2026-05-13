import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, ClipboardList, Send, ShieldAlert, AlertCircle, Star } from 'lucide-react-native';
import { withAuth } from '../../src/components/AuthGate';
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

import { useChatSocket } from '../../src/hooks/useChatSocket';
import { useAuthStore } from '../../src/stores/auth';
import { useBookingsStore } from '../../src/stores/bookings';

// Decode JWT (no verify, just extract `sub` claim) to get current user id.
function decodeJwtSub(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const decoded = typeof (globalThis as any).atob === 'function'
      ? (globalThis as any).atob(part.replace(/-/g, '+').replace(/_/g, '/'))
      : Buffer.from(part, 'base64').toString();
    const json = JSON.parse(decoded);
    return (json?.sub as string) ?? null;
  } catch { return null; }
}
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

const QUICK_REPLIES = ['Sudah sampai?', 'Pakai pintu samping', 'Terima kasih', 'Tolong hati-hati'];

function Chat() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === id));
  const myUserId = useAuthStore((s) => decodeJwtSub(s.tokens?.accessToken)) ?? 'me';

  const { messages, status, otherTyping, send, setTyping } = useChatSocket(id);
  const [text, setText] = useState('');
  const [blockWarning, setBlockWarning] = useState<string | null>(null);
  const [cleanerStats, setCleanerStats] = useState<{ ratingAvg: number; ratingCount: number } | null>(null);
  const [peerPresence, setPeerPresence] = useState<{ isOnline: boolean; lastSeenAt: string | null } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Fetch cleaner rating + presence untuk header (kalau cleaner sudah di-assign)
  useEffect(() => {
    const cleanerId = (booking as any)?.cleanerId ?? (booking as any)?.cleaner_id;
    if (!cleanerId) return;
    let alive = true;
    import('../../src/lib/api').then(({ api }) => {
      api.get(`/ratings/cleaner/${cleanerId}`).then((r) => {
        const list: any[] = r.data?.data ?? [];
        if (list.length === 0) return;
        const sum = list.reduce((s, x) => s + Number(x.rating ?? 0), 0);
        if (alive) setCleanerStats({ ratingAvg: sum / list.length, ratingCount: list.length });
      }).catch(() => {});

      const fetchPresence = () => {
        api.get(`/users/${cleanerId}/presence`).then((r) => {
          const d = r.data?.data ?? r.data;
          if (alive) setPeerPresence({ isOnline: !!d?.isOnline, lastSeenAt: d?.lastSeenAt ?? null });
        }).catch(() => {});
      };
      fetchPresence();
      const t = setInterval(fetchPresence, 30_000);
      return () => { alive = false; clearInterval(t); };
    });
    return () => { alive = false; };
  }, [booking]);

  function presenceLabel(): string {
    if (otherTyping) return 'sedang mengetik…';
    if (!peerPresence) return 'tap untuk lihat profil';
    if (peerPresence.isOnline) return 'Online';
    if (!peerPresence.lastSeenAt) return 'tap untuk lihat profil';
    const t = new Date(peerPresence.lastSeenAt);
    const diffMin = (Date.now() - t.getTime()) / 60_000;
    if (diffMin < 60) return `Aktif ${Math.max(1, Math.floor(diffMin))} menit lalu`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(t); day.setHours(0, 0, 0, 0);
    const dayDiff = (today.getTime() - day.getTime()) / 86400000;
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    if (dayDiff === 0) return `Aktif jam ${hh}:${mm}`;
    if (dayDiff === 1) return `Aktif kemarin ${hh}:${mm}`;
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `Aktif ${t.getDate()} ${months[t.getMonth()]}`;
  }

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  // Clear block warning after 5s
  useEffect(() => {
    if (!blockWarning) return;
    const t = setTimeout(() => setBlockWarning(null), 5000);
    return () => clearTimeout(t);
  }, [blockWarning]);

  if (!id) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans">Chat tidak ditemukan</Text>
      </SafeAreaView>
    );
  }

  async function handleSend(content: string) {
    if (!content.trim()) return;
    const res = await send(content);
    if (!res.ok) {
      toast.error(res.error ?? 'Gagal kirim');
      return;
    }
    if (res.blocked) {
      setBlockWarning(res.userMessage ?? 'Pesan ditolak — dilarang share kontak / link / tawaran di luar app.');
      setText('');
      return;
    }
    setText('');
  }

  function onChangeText(v: string) {
    setText(v);
    setTyping(v.length > 0);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView className="flex-1 bg-ink-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['top']} className="bg-white">
          <View className="flex-row items-center gap-2 border-b border-ink-100 px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            {booking?.cleanerPhotoUrl ? (
              <Image
                source={{ uri: booking.cleanerPhotoUrl }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
                contentFit="cover"
              />
            ) : (
              <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-100">
                <Text className="font-bold text-sm text-brand-700">{(booking?.cleanerName ?? 'C')[0]}</Text>
              </View>
            )}
            <Pressable
              className="flex-1"
              onPress={() => {
                const cleanerId = (booking as any)?.cleanerId ?? (booking as any)?.cleaner_id;
                if (cleanerId) router.push({ pathname: '/cleaner/public/[id]', params: { id: cleanerId } });
              }}
            >
              <View className="flex-row items-center gap-1.5">
                <Text className="font-semibold text-sm text-ink-900">{booking?.cleanerName ?? 'Menunggu cleaner…'}</Text>
                {cleanerStats && (
                  <View className="flex-row items-center gap-0.5">
                    <Star color="#FACC15" fill="#FACC15" size={10} strokeWidth={1} />
                    <Text className="font-bold text-[10px] text-ink-700">{cleanerStats.ratingAvg.toFixed(1)}</Text>
                    <Text className="font-sans text-[10px] text-ink-400">({cleanerStats.ratingCount})</Text>
                  </View>
                )}
              </View>
              <Text className={`font-medium text-[11px] ${peerPresence?.isOnline ? 'text-success' : 'text-ink-500'}`}>
                {status === 'connecting' ? 'Menyambung…' :
                 status === 'error' ? 'Koneksi error' :
                 presenceLabel()}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>

        {/* Order context — link ke booking */}
        {booking && (
          <Pressable
            onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.id } })}
            className="flex-row items-center gap-2.5 border-b border-ink-100 bg-white px-3 py-2.5"
          >
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <ClipboardList color="#1D4ED8" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className="font-semibold text-[12px] text-ink-900" numberOfLines={1}>
                  {booking.packageName ?? booking.categoryName ?? 'Pesanan'}
                </Text>
                <View className="rounded bg-ink-100 px-1.5 py-0.5">
                  <Text className="font-mono text-[9px] text-ink-600">#{booking.id.slice(0, 8)}</Text>
                </View>
              </View>
              <Text className="font-medium mt-0.5 text-[10px] text-ink-500" numberOfLines={1}>
                {new Date(booking.scheduledAt).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · Rp {Number(booking.totalPrice ?? 0).toLocaleString('id-ID')}
              </Text>
            </View>
            <ChevronRight color="#94A3B8" size={16} strokeWidth={2.4} />
          </Pressable>
        )}

        {/* Safety banner + Report button */}
        <View className="flex-row items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <ShieldAlert color="#92400E" size={14} />
          <View className="flex-1">
            <Text className="font-sans text-[11px] text-amber-900">
              Dilarang share <Text className="font-bold">no HP, WA, transfer bank</Text> di chat. Lapor cleaner yang nanya nomor pribadi atau ajak transfer luar app — dapat <Text className="font-bold">voucher Rp 50.000</Text>.
            </Text>
            <Pressable
              onPress={() => router.push({ pathname: '/report-cleaner', params: { bookingId: id! } })}
              className="mt-1.5 self-start rounded-md bg-amber-200 px-2 py-1"
            >
              <Text className="font-bold text-[10px] text-amber-900">🚩 Lapor Cleaner</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ padding: 16, gap: 8 }} showsVerticalScrollIndicator={false}>
          {messages.length === 0 ? (
            <View className="self-center rounded-full bg-ink-200 px-3 py-1">
              <Text className="font-sans text-[11px] text-ink-600">Mulai percakapan</Text>
            </View>
          ) : messages.map((m) => (
            <Bubble key={m.id} isMe={m.senderId === myUserId} text={m.content} time={new Date(m.createdAt).getTime()} />
          ))}
        </ScrollView>

        {blockWarning && (
          <View className="mx-3 mb-2 flex-row items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3">
            <AlertCircle color="#B91C1C" size={16} />
            <Text className="font-sans flex-1 text-xs text-red-800">{blockWarning}</Text>
          </View>
        )}

        {/* Quick replies */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-12">
          <View className="flex-row gap-2 px-4 py-2">
            {QUICK_REPLIES.map((q) => (
              <Pressable key={q} onPress={() => handleSend(q)} className="rounded-full border border-brand-200 bg-white px-3 py-1.5">
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
              onChangeText={onChangeText}
              onBlur={() => setTyping(false)}
              placeholder="Tulis pesan…"
              placeholderTextColor="#94A3B8"
              multiline
              className="font-sans flex-1 rounded-2xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900"
              style={{ maxHeight: 100 }}
            />
            <Pressable
              onPress={() => handleSend(text)}
              disabled={!text.trim() || status !== 'connected'}
              className="h-11 w-11 items-center justify-center rounded-full bg-brand-600 disabled:opacity-50"
            >
              <Send color="white" size={18} strokeWidth={2.4} />
            </Pressable>
          </View>
          <Text className="font-sans px-4 pb-1 text-center text-[10px] text-ink-400">
            Pesan dimoderasi otomatis · Pelanggaran berulang = akun di-suspend
          </Text>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </>
  );
}

function Bubble({ isMe, text, time }: { isMe: boolean; text: string; time: number }) {
  const t = new Date(time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return (
    <View className={isMe ? 'items-end' : 'items-start'}>
      <View
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${isMe ? 'bg-brand-600' : 'bg-white'}`}
        style={isMe ? {} : { borderWidth: 1, borderColor: '#E2E8F0' }}
      >
        <Text className={`font-sans text-sm ${isMe ? 'text-white' : 'text-ink-800'}`}>{text}</Text>
      </View>
      <Text className="font-sans mx-1 mt-0.5 text-[10px] text-ink-400">{t}</Text>
    </View>
  );
}

export default withAuth(Chat);

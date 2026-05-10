import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, ShieldCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthGate } from '../../src/components/AuthGate';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { useBookingsStore } from '../../src/stores/bookings';
import { toast } from '../../src/stores/ui';

type ChatRow = {
  bookingId: string;
  partnerName: string;
  partnerPhone?: string | null;
  status: string;
  lastMessage?: string | null;
  lastTimestamp?: string | null;
  unread?: number;
  packageName?: string | null;
};

function ChatsScreen() {
  const router = useRouter();
  const tokens = useAuthStore((s) => s.tokens);
  const bookings = useBookingsStore((s) => s.list);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<ChatRow[]>([]);

  const fetchChats = useCallback(async () => {
    if (!tokens) return;
    setLoading(true);
    try {
      // Bookings yang udah ada partner (matched/in_progress/completed) = bisa chat
      const candidates = bookings.filter((b) =>
        ['matched', 'on_the_way', 'in_progress', 'completed'].includes(b.status as string),
      );
      const rows: ChatRow[] = [];
      for (const b of candidates) {
        try {
          const res = await api.get(`/chat/booking/${b.id}`);
          const msgs: Array<{ content: string; createdAt: string; status?: string }> = res.data?.data ?? [];
          const last = msgs[msgs.length - 1];
          rows.push({
            bookingId: b.id,
            partnerName: (b as any).cleanerName ?? (b as any).customerName ?? 'Cleaner',
            status: b.status as string,
            lastMessage: last?.content ?? null,
            lastTimestamp: last?.createdAt ?? null,
            packageName: b.packageName ?? null,
          });
        } catch { /* skip */ }
      }
      // Sort: unread first, then by last activity
      rows.sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
      setChats(rows);
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal load chat');
    } finally {
      setLoading(false);
    }
  }, [bookings, tokens]);

  useFocusEffect(useCallback(() => { void fetchChats(); }, [fetchChats]));

  return (
    <View className="flex-1 bg-ink-50">
      <LinearGradient colors={['#1E40AF', '#3B82F6']} style={{ paddingBottom: 24 }}>
        <SafeAreaView edges={['top']}>
          <View className="px-5 pb-2 pt-3">
            <Text className="font-extrabold text-2xl text-white">Pesan</Text>
            <Text className="font-sans text-[12px] text-white/80">Chat dengan cleaner per pesananmu</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Safety reminder */}
        <View className="mb-3 flex-row items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <ShieldCheck color="#B45309" size={16} strokeWidth={2.4} />
          <View className="flex-1">
            <Text className="font-bold text-[12px] text-amber-900">Chat hanya di JasaBersih</Text>
            <Text className="font-sans mt-0.5 text-[11px] leading-4 text-amber-900">
              Jangan share nomor HP, WA, atau bayar di luar app. Order via app dapat asuransi & garansi.
            </Text>
          </View>
        </View>

        {loading ? (
          <View className="items-center py-12"><ActivityIndicator color="#1D4ED8" /></View>
        ) : chats.length === 0 ? (
          <View className="items-center py-16">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-ink-100">
              <MessageCircle color="#94A3B8" size={28} />
            </View>
            <Text className="font-bold mt-3 text-sm text-ink-700">Belum ada chat</Text>
            <Text className="font-sans mt-1 max-w-xs text-center text-xs text-ink-500">
              Chat akan tersedia setelah cleaner cocok dengan pesanan kamu. Pesan layanan dulu untuk mulai.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/explore')}
              className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5"
            >
              <Text className="font-bold text-sm text-white">Pesan Layanan</Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-2">
            {chats.map((c) => (
              <Pressable
                key={c.bookingId}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.bookingId } })}
                className="flex-row items-center gap-3 rounded-2xl bg-white p-3"
                style={{ elevation: 1 }}
              >
                <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                  <MessageCircle color="#1D4ED8" size={22} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-bold text-sm text-ink-900" numberOfLines={1}>{c.partnerName}</Text>
                    {c.lastTimestamp && (
                      <Text className="font-sans text-[10px] text-ink-400">
                        {timeAgo(c.lastTimestamp)}
                      </Text>
                    )}
                  </View>
                  {c.packageName && (
                    <Text className="font-medium text-[10px] text-brand-600" numberOfLines={1}>
                      {c.packageName}
                    </Text>
                  )}
                  <Text className="font-sans mt-0.5 text-[12px] text-ink-500" numberOfLines={1}>
                    {c.lastMessage ?? 'Mulai percakapan…'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}h`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function Chats() {
  return (
    <AuthGate>
      <ChatsScreen />
    </AuthGate>
  );
}

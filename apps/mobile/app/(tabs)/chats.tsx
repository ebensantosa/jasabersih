import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { MessageCircle, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGate } from '../../src/components/AuthGate';
import { CleanerKycGate } from '../../src/components/CleanerKycGate';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { useBookingsStore } from '../../src/stores/bookings';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';

type ChatRow = {
  bookingId: string;
  partnerName: string;
  partnerPhotoUrl?: string | null;
  isAdmin?: boolean;
  status: string;
  lastMessage?: string | null;
  lastTimestamp?: string | null;
  unread?: number;
  packageName?: string | null;
};

function ChatsScreen() {
  const { bottom } = useSafeAreaInsets();
  const tabBarHeight = (Platform.OS === 'web' ? 64 : 72) + bottom;
  const router = useRouter();
  // Pakai selector string (bukan object) supaya ref stable - mencegah
  // fetchChats useCallback ke-recreate tiap zustand update.
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  const isCleaner = useModeStore((s) => s.mode) === 'freelancer';
  const chatUnreadSignal = useBookingsStore((s) => s.chatUnreadSignal);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const hasDataRef = useRef(false);

  const fetchChats = useCallback(async () => {
    // Only show spinner on initial load — re-fetch on focus stays silent
    if (!hasDataRef.current) setLoading(true);
    try {
      const res = await api.get('/chat/conversations');
      const data = (res.data?.data ?? res.data ?? []) as ChatRow[];
      setChats(data);
      hasDataRef.current = true;
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal load chat');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (accessToken) void fetchChats();
  }, [fetchChats, accessToken]));

  // Re-fetch saat ada pesan baru dari socket (chat:unread event via jobs socket)
  const isFocusedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    return () => { isFocusedRef.current = false; };
  }, []));
  useEffect(() => {
    if (isFocusedRef.current && accessToken) void fetchChats();
  }, [chatUnreadSignal, accessToken, fetchChats]);


  return (
    <View className="flex-1 bg-ink-50">
      <LinearGradient
        colors={['#1E3A8A', '#047857', '#0E7490']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 24, width: '100%', alignSelf: 'stretch' }}
      >
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 40,
            right: 30,
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: 'rgba(255,255,255,0.06)',
          }}
        />
        <SafeAreaView edges={['top']}>
          <View className="px-5 pb-2 pt-3">
            <Text className="font-extrabold text-2xl text-white">Pesan</Text>
            <Text className="font-sans text-[12px] text-white/80">
              {isCleaner ? 'Chat dengan customer per job kamu' : 'Chat dengan cleaner per pesananmu'}
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
        style={{ backgroundColor: '#EFF4FB', marginTop: -20 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchChats} tintColor="#1D4ED8" />}
      >
        <View
          style={{
            backgroundColor: '#EFF4FB',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            paddingHorizontal: 16,
          }}
        >
          <LinearGradient
            colors={['rgba(37,99,235,0.08)', 'rgba(37,99,235,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 80,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
            pointerEvents="none"
          />

          <View className="mb-3 mt-3 flex-row items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <ShieldCheck color="#B45309" size={16} strokeWidth={2.4} />
            <View className="flex-1">
              {isCleaner ? (
                <>
                  <Text className="font-bold text-[12px] text-amber-900">Tetap profesional & aman</Text>
                  <Text className="font-sans mt-0.5 text-[11px] leading-4 text-amber-900">
                    Jangan share nomor HP atau ajak transaksi di luar app. Melanggar ketentuan dapat berakibat penonaktifan akun.
                  </Text>
                </>
              ) : (
                <>
                  <Text className="font-bold text-[12px] text-amber-900">Chat hanya di JasaBersih</Text>
                  <Text className="font-sans mt-0.5 text-[11px] leading-4 text-amber-900">
                    Jangan share nomor HP, WA, atau bayar di luar app. Transaksi via app dapat garansi pengerjaan.
                  </Text>
                </>
              )}
            </View>
          </View>

          {loading ? (
            <View className="items-center py-12"><ActivityIndicator color="#1D4ED8" /></View>
          ) : chats.length === 0 ? (
            <View className="items-center py-16">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-ink-100">
                <MessageCircle color="#94A3B8" size={28} />
              </View>
              <Text className="mt-3 font-bold text-sm text-ink-700">Belum ada chat</Text>
              <Text className="mt-1 max-w-xs text-center font-sans text-xs text-ink-500">
                {isCleaner
                  ? 'Chat dengan customer akan muncul setelah kamu ambil job.'
                  : 'Chat akan tersedia setelah cleaner cocok dengan pesanan kamu. Pesan layanan dulu untuk mulai.'}
              </Text>
              {!isCleaner && (
                <Pressable
                  onPress={() => router.push('/(tabs)/explore')}
                  className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5"
                >
                  <Text className="font-bold text-sm text-white">Pesan Layanan</Text>
                </Pressable>
              )}
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
                  {c.isAdmin ? (
                    <Image
                      source={require('../../assets/icon.png')}
                      style={{ width: 48, height: 48, borderRadius: 24 }}
                      contentFit="cover"
                    />
                  ) : c.partnerPhotoUrl ? (
                    <Image
                      source={{ uri: c.partnerPhotoUrl }}
                      style={{ width: 48, height: 48, borderRadius: 24 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                      <Text className="font-bold text-base text-brand-700">{(c.partnerName?.[0] ?? '?').toUpperCase()}</Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-bold text-sm text-ink-900" numberOfLines={1}>{c.isAdmin ? 'Admin JasaBersih' : (c.partnerName ?? 'Unknown')}</Text>
                      {c.lastTimestamp && (
                        <Text className="font-sans text-[10px] text-ink-400">
                          {timeAgo(c.lastTimestamp)}
                        </Text>
                      )}
                    </View>
                    <Text className="font-medium text-[10px] text-brand-600" numberOfLines={1}>
                      {[c.packageName, `#${c.bookingId.slice(0, 8)}`].filter(Boolean).join(' · ')}
                    </Text>
                    <View className="mt-0.5 flex-row items-center gap-1.5">
                      <Text className="flex-1 font-sans text-[12px] text-ink-500" numberOfLines={1}>
                        {c.lastMessage ?? 'Mulai percakapan...'}
                      </Text>
                      {c.unread != null && c.unread > 0 && (
                        <View className="min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5">
                          <Text className="font-bold text-[10px] text-white">{c.unread > 9 ? '9+' : c.unread}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
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
  const mode = useModeStore((s) => s.mode);
  return (
    <AuthGate>
      {mode === 'freelancer' ? (
        <CleanerKycGate>
          <ChatsScreen />
        </CleanerKycGate>
      ) : (
        <ChatsScreen />
      )}
    </AuthGate>
  );
}

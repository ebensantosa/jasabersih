import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Bell, MessageCircle, Wallet, ShieldAlert, Calendar } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotifications, type NotificationItem } from '../src/stores/notifications';
import { withAuth } from '../src/components/AuthGate';
import { safeBack } from '../src/lib/safeBack';
import { useModeStore } from '../src/stores/mode';

function NotificationsScreen() {
  const router = useRouter();
  const mode = useModeStore((s) => s.mode);
  const { list, loading, fetch, markAllRead } = useNotifications();

  useEffect(() => {
    void fetch(true);
    return () => { void markAllRead(); }; // mark read saat keluar
  }, []);

  async function onTap(n: NotificationItem) {
    const data = n.data as Record<string, unknown> | null;
    const type = data?.type as string | undefined;
    const bookingId = data?.bookingId as string | undefined;

    // Force-sync booking store before navigating so screen reflects current
    // server status (e.g., notif 'payment_timeout_cancel' → booking is now
    // 'canceled' on server; without sync, mobile would show stale state).
    if (bookingId) {
      try {
        const { useBookingsStore } = await import('../src/stores/bookings');
        await useBookingsStore.getState().syncFromApi();
      } catch {/* silent */}
    }

    if (type === 'chat' && bookingId) router.push({ pathname: '/chat/[id]', params: { id: bookingId } });
    else if (bookingId) router.push({ pathname: '/booking/[id]', params: { id: bookingId } });
    else if (type === 'kyc_approved' || type === 'kyc_rejected') router.push('/cleaner/kyc');
    else if (type === 'withdrawal_approved' || type === 'withdrawal_rejected') router.push(mode === 'freelancer' ? '/cleaner/wallet' : '/account/wallet');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">Notifikasi</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1D4ED8" /></View>
        ) : list.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Bell color="#94A3B8" size={48} />
            <Text className="font-bold mt-3 text-base text-ink-900">Belum ada notifikasi</Text>
            <Text className="font-sans mt-1 text-center text-sm text-ink-500">
              Update booking, chat, dan saldo akan muncul di sini.
            </Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(n) => n.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => onTap(item)} className={`mx-3 mt-2 flex-row gap-3 rounded-xl border ${item.isRead ? 'border-ink-100 bg-white' : 'border-brand-100 bg-brand-50'} p-3`}>
                <ChannelIcon type={item.type} />
                <View className="flex-1">
                  <Text className="font-bold text-sm text-ink-900">{item.title}</Text>
                  <Text className="font-sans mt-0.5 text-xs text-ink-600" numberOfLines={2}>{item.body}</Text>
                  <Text className="font-sans mt-1 text-[10px] text-ink-400">
                    {new Date(item.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {!item.isRead && <View className="h-2 w-2 rounded-full bg-brand-600" />}
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </>
  );
}

function ChannelIcon({ type }: { type: string }) {
  const config: Record<string, { Icon: any; bg: string; color: string }> = {
    chat: { Icon: MessageCircle, bg: '#DBEAFE', color: '#1D4ED8' },
    booking: { Icon: Calendar, bg: '#D1FAE5', color: '#047857' },
    wallet: { Icon: Wallet, bg: '#FEF3C7', color: '#B45309' },
    system: { Icon: ShieldAlert, bg: '#FEE2E2', color: '#B91C1C' },
  };
  const cfg = config[type] ?? config.system!;
  return (
    <View style={{ backgroundColor: cfg.bg }} className="h-10 w-10 items-center justify-center rounded-full">
      <cfg.Icon color={cfg.color} size={18} strokeWidth={2.2} />
    </View>
  );
}


export default withAuth(NotificationsScreen);

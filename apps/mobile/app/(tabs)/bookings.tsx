import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { CalendarCheck, ChevronRight } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../../src/data/catalog';
import { formatScheduleWithTz } from '../../src/lib/datetime';
import { useAuthStore } from '../../src/stores/auth';
import { STATUS_COLOR, STATUS_LABEL, useBookingsStore } from '../../src/stores/bookings';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useModeStore } from '../../src/stores/mode';
import { useUserStore } from '../../src/stores/user';

export default function Bookings() {
  const router = useRouter();
  const tokens = useAuthStore((s) => s.tokens);
  const mode = useModeStore((s) => s.mode);
  const cleanerName = useCleanerStore((s) => s.name);
  const myUserId = useUserStore((s) => s.profile?.id);
  const allList = useBookingsStore((s) => s.list);
  const syncFromApi = useBookingsStore((s) => s.syncFromApi);
  const syncing = useBookingsStore((s) => s.syncing);
  const isCleaner = mode === 'freelancer';

  // Refresh on focus - skip kalau belum login (sync bakal 401 + Redirect tetep jalan di bawah)
  useFocusEffect(useCallback(() => { if (tokens) void syncFromApi(); }, [syncFromApi, tokens]));
  // Cleaner mode: tampilkan SEMUA job yg cleaner ini ambil (riwayat ambil job).
  //   Match by cleanerId (paling reliable) atau fallback cleanerName.
  // Customer mode: semua booking customer.
  const list = isCleaner
    ? allList.filter((b) =>
        (myUserId && (b as any).cleanerId === myUserId) ||
        (cleanerName && b.cleanerName === cleanerName),
      )
    : allList;

  // Redirect synchronous saat tidak ada token - menghindari blank screen flash
  if (!tokens) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View className="flex-1 bg-ink-50">
      <SafeAreaView edges={['top']} className="bg-white">
        <View className="px-4 pb-3 pt-2">
          <Text className="font-bold text-2xl text-ink-900">
            {isCleaner ? 'Riwayat Job' : 'Pesanan Saya'}
          </Text>
          <Text className="font-sans mt-0.5 text-xs text-ink-500">
            {list.length === 0
              ? (isCleaner ? 'Belum pernah ambil job' : 'Belum ada pesanan')
              : `${list.length} ${isCleaner ? 'job' : 'pesanan'}`}
          </Text>
        </View>
      </SafeAreaView>

      {list.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <CalendarCheck color="#94A3B8" size={48} />
          <Text className="font-semibold mt-3 text-ink-700">
            {isCleaner ? 'Belum pernah ambil job' : 'Belum ada pesanan'}
          </Text>
          <Text className="font-sans mt-1 text-center text-xs text-ink-500">
            {isCleaner
              ? 'Aktifkan Online di tab Job, lalu ambil job yang masuk untuk muncul di sini.'
              : 'Tap layanan di Home untuk pesan sekarang'}
          </Text>
          <Pressable
            onPress={() => router.push(isCleaner ? '/(tabs)/jobs' : '/(tabs)')}
            className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5"
          >
            <Text className="font-semibold text-xs text-white">
              {isCleaner ? 'Buka Job Board' : 'Lihat Layanan'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncFromApi()} />}
        >
          {list.map((b) => {
            const c = STATUS_COLOR[b.status] ?? { bg: '#F1F5F9', fg: '#475569' };
            return (
              <Pressable
                key={b.id}
                onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
                className="flex-row gap-3 rounded-2xl bg-white p-3"
              >
                <View className="h-16 w-16 overflow-hidden rounded-xl bg-ink-100">
                  <Image
                    source={b.categoryImage}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </View>
                <View className="flex-1 justify-center">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-semibold text-sm text-ink-900">{b.categoryName}</Text>
                    <ChevronRight color="#CBD5E1" size={16} />
                  </View>
                  <Text className="font-sans mt-0.5 text-[11px] text-ink-500" numberOfLines={1}>
                    {formatScheduleWithTz(b.scheduledAt, b.addressLine)} · {b.addressLine}
                  </Text>
                  <View className="mt-1.5 flex-row items-center justify-between">
                    <View
                      className="self-start rounded-full px-2 py-0.5"
                      style={{ backgroundColor: c.bg }}
                    >
                      <Text className="font-semibold text-[10px]" style={{ color: c.fg }}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </Text>
                    </View>
                    <Text className="font-bold text-xs text-brand-600">
                      {isCleaner && (b as any).cleanerPayout != null
                        ? formatRupiah(Number((b as any).cleanerPayout))
                        : formatRupiah(b.totalPrice)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

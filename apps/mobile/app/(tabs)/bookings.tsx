import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { CalendarCheck, ChevronRight, LogIn } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../../src/data/catalog';
import { formatScheduleWithTz } from '../../src/lib/datetime';
import { useAuthStore } from '../../src/stores/auth';
import { STATUS_COLOR, STATUS_LABEL, useBookingsStore } from '../../src/stores/bookings';
import { useModeStore } from '../../src/stores/mode';

export default function Bookings() {
  const router = useRouter();
  const tokens = useAuthStore((s) => s.tokens);
  const mode = useModeStore((s) => s.mode);
  const allList = useBookingsStore((s) => s.list);
  const syncFromApi = useBookingsStore((s) => s.syncFromApi);
  const syncing = useBookingsStore((s) => s.syncing);
  const isCleaner = mode === 'freelancer';
  const [filter, setFilter] = useState<'active' | 'history'>(isCleaner ? 'history' : 'active');
  useEffect(() => {
    setFilter(isCleaner ? 'history' : 'active');
  }, [isCleaner]);

  // Refresh on focus - skip kalau belum login (sync bakal 401 + Redirect tetep jalan di bawah)
  useFocusEffect(useCallback(() => { if (tokens) void syncFromApi(); }, [syncFromApi, tokens]));
  // Cleaner mode: tampilkan SEMUA job yg cleaner ini ambil (riwayat ambil job).
  //   Match by cleanerId (paling reliable) atau fallback cleanerName.
  // Customer mode: semua booking customer.
  const list = isCleaner
    ? allList
    : allList;
  const activeStatuses = useMemo(() => new Set(['pending_payment', 'searching', 'matched', 'on_the_way', 'in_progress', 'wa_survey_pending', 'subscription_parent', 'scheduled_future']), []);
  const activeList = useMemo(() => list.filter((b) => activeStatuses.has(b.status)), [list, activeStatuses]);
  const historyList = useMemo(() => list.filter((b) => !activeStatuses.has(b.status)), [list, activeStatuses]);
  const visibleList = filter === 'active' ? activeList : historyList;

  if (!tokens) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <LinearGradient
          colors={['#1E3A8A', '#047857', '#0E7490']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ height: 200, width: '100%' }}
        >
          <SafeAreaView edges={['top']} />
        </LinearGradient>
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 24, marginTop: -48 }}>
          <View style={{ height: 96, width: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 48, backgroundColor: 'white', elevation: 6, shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <LogIn color="#1D4ED8" size={36} strokeWidth={2} />
          </View>
          <Text style={{ fontWeight: '800', fontSize: 20, color: '#0F172A', marginTop: 20, textAlign: 'center' }}>Login Dulu, Yuk!</Text>
          <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
            Masuk dulu untuk melihat riwayat dan status pesananmu.
          </Text>
          <Pressable
            onPress={() => router.push('/(auth)/login')}
            style={{ marginTop: 28, width: '100%', borderRadius: 16, backgroundColor: '#1D4ED8', paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ fontWeight: '700', fontSize: 15, color: 'white' }}>Masuk / Daftar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ink-50">
      <SafeAreaView edges={['top']} className="bg-white">
        <View className="px-4 pb-3 pt-2">
          <Text className="font-bold text-2xl text-ink-900">
            {isCleaner ? 'Order Cleaner' : 'Pesanan Saya'}
          </Text>
          <Text className="font-sans mt-0.5 text-xs text-ink-500">
            {visibleList.length === 0
              ? (filter === 'active'
                  ? (isCleaner ? 'Belum ada job aktif' : 'Belum ada order aktif')
                  : (isCleaner ? 'Belum ada riwayat job' : 'Belum ada riwayat pesanan'))
              : `${visibleList.length} ${isCleaner ? 'job' : 'pesanan'}`}
          </Text>
          <View className="mt-3 flex-row rounded-2xl bg-ink-100 p-1">
            <Pressable
              onPress={() => setFilter('active')}
              className={`flex-1 rounded-xl px-3 py-2 ${filter === 'active' ? 'bg-white' : ''}`}
            >
              <Text className={`text-center text-xs font-bold ${filter === 'active' ? 'text-brand-700' : 'text-ink-500'}`}>
                Aktif ({activeList.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFilter('history')}
              className={`flex-1 rounded-xl px-3 py-2 ${filter === 'history' ? 'bg-white' : ''}`}
            >
              <Text className={`text-center text-xs font-bold ${filter === 'history' ? 'text-brand-700' : 'text-ink-500'}`}>
                Riwayat ({historyList.length})
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {visibleList.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <CalendarCheck color="#94A3B8" size={48} />
          <Text className="font-semibold mt-3 text-ink-700">
            {filter === 'active'
              ? (isCleaner ? 'Belum ada job aktif' : 'Belum ada order aktif')
              : (isCleaner ? 'Belum ada riwayat job' : 'Belum ada riwayat pesanan')}
          </Text>
          <Text className="font-sans mt-1 text-center text-xs text-ink-500">
            {filter === 'active'
              ? (isCleaner
                  ? 'Buka Job Board untuk melihat job yang sedang berjalan atau ambil job baru.'
                  : 'Order yang masih berjalan akan muncul di sini.')
              : (isCleaner
                  ? 'Job yang sudah selesai atau dibatalkan akan tersimpan di riwayat.'
                  : 'Pesanan yang sudah selesai atau dibatalkan akan tersimpan di riwayat.')}
          </Text>
          <Pressable
            onPress={() => router.push(isCleaner ? '/(tabs)/jobs' : '/(tabs)/explore')}
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
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncFromApi(true)} />}
        >
          {visibleList.map((b) => {
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
                      {isCleaner
                        ? (b.cleanerPayout != null && Number(b.cleanerPayout) > 0
                            ? formatRupiah(Number(b.cleanerPayout))
                            : '—')
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

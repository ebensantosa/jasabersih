import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  ArrowDownToLine,
  Award,
  Crown,
  Gift,
  Info,
  Medal,
  Sparkles,
  TrendingUp,
} from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../../src/data/catalog';
import { CleanerKycGate } from '../../src/components/CleanerKycGate';
import { useBookingsStore } from '../../src/stores/bookings';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useCleanerWalletStore } from '../../src/stores/cleanerWallet';
import { toast } from '../../src/stores/ui';

// Mock leaderboard — nominal earning DI-SENSOR untuk privacy.
// Sprint 2: ambil dari /v1/cleaner/leaderboard?month=YYYY-MM
const LEADERBOARD = [
  { name: 'Pak Eko Wibowo', city: 'Yogyakarta', jobs: 87 },
  { name: 'Bu Sari Indah', city: 'Sleman', jobs: 72 },
  { name: 'Mas Andi Pratama', city: 'Bantul', jobs: 65 },
  { name: 'Bu Wati Suryani', city: 'Yogyakarta', jobs: 58 },
  { name: 'Pak Joko Susanto', city: 'Sleman', jobs: 51 },
];

export default function EarningsRoute() {
  return (
    <CleanerKycGate>
      <EarningsScreen />
    </CleanerKycGate>
  );
}

function EarningsScreen() {
  const router = useRouter();
  const cleanerName = useCleanerStore((s) => s.name);
  const localBalance = useCleanerWalletStore((s) => s.balance());
  const serverBalance = useCleanerWalletStore((s) => s.serverBalance);
  const balance = serverBalance > 0 ? serverBalance : localBalance;
  const entries = useCleanerWalletStore((s) => s.entries);
  const syncWallet = useCleanerWalletStore((s) => s.syncFromApi);

  // Refresh wallet on tab focus
  useFocusEffect(useCallback(() => { void syncWallet(); }, [syncWallet]));
  const list = useBookingsStore((s) => s.list);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonthEarnings = entries
    .filter((e) => e.type === 'earning' && e.createdAt >= monthStart)
    .reduce((s, e) => s + e.amount, 0);
  const thisMonthJobs = entries.filter(
    (e) => e.type === 'earning' && e.createdAt >= monthStart,
  ).length;
  const completedJobs = list.filter(
    (b) => b.cleanerName === cleanerName && b.status === 'completed',
  ).length;

  return (
    <View className="flex-1 bg-ink-50">
      <LinearGradient colors={['#0B2A6F', '#1D4ED8']} style={{ paddingBottom: 60 }}>
        <SafeAreaView edges={['top']}>
          <View className="px-5 pb-2 pt-3">
            <Text className="font-bold text-xl text-white">Pendapatan</Text>
            <Text className="font-medium mt-0.5 text-[11px] text-white/70">
              {now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        style={{ marginTop: -45 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.push('/cleaner/wallet')}
          className="mx-4 overflow-hidden rounded-2xl"
          style={{ elevation: 4 }}
        >
          <LinearGradient colors={['#1D4ED8', '#2563EB']} style={{ padding: 16 }}>
            <Text className="font-medium text-[11px] text-white/70">Saldo Bisa Ditarik</Text>
            <Text className="font-bold mt-1 text-2xl text-white">{formatRupiah(balance)}</Text>
            <View className="mt-3 flex-row items-center justify-center gap-1.5 rounded-xl bg-white py-2.5">
              <ArrowDownToLine color="#1D4ED8" size={16} strokeWidth={2.4} />
              <Text className="font-bold text-sm text-brand-700">Tarik Saldo</Text>
            </View>
          </LinearGradient>
        </Pressable>

        <View className="mx-4 mt-3 flex-row gap-2">
          <View className="flex-1 rounded-2xl bg-white p-3">
            <View className="flex-row items-center gap-1">
              <TrendingUp color="#10B981" size={12} strokeWidth={2.4} />
              <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">
                Bulan ini
              </Text>
            </View>
            <Text className="font-bold mt-1 text-base text-success">
              {formatRupiah(thisMonthEarnings)}
            </Text>
          </View>
          <View className="flex-1 rounded-2xl bg-white p-3">
            <View className="flex-row items-center gap-1">
              <Sparkles color="#1D4ED8" size={12} strokeWidth={2.4} />
              <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">
                Job Bulan Ini
              </Text>
            </View>
            <Text className="font-bold mt-1 text-base text-brand-700">{thisMonthJobs}</Text>
          </View>
          <View className="flex-1 rounded-2xl bg-white p-3">
            <View className="flex-row items-center gap-1">
              <Award color="#B45309" size={12} strokeWidth={2.4} />
              <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">
                Total Job
              </Text>
            </View>
            <Text className="font-bold mt-1 text-base text-amber-700">{completedJobs}</Text>
          </View>
        </View>

        {/* Leaderboard — nominal di-sensor */}
        <View className="mx-4 mt-4 rounded-2xl bg-white p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-bold text-sm text-ink-900">🏆 Top Cleaner Bulan Ini</Text>
            <Pressable onPress={() => toast.info('Update tiap 1 jam · nominal disembunyikan untuk privacy')}>
              <Info color="#94A3B8" size={14} />
            </Pressable>
          </View>
          <View className="gap-2">
            {LEADERBOARD.map((c, i) => {
              const rank = i + 1;
              return (
                <View
                  key={c.name}
                  className={`flex-row items-center gap-3 rounded-xl p-2.5 ${
                    rank <= 3 ? 'bg-amber-50' : 'bg-ink-50'
                  }`}
                >
                  <RankBadge rank={rank} />
                  <View className="flex-1">
                    <Text className="font-semibold text-xs text-ink-900">{c.name}</Text>
                    <Text className="font-medium text-[10px] text-ink-500">
                      {c.city} · {c.jobs} job selesai
                    </Text>
                  </View>
                  <Text className="font-medium text-[10px] text-ink-400">Rp ●●●</Text>
                </View>
              );
            })}
            <View className="mt-2 border-t border-ink-100 pt-2">
              <View className="flex-row items-center gap-3 rounded-xl bg-brand-50 p-2.5">
                <RankBadge rank={LEADERBOARD.length + 1} isYou />
                <View className="flex-1">
                  <Text className="font-bold text-xs text-brand-700">{cleanerName} (kamu)</Text>
                  <Text className="font-medium text-[10px] text-ink-500">
                    {completedJobs} job selesai bulan ini
                  </Text>
                </View>
                <Text className="font-bold text-xs text-brand-700">
                  {formatRupiah(thisMonthEarnings)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="mx-4 mt-4 rounded-2xl bg-white p-4">
          <View className="flex-row items-center gap-2">
            <Gift color="#1D4ED8" size={16} strokeWidth={2.4} />
            <Text className="font-bold text-sm text-ink-900">Tips Naikin Pendapatan</Text>
          </View>
          <View className="mt-3 gap-2">
            <Tip text="Jaga rating ≥ 4.5 untuk dapat job premium duluan" />
            <Tip text="Tambah area layanan di kota tetangga = lebih banyak job" />
            <Tip text="Selesaikan job tepat waktu — bonus loyalitas" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-600" />
      <Text className="font-sans flex-1 text-[12px] leading-[18px] text-ink-700">{text}</Text>
    </View>
  );
}

function RankBadge({ rank, isYou }: { rank: number; isYou?: boolean }) {
  if (rank === 1) {
    return (
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: '#FCD34D' }}
      >
        <Crown color="white" size={16} strokeWidth={2.4} />
      </View>
    );
  }
  if (rank === 2) {
    return (
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: '#CBD5E1' }}
      >
        <Medal color="white" size={16} strokeWidth={2.4} />
      </View>
    );
  }
  if (rank === 3) {
    return (
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: '#F59E0B' }}
      >
        <Medal color="white" size={16} strokeWidth={2.4} />
      </View>
    );
  }
  return (
    <View
      className={`h-8 w-8 items-center justify-center rounded-full ${
        isYou ? 'bg-brand-600' : 'bg-ink-200'
      }`}
    >
      <Text className={`font-bold text-xs ${isYou ? 'text-white' : 'text-ink-700'}`}>#{rank}</Text>
    </View>
  );
}


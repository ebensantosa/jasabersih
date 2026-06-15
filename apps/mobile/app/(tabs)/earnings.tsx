import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../../src/data/catalog';
import { AuthGate } from '../../src/components/AuthGate';
import { CleanerKycGate } from '../../src/components/CleanerKycGate';
import { api } from '../../src/lib/api';
import { useBookingsStore } from '../../src/stores/bookings';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useCleanerWalletStore } from '../../src/stores/cleanerWallet';
import { toast } from '../../src/stores/ui';

type LeaderboardEntry = { name: string; city: string | null; jobs: number };
type LeaderboardMe = { rank: number | null; jobs: number; earnings: number };

export default function EarningsRoute() {
  return (
    <AuthGate>
      <CleanerKycGate>
        <EarningsScreen />
      </CleanerKycGate>
    </AuthGate>
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

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardMe, setLeaderboardMe] = useState<LeaderboardMe>({ rank: null, jobs: 0, earnings: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncWallet();
      const r = await api.get('/cleaner/leaderboard');
      const d = r.data?.data ?? r.data;
      setLeaderboard(Array.isArray(d?.top) ? d.top : []);
      if (d?.me) setLeaderboardMe(d.me);
    } catch { /* silent */ } finally { setRefreshing(false); }
  }, [syncWallet]);

  // Refresh wallet + leaderboard on tab focus
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
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
      {/* Hero gradient lebih tinggi - jadi background floating untuk saldo card */}
      <LinearGradient
        colors={['#1E3A8A', '#047857', '#0E7490']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 90 }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 30, left: -50, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 80, right: 60, width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.05)' }} />
        <SafeAreaView edges={['top']}>
          <View className="px-5 pb-2 pt-3">
            <Text className="font-extrabold text-xl text-white" style={{ letterSpacing: -0.3 }}>Pendapatan</Text>
            <Text className="font-medium mt-0.5 text-[11px] text-white/80">
              {now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        style={{ marginTop: -70 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1D4ED8" />}
      >
        {/* Saldo card floating - 1 gradient card, balance dominan, action chevron
            di pojok. Tap area = full card. Gak ada lagi white pill numpuk. */}
        <Pressable
          onPress={() => router.push('/cleaner/wallet')}
          className="mx-4 overflow-hidden rounded-3xl"
          style={{
            elevation: 12,
            shadowColor: '#0B2A6F',
            shadowOpacity: 0.28,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          <LinearGradient
            colors={['#1E3A8A', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 22, paddingVertical: 22 }}
          >
            <View pointerEvents="none" style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <View pointerEvents="none" style={{ position: 'absolute', bottom: -30, left: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.06)' }} />

            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="font-semibold text-[11px] tracking-wider text-white/80">SALDO BISA DITARIK</Text>
                <Text className="font-extrabold mt-2 text-[30px] leading-9 text-white" style={{ letterSpacing: -0.6 }}>
                  {formatRupiah(balance)}
                </Text>
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
                <ArrowDownToLine color="white" size={18} strokeWidth={2.4} />
              </View>
            </View>

            <View className="mt-4 self-start flex-row items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5">
              <Text className="font-bold text-[11px] text-white">Tap untuk Tarik Saldo</Text>
              <Text className="font-bold text-white">›</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Riwayat Job - shortcut ke tab Pesanan (sudah filter by cleaner) */}
        <Pressable
          onPress={() => router.push('/(tabs)/bookings')}
          className="mx-4 mt-3 flex-row items-center gap-3 rounded-2xl bg-white p-3"
          style={{ elevation: 1 }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
            <Award color="#1D4ED8" size={18} strokeWidth={2.2} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-sm text-ink-900">Riwayat Job</Text>
            <Text className="font-medium text-[11px] text-ink-500">
              Lihat semua {completedJobs} job yg pernah kamu kerjain
            </Text>
          </View>
          <Text className="font-bold text-base text-brand-600">›</Text>
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

        {/* Leaderboard - nominal di-sensor */}
        <View className="mx-4 mt-4 rounded-2xl bg-white p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-bold text-sm text-ink-900">🏆 Top Cleaner Bulan Ini</Text>
            <Pressable onPress={() => toast.info('Update tiap 1 jam · nominal disembunyikan untuk privacy')}>
              <Info color="#94A3B8" size={14} />
            </Pressable>
          </View>
          <View className="gap-2">
            {leaderboard.length === 0 ? (
              <Text className="font-sans py-4 text-center text-[11px] text-ink-500">
                Belum ada cleaner yang selesaikan job bulan ini.
              </Text>
            ) : (
              leaderboard.map((c, i) => {
                const rank = i + 1;
                return (
                  <View
                    key={`${c.name}-${i}`}
                    className={`flex-row items-center gap-3 rounded-xl p-2.5 ${
                      rank <= 3 ? 'bg-amber-50' : 'bg-ink-50'
                    }`}
                  >
                    <RankBadge rank={rank} />
                    <View className="flex-1">
                      <Text className="font-semibold text-xs text-ink-900">{c.name}</Text>
                      <Text className="font-medium text-[10px] text-ink-500">
                        {c.city ? `${c.city} · ` : ''}{c.jobs} job selesai
                      </Text>
                    </View>
                    <Text className="font-medium text-[10px] text-ink-400">Rp ●●●</Text>
                  </View>
                );
              })
            )}
            <View className="mt-2 border-t border-ink-100 pt-2">
              <View className="flex-row items-center gap-3 rounded-xl bg-brand-50 p-2.5">
                <RankBadge rank={leaderboardMe.rank ?? leaderboard.length + 1} isYou />
                <View className="flex-1">
                  <Text className="font-bold text-xs text-brand-700">{cleanerName} (kamu)</Text>
                  <Text className="font-medium text-[10px] text-ink-500">
                    {leaderboardMe.jobs || completedJobs} job selesai bulan ini
                    {leaderboardMe.rank ? ` · peringkat #${leaderboardMe.rank}` : ''}
                  </Text>
                </View>
                <Text className="font-bold text-xs text-brand-700">
                  {formatRupiah(leaderboardMe.earnings || thisMonthEarnings)}
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
            <Tip text="Selesaikan job tepat waktu - bonus loyalitas" />
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


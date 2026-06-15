import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import {
  ArrowDownToLine,
  ArrowLeft,
  CheckCircle2,
  Clock,
  TrendingUp,
  XCircle,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../../src/data/catalog';
import { useCleanerWalletStore, MIN_WITHDRAW, type WalletEntry } from '../../src/stores/cleanerWallet';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { withCleanerKyc } from '../../src/components/CleanerKycGate';
import { safeBack } from '../../src/lib/safeBack';

function CleanerWallet() {
  const router = useRouter();
  const entries = useCleanerWalletStore((s) => s.entries);
  const balance = useCleanerWalletStore((s) => s.balance());
  const pending = useCleanerWalletStore((s) => s.pendingTotal());

  const [escrowPending, setEscrowPending] = useState(0);
  const [tipInsights, setTipInsights] = useState<{ monthTotal: number; monthCount: number; prevMonthTotal: number }>({ monthTotal: 0, monthCount: 0, prevMonthTotal: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const syncFromApi = useCleanerWalletStore((s) => s.syncFromApi);

  async function refresh() {
    setRefreshing(true);
    try {
      const { api } = await import('../../src/lib/api');
      const r = await api.get('/cleaner/wallet');
      const d = r.data?.data ?? r.data;
      setEscrowPending(Number(d?.earningsPending ?? 0));
      if (d?.tipInsights) setTipInsights({
        monthTotal: Number(d.tipInsights.monthTotal ?? 0),
        monthCount: Number(d.tipInsights.monthCount ?? 0),
        prevMonthTotal: Number(d.tipInsights.prevMonthTotal ?? 0),
      });
      if (syncFromApi) await syncFromApi();
    } catch { /* ignore */ } finally { setRefreshing(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const totalEarning = entries
    .filter((e) => e.type === 'earning')
    .reduce((s, e) => s + e.amount, 0);
  const totalWithdraw = entries
    .filter((e) => e.type === 'withdrawal_complete' || e.type === 'withdrawal_pending')
    .reduce((s, e) => s + Math.abs(e.amount), 0);

  function tryWithdraw() {
    if (balance < MIN_WITHDRAW) {
      toast.warning(`Saldo minimum ${formatRupiah(MIN_WITHDRAW)} untuk tarik`);
      return;
    }
    router.push('/cleaner/withdraw');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <LinearGradient colors={['#1E3A8A', '#047857', '#0E7490']} style={{ paddingBottom: 70 }}>
          <SafeAreaView edges={['top']}>
            <View className="flex-row items-center px-3 py-2">
              <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
                <ArrowLeft color="white" size={22} />
              </Pressable>
              <Text className="font-bold ml-1 text-base text-white">Wallet Cleaner</Text>
            </View>
            <View className="px-5 pb-3 pt-2">
              <Text className="font-medium text-xs text-white/70">Saldo Bisa Ditarik</Text>
              <Text className="font-bold mt-1 text-3xl text-white">{formatRupiah(balance)}</Text>
              {escrowPending > 0 && (
                <Text className="font-medium mt-1 text-[11px] text-amber-200">
                  Escrow {formatRupiah(escrowPending)} - cair otomatis 24 jam setelah job selesai
                </Text>
              )}
              {pending > 0 && (
                <Text className="font-medium mt-1 text-[11px] text-amber-200">
                  ⏳ {formatRupiah(pending)} dalam proses penarikan
                </Text>
              )}
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          style={{ marginTop: -55 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#1D4ED8" />}
        >
          {/* CTA Tarik */}
          <Pressable
            onPress={tryWithdraw}
            className="overflow-hidden rounded-2xl"
            style={{ elevation: 4 }}
          >
            <LinearGradient colors={['#1D4ED8', '#0E7490']} style={{ padding: 16 }}>
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <ArrowDownToLine color="white" size={22} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-sm text-white">Tarik Saldo</Text>
                  <Text className="font-sans mt-0.5 text-[11px] text-white/85">
                    Min {formatRupiah(MIN_WITHDRAW)} · auto-transfer ke rekening
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </Pressable>

          {/* Kelola Rekening */}
          <Pressable
            onPress={() => router.push('/cleaner/bank-accounts')}
            className="mt-2 bg-white border border-ink-100 rounded-xl px-4 py-3 flex-row items-center gap-3"
          >
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
              <Text style={{ fontSize: 18 }}>🏦</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink-900">Kelola Rekening Bank</Text>
              <Text className="text-[11px] text-ink-500 mt-0.5">Tambah & verify rekening untuk auto-transfer</Text>
            </View>
            <Text className="text-blue-600 font-bold">›</Text>
          </Pressable>

          {/* Tip Insights — motivasi cleaner */}
          {tipInsights.monthCount > 0 && (() => {
            const diff = tipInsights.monthTotal - tipInsights.prevMonthTotal;
            const pct = tipInsights.prevMonthTotal > 0 ? Math.round((diff / tipInsights.prevMonthTotal) * 100) : 0;
            const avgTip = tipInsights.monthCount > 0 ? Math.round(tipInsights.monthTotal / tipInsights.monthCount) : 0;
            const monthName = new Date().toLocaleDateString('id-ID', { month: 'long' });
            return (
              <View className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <View className="flex-row items-center gap-2">
                  <Text className="text-base">🎁</Text>
                  <Text className="font-bold text-[12px] uppercase tracking-wider text-amber-900">Tip {monthName}</Text>
                </View>
                <Text className="font-extrabold mt-1 text-2xl text-amber-900">{formatRupiah(tipInsights.monthTotal)}</Text>
                <View className="mt-1 flex-row items-center gap-3">
                  <Text className="font-medium text-[11px] text-amber-700">{tipInsights.monthCount} tip dari customer</Text>
                  {avgTip > 0 && <Text className="font-medium text-[11px] text-amber-700">· Avg {formatRupiah(avgTip)}</Text>}
                </View>
                {tipInsights.prevMonthTotal > 0 && (
                  <Text className={`font-bold mt-2 text-[11px] ${diff >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {diff >= 0 ? '↑' : '↓'} {Math.abs(pct)}% vs bulan lalu ({formatRupiah(tipInsights.prevMonthTotal)})
                  </Text>
                )}
              </View>
            );
          })()}

          {/* Stats */}
          <View className="mt-3 flex-row gap-2">
            <View className="flex-1 rounded-2xl bg-white p-3">
              <View className="flex-row items-center gap-1">
                <TrendingUp color="#10B981" size={12} strokeWidth={2.4} />
                <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">
                  Total Earning
                </Text>
              </View>
              <Text className="font-bold mt-1 text-base text-success">
                {formatRupiah(totalEarning)}
              </Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white p-3">
              <View className="flex-row items-center gap-1">
                <ArrowDownToLine color="#1D4ED8" size={12} strokeWidth={2.4} />
                <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">
                  Total Tarik
                </Text>
              </View>
              <Text className="font-bold mt-1 text-base text-brand-700">
                {formatRupiah(totalWithdraw)}
              </Text>
            </View>
          </View>

          {/* Riwayat */}
          <Text className="font-bold mt-5 mb-2 text-sm text-ink-900">Riwayat Transaksi</Text>
          {entries.length === 0 ? (
            <View className="items-center rounded-2xl bg-white p-8">
              <Text className="font-semibold text-sm text-ink-700">Belum ada transaksi</Text>
              <Text className="font-sans mt-1 text-center text-xs text-ink-500">
                Earning otomatis masuk saat job kamu selesai
              </Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl bg-white">
              {entries.map((e, i) => (
                <EntryRow key={e.id} entry={e} last={i === entries.length - 1} />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

function EntryRow({ entry, last }: { entry: WalletEntry; last: boolean }) {
  const isCredit = entry.amount > 0;
  let icon = TrendingUp;
  let iconColor = '#10B981';
  let bgColor = '#D1FAE5';
  let statusLabel = '';

  if (entry.type === 'withdrawal_pending') {
    icon = Clock;
    iconColor = '#B45309';
    bgColor = '#FEF3C7';
    statusLabel = 'Diproses';
  } else if (entry.type === 'withdrawal_complete') {
    icon = CheckCircle2;
    iconColor = '#1D4ED8';
    bgColor = '#DBEAFE';
    statusLabel = 'Berhasil';
  } else if (entry.type === 'withdrawal_failed') {
    icon = XCircle;
    iconColor = '#DC2626';
    bgColor = '#FEE2E2';
    statusLabel = 'Gagal';
  }
  const Icon = icon;
  const date = new Date(entry.createdAt).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3 ${
        last ? '' : 'border-b border-ink-100'
      }`}
    >
      <View
        style={{ backgroundColor: bgColor }}
        className="h-9 w-9 items-center justify-center rounded-xl"
      >
        <Icon color={iconColor} size={16} strokeWidth={2.2} />
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-xs text-ink-800" numberOfLines={1}>
          {entry.description}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <Text className="font-sans text-[10px] text-ink-400">{date}</Text>
          {statusLabel && (
            <Text className="font-bold text-[10px]" style={{ color: iconColor }}>
              · {statusLabel}
            </Text>
          )}
        </View>
      </View>
      <Text
        className={`font-bold text-sm ${isCredit ? 'text-success' : 'text-ink-800'}`}
      >
        {isCredit ? '+' : ''}
        {formatRupiah(entry.amount)}
      </Text>
    </View>
  );
}


export default withAuth(withCleanerKyc(CleanerWallet), 'freelancer');

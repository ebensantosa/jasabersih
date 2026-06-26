'use client';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { ArrowDownToLine, CreditCard, Wallet as WalletIcon, ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { withAuth } from '../../src/components/AuthGate';
import { safeBack } from '../../src/lib/safeBack';

type LedgerEntry = {
  id: string;
  accountType: string;
  amount: number;
  referenceType: string;
  referenceId: string | null;
  status: string;
  description: string | null;
  createdAt: string;
};

type WalletData = {
  balance: number;
  creditIn: number;
  creditOut: number;
  minWithdrawal?: number;
  pendingWithdrawalAmount?: number;
  pendingWithdrawalCount?: number;
  notice?: string;
  withdrawable?: boolean;
  ledger: LedgerEntry[];
};

const ACCOUNT_LABEL: Record<string, { label: string; sign: '+' | '-'; color: string }> = {
  refund_credit: { label: 'Refund Pesanan', sign: '+', color: 'text-emerald-600' },
  earnings: { label: 'Komisi Referral', sign: '+', color: 'text-emerald-600' },
  topup: { label: 'Top-up', sign: '+', color: 'text-emerald-600' },
  credit_use: { label: 'Pakai Saldo', sign: '-', color: 'text-ink-700' },
  withdrawal: { label: 'Tarik Saldo', sign: '-', color: 'text-ink-700' },
};

const PAGE_SIZE = 20;

function formatRupiah(n: number) {
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

function WalletScreen() {
  const router = useRouter();
  const [data, setData] = useState<WalletData | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/customer/wallet');
      const d: WalletData = r.data?.data ?? r.data;
      setData(d);
      setLedger(d.ledger ?? []);
      setHasMore((d.ledger?.length ?? 0) >= PAGE_SIZE);
    } catch {
      setData((prev) => prev ?? { balance: 0, creditIn: 0, creditOut: 0, ledger: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); void load(); };

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const r = await api.get(`/customer/wallet/ledger?limit=${PAGE_SIZE}&offset=${ledger.length}`);
      const more: LedgerEntry[] = (r.data?.data ?? r.data) ?? [];
      setLedger((prev) => [...prev, ...more]);
      setHasMore(more.length >= PAGE_SIZE);
    } catch { /* silent */ } finally {
      setLoadingMore(false);
    }
  }

  const minWithdrawal = Number(data?.minWithdrawal ?? 50000);
  const hasPendingWithdrawal = Number(data?.pendingWithdrawalCount ?? 0) > 0;
  const canWithdraw = !!data?.withdrawable && !hasPendingWithdrawal && (data?.balance ?? 0) >= minWithdrawal;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
          <Pressable
            onPress={() => safeBack('/(tabs)/profile')}
            className="h-10 w-10 items-center justify-center -ml-2"
          >
            <ArrowLeft size={22} color="#0F172A" />
          </Pressable>
          <Text className="font-bold text-base text-ink-900">Saldo Saya</Text>
        </View>
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1D4ED8" />}
          >
            <View className="m-4 rounded-2xl bg-brand-600 p-5">
              <View className="flex-row items-center gap-2">
                <WalletIcon color="white" size={18} />
                <Text className="font-semibold text-xs uppercase tracking-wider text-white/80">
                  Saldo tersedia
                </Text>
              </View>
              <Text className="mt-2 font-bold text-3xl text-white">
                {formatRupiah(data?.balance ?? 0)}
              </Text>
              <Text className="mt-1 text-xs text-white/70">
                {data?.notice ?? 'Saldo bisa dipakai untuk pesanan berikutnya'}
              </Text>
              {(data?.pendingWithdrawalAmount ?? 0) > 0 && (
                <Text className="mt-2 text-xs text-amber-200">
                  {formatRupiah(data?.pendingWithdrawalAmount ?? 0)} sedang diproses untuk penarikan
                </Text>
              )}
            </View>

            <View className="mx-4 mb-3 flex-row gap-2">
              <Pressable
                onPress={() => router.push('/account/withdraw')}
                disabled={!canWithdraw}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 ${canWithdraw ? 'bg-blue-600' : 'bg-ink-300'}`}
              >
                <ArrowDownToLine color="white" size={16} />
                <Text className="text-sm font-bold text-white">Tarik Saldo</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/account/bank-accounts')}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white py-3"
              >
                <CreditCard color="#1D4ED8" size={16} />
                <Text className="text-sm font-bold text-brand-700">Kelola Rekening</Text>
              </Pressable>
            </View>

            <View className="mx-4 mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <Text className="text-xs font-medium leading-5 text-blue-900">
                Minimum penarikan saldo adalah <Text className="font-bold">Rp 50.000</Text>.
              </Text>
            </View>

            <View className="mx-4 mb-4 rounded-2xl bg-white p-4">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Ringkasan</Text>
              <View className="mt-3 gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-ink-600">Saldo Masuk</Text>
                  <Text className="text-sm font-bold text-emerald-600">{formatRupiah(data?.creditIn ?? 0)}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-ink-600">Saldo Keluar</Text>
                  <Text className="text-sm font-bold text-ink-800">{formatRupiah(data?.creditOut ?? 0)}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-ink-600">Minimum Penarikan</Text>
                  <Text className="text-sm font-bold text-ink-900">{formatRupiah(minWithdrawal)}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-ink-600">Penarikan Diproses</Text>
                  <Text className="text-sm font-bold text-ink-900">{Number(data?.pendingWithdrawalCount ?? 0)} transaksi</Text>
                </View>
              </View>
            </View>

            <View className="mx-4 mb-3 flex-row items-center justify-between">
              <Text className="font-semibold text-xs uppercase tracking-wider text-ink-500">
                Riwayat Transaksi
              </Text>
              <Text className="text-[10px] text-ink-400">{ledger.length} transaksi</Text>
            </View>

            {ledger.length === 0 ? (
              <View className="mx-4 items-center rounded-2xl bg-white p-6">
                <Text className="text-sm text-ink-500">Belum ada transaksi saldo</Text>
              </View>
            ) : (
              <View className="mx-4 rounded-2xl bg-white">
                {ledger.map((e, i) => {
                  const meta = ACCOUNT_LABEL[e.accountType] ?? {
                    label: e.accountType,
                    sign: '+' as const,
                    color: 'text-ink-700',
                  };
                  return (
                    <View
                      key={e.id}
                      className={`flex-row items-center justify-between p-4 ${i > 0 ? 'border-t border-ink-100' : ''}`}
                    >
                      <View className="flex-1 pr-3">
                        <Text className="font-semibold text-sm text-ink-900">{meta.label}</Text>
                        <Text className="mt-0.5 text-[11px] text-ink-500" numberOfLines={2}>
                          {e.description ?? '-'}
                        </Text>
                        <Text className="mt-0.5 text-[10px] text-ink-400">
                          {new Date(e.createdAt).toLocaleString('id-ID')}
                        </Text>
                      </View>
                      <Text className={`font-bold text-sm ${meta.color}`}>
                        {meta.sign}{formatRupiah(e.amount)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Load More */}
            {ledger.length > 0 && (
              <View className="mx-4 mt-3 mb-2">
                {hasMore ? (
                  <Pressable
                    onPress={loadMore}
                    disabled={loadingMore}
                    className="items-center rounded-xl border border-ink-200 bg-white py-3"
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color="#1D4ED8" />
                    ) : (
                      <Text className="text-sm font-semibold text-brand-600">Muat Lebih Banyak</Text>
                    )}
                  </Pressable>
                ) : (
                  <Text className="text-center text-[11px] text-ink-400">Semua transaksi sudah ditampilkan</Text>
                )}
              </View>
            )}

            <View className="h-8" />
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

export default withAuth(WalletScreen, 'customer');

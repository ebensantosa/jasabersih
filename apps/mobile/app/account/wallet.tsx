import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Wallet as WalletIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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
  ledger: LedgerEntry[];
};

const ACCOUNT_LABEL: Record<string, { label: string; sign: '+' | '-'; color: string }> = {
  refund_credit: { label: 'Refund Pesanan', sign: '+', color: 'text-emerald-600' },
  topup: { label: 'Top-up', sign: '+', color: 'text-emerald-600' },
  credit_use: { label: 'Pakai Saldo', sign: '-', color: 'text-ink-700' },
  withdrawal: { label: 'Tarik Saldo', sign: '-', color: 'text-ink-700' },
};

function formatRupiah(n: number) {
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

function WalletScreen() {
  const router = useRouter();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const r = await api.get('/customer/wallet');
      setData(r.data?.data ?? r.data);
    } catch {
      setData((prev) => prev ?? { balance: 0, creditIn: 0, creditOut: 0, ledger: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);
  const onRefresh = () => { setRefreshing(true); void load(); };

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
                Saldo bisa dipakai untuk pesanan berikutnya
              </Text>
            </View>

            <View className="mx-4 mb-3">
              <Text className="font-semibold text-xs uppercase tracking-wider text-ink-500">
                Riwayat Transaksi
              </Text>
            </View>

            {(data?.ledger ?? []).length === 0 ? (
              <View className="mx-4 items-center rounded-2xl bg-white p-6">
                <Text className="text-sm text-ink-500">Belum ada transaksi saldo</Text>
              </View>
            ) : (
              <View className="mx-4 rounded-2xl bg-white">
                {(data?.ledger ?? []).map((e, i) => {
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
                        {meta.sign}
                        {formatRupiah(e.amount)}
                      </Text>
                    </View>
                  );
                })}
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

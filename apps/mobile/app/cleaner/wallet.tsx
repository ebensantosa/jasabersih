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
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../../src/data/catalog';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useCleanerWalletStore, MIN_WITHDRAW, type WalletEntry } from '../../src/stores/cleanerWallet';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';

function CleanerWallet() {
  const router = useRouter();
  const entries = useCleanerWalletStore((s) => s.entries);
  const balance = useCleanerWalletStore((s) => s.balance());
  const pending = useCleanerWalletStore((s) => s.pendingTotal());
  const bringsTools = useCleanerStore((s) => s.bringsTools);

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
        <LinearGradient colors={['#0B2A6F', '#1D4ED8']} style={{ paddingBottom: 70 }}>
          <SafeAreaView edges={['top']}>
            <View className="flex-row items-center px-3 py-2">
              <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
                <ArrowLeft color="white" size={22} />
              </Pressable>
              <Text className="font-bold ml-1 text-base text-white">Wallet Cleaner</Text>
            </View>
            <View className="px-5 pb-3 pt-2">
              <Text className="font-medium text-xs text-white/70">Saldo Bisa Ditarik</Text>
              <Text className="font-bold mt-1 text-3xl text-white">{formatRupiah(balance)}</Text>
              {pending > 0 && (
                <Text className="font-medium mt-1 text-[11px] text-amber-200">
                  â³ {formatRupiah(pending)} dalam proses penarikan
                </Text>
              )}
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} style={{ marginTop: -55 }}>
          {/* CTA Tarik */}
          <Pressable
            onPress={tryWithdraw}
            className="overflow-hidden rounded-2xl"
            style={{ elevation: 4 }}
          >
            <LinearGradient colors={['#1D4ED8', '#2563EB']} style={{ padding: 16 }}>
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <ArrowDownToLine color="white" size={22} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-sm text-white">Tarik Saldo</Text>
                  <Text className="font-sans mt-0.5 text-[11px] text-white/85">
                    Min {formatRupiah(MIN_WITHDRAW)} Â· ke bank / e-wallet
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </Pressable>

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

          {/* Info komisi */}
          <View className="mt-3 rounded-2xl bg-white p-3">
            <Text className="font-bold text-xs text-ink-900">
              ðŸ’¡ Skema Komisi (Mode: {bringsTools ? 'Bawa Alat' : 'Tanpa Alat'})
            </Text>
            <View className="mt-2 gap-1">
              <Row label="Order < Rp 300.000" value={bringsTools ? '60%' : '40%'} />
              <Row label="Order Rp 300.000 â€“ 600.000" value={bringsTools ? '55%' : '40%'} />
              <Row label="Order > Rp 600.000" value={bringsTools ? '50%' : '40%'} />
            </View>
            <Text className="font-sans mt-2 text-[10px] text-ink-500">
              Ubah mode "Bawa Alat / Tanpa Alat" di Job Board.
            </Text>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="font-sans text-[11px] text-ink-600">{label}</Text>
      <Text className="font-bold text-[11px] text-brand-700">{value}</Text>
    </View>
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
              Â· {statusLabel}
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


export default withAuth(CleanerWallet, 'freelancer');

import { useFocusEffect, useRouter } from 'expo-router';
import { Briefcase, Calendar, ChevronRight, MapPin, Power, RefreshCw, Settings, Wallet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { formatRupiah } from '../../src/data/catalog';
import { calculateCleanerEarning, calculateCleanerShare } from '../../src/stores/cleanerWallet';
import { useCleanerStore } from '../../src/stores/cleaner';
import { toast } from '../../src/stores/ui';

type AvailableJob = {
  id: string;
  pricingMode: string;
  addressLine: string;
  scheduledAt: string;
  totalAmount: number;
  cleanerPayout: number | null;
  serviceName: string | null;
};

type ActiveJob = {
  id: string;
  status: string;
  serviceName: string | null;
  scheduledAt: string;
  totalAmount: number;
};

export default function Jobs() {
  const router = useRouter();

  const [available, setAvailable] = useState<AvailableJob[]>([]);
  const [active, setActive] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [a, ac] = await Promise.all([
        api.get('/cleaner/jobs/available'),
        api.get('/cleaner/jobs/active'),
      ]);
      setAvailable(((a.data?.data ?? []) as any[]).map((j: any) => ({ ...j, totalAmount: Number(j.totalAmount), cleanerPayout: j.cleanerPayout ? Number(j.cleanerPayout) : null })));
      setActive(((ac.data?.data ?? []) as any[]).map((j: any) => ({ ...j, totalAmount: Number(j.totalAmount) })));
    } catch {
      // silent
    } finally { setLoading(false); }
  }

  useFocusEffect(useCallback(() => { void load(); }, []));

  function toggleOnline() {
    setOnline((v) => {
      const next = !v;
      api.patch('/cleaner/profile', { isAvailable: next }).catch(() => {});
      toast.success(next ? 'Status: Online — siap terima job' : 'Status: Offline');
      return next;
    });
  }

  async function accept(id: string) {
    try {
      await api.post(`/cleaner/jobs/${id}/accept`);
      toast.success('Job berhasil diambil!');
      void load();
      router.push({ pathname: '/booking/[id]', params: { id } });
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal accept');
      void load();
    }
  }

  return (
    <View className="flex-1 bg-ink-50">
      <SafeAreaView edges={['top']} className="bg-white">
        <View className="border-b border-ink-100 px-4 pb-3 pt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-bold text-xl text-ink-900">Job Board</Text>
              <Text className="font-sans mt-0.5 text-xs text-ink-500">{available.length} job tersedia</Text>
            </View>
            <Pressable onPress={() => router.push('/cleaner/areas')} className="flex-row items-center gap-1 rounded-full bg-brand-50 px-3 py-2">
              <Settings color="#1D4ED8" size={14} strokeWidth={2.4} />
              <Text className="font-semibold text-xs text-brand-700">Area</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={toggleOnline}
            className={`mt-3 flex-row items-center gap-2 rounded-xl border p-2.5 ${online ? 'border-success bg-emerald-50' : 'border-ink-200 bg-white'}`}
          >
            <View className={`h-9 w-9 items-center justify-center rounded-xl ${online ? 'bg-success' : 'bg-ink-200'}`}>
              <Power color="white" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-xs text-ink-900">{online ? 'Online' : 'Offline'}</Text>
              <Text className="font-medium text-[10px] text-ink-500">
                {online ? 'Siap terima job realtime' : 'Tidak akan terima notif job baru'}
              </Text>
            </View>
            <View className={`h-6 w-11 rounded-full p-0.5 ${online ? 'bg-success' : 'bg-ink-300'}`}>
              <View className={`h-5 w-5 rounded-full bg-white ${online ? 'self-end' : 'self-start'}`} />
            </View>
          </Pressable>

        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        {active.length > 0 && (
          <View className="mb-3 rounded-2xl p-3" style={{ backgroundColor: '#D1FAE5' }}>
            <Text className="font-semibold text-[11px] uppercase tracking-wider" style={{ color: '#047857' }}>
              🔥 Job Aktif ({active.length})
            </Text>
            <View className="mt-2 gap-2">
              {active.map((j) => (
                <Pressable
                  key={j.id}
                  onPress={() => router.push({ pathname: '/booking/[id]', params: { id: j.id } })}
                  className="flex-row items-center gap-2 rounded-xl bg-white p-3"
                >
                  <View className="flex-1">
                    <Text className="font-semibold text-sm text-ink-900">{j.serviceName ?? '—'}</Text>
                    <Text className="font-medium text-[11px]" style={{ color: '#047857' }}>
                      {j.status === 'matched' ? 'Dijadwalkan' :
                       j.status === 'on_the_way' || j.status === 'cleaner_otw' ? 'Otw lokasi' :
                       j.status === 'in_progress' || j.status === 'started' ? 'Sedang dikerjakan' : j.status}
                    </Text>
                    <Text className="font-sans mt-0.5 text-[10px] text-ink-500">
                      {new Date(j.scheduledAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-bold text-sm text-ink-900">{formatRupiah(j.totalAmount)}</Text>
                    <ChevronRight color="#94A3B8" size={14} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {loading && available.length === 0 ? (
          <View className="items-center justify-center py-20"><ActivityIndicator color="#1D4ED8" /></View>
        ) : available.length === 0 ? (
          <View className="items-center justify-center py-16">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
              <Briefcase color="#1D4ED8" size={36} strokeWidth={2} />
            </View>
            <Text className="font-bold mt-4 text-lg text-ink-900">Belum ada job</Text>
            <Text className="font-sans mt-1 text-center text-sm text-ink-500">
              {online ? 'Cek kembali nanti — job baru akan muncul otomatis.' : 'Aktifkan Online dulu untuk terima job.'}
            </Text>
            <Pressable onPress={() => void load()} className="mt-4 flex-row items-center gap-1 rounded-lg bg-brand-50 px-4 py-2">
              <RefreshCw color="#1D4ED8" size={14} />
              <Text className="font-semibold text-xs text-brand-700">Refresh</Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-3">
            {available.map((b) => {
              const earning = b.cleanerPayout ?? calculateCleanerEarning(b.totalAmount, bringsTools);
              const sharePct = Math.round(calculateCleanerShare(b.totalAmount, bringsTools) * 100);
              return (
                <View key={b.id} className="rounded-2xl bg-white p-3">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <Text className="font-semibold text-sm text-ink-900">{b.serviceName ?? 'Layanan'}</Text>
                      <Text className="font-medium text-[11px] text-brand-600">
                        {b.pricingMode === 'package' ? 'Paket Tetap' : b.pricingMode === 'hourly' ? 'Per Jam' : b.pricingMode}
                      </Text>
                    </View>
                    <Text className="font-bold text-sm text-ink-900">{formatRupiah(b.totalAmount)}</Text>
                  </View>
                  <View className="mt-2 flex-row items-center gap-1">
                    <Calendar color="#94A3B8" size={11} />
                    <Text className="font-sans text-[11px] text-ink-500">
                      {new Date(b.scheduledAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View className="mt-0.5 flex-row items-start gap-1">
                    <MapPin color="#94A3B8" size={11} style={{ marginTop: 2 }} />
                    <Text className="font-sans flex-1 text-[11px] text-ink-500" numberOfLines={2}>{b.addressLine}</Text>
                  </View>

                  <View className="mt-3 flex-row gap-2 border-t border-ink-100 pt-3">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1">
                        <Wallet color="#047857" size={12} />
                        <Text className="font-sans text-[10px] text-ink-500">Kamu dapat</Text>
                      </View>
                      <View className="flex-row items-baseline gap-1">
                        <Text className="font-bold text-base text-success">{formatRupiah(earning)}</Text>
                        <Text className="font-medium text-[10px] text-ink-500">({sharePct}%{bringsTools ? ' · alat' : ''})</Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => accept(b.id)}
                      className="flex-row items-center gap-1 rounded-xl bg-brand-600 px-4 py-2"
                    >
                      <Text className="font-bold text-xs text-white">Ambil Job</Text>
                      <ChevronRight color="white" size={14} strokeWidth={2.4} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

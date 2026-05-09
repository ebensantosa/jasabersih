import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Copy, Tag } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';

type Available = {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  validUntil: string;
};

type Used = {
  id: string;
  code: string;
  type: string;
  value: number;
  discountAmount: number;
  usedAt: string;
  bookingId: string | null;
};

function VouchersScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'available' | 'used'>('available');
  const [available, setAvailable] = useState<Available[]>([]);
  const [used, setUsed] = useState<Used[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([
        api.get('/vouchers/available'),
        api.get('/vouchers/my-history'),
      ]);
      setAvailable(((a.data?.data ?? []) as any[]).map((v: any) => ({ ...v, value: Number(v.value), maxDiscount: v.maxDiscount ? Number(v.maxDiscount) : null, minOrder: Number(v.minOrder ?? 0) })));
      setUsed(((u.data?.data ?? []) as any[]).map((v: any) => ({ ...v, value: Number(v.value), discountAmount: Number(v.discountAmount) })));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal load');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function copyCode(code: string) {
    await Clipboard.setStringAsync(code);
    toast.success(`Kode ${code} disalin`);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">Voucher Saya</Text>
        </View>

        <View className="flex-row gap-1 border-b border-ink-100 bg-white px-2">
          <TabBtn label={`Tersedia (${available.length})`} active={tab === 'available'} onPress={() => setTab('available')} />
          <TabBtn label={`Riwayat (${used.length})`} active={tab === 'used'} onPress={() => setTab('used')} />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1D4ED8" /></View>
        ) : tab === 'available' ? (
          available.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Tag color="#94A3B8" size={40} />
              <Text className="font-bold mt-3 text-base text-ink-900">Belum ada voucher tersedia</Text>
              <Text className="font-sans mt-1 text-center text-xs text-ink-500">Cek lagi nanti â€” promo baru muncul tiap minggu.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {available.map((v) => (
                <View key={v.id} className="rounded-2xl bg-white p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-bold text-lg text-brand-700">
                        {v.type === 'percentage' ? `${v.value}% OFF` : `Rp ${v.value.toLocaleString('id-ID')} OFF`}
                      </Text>
                      <Text className="font-sans text-[11px] text-ink-500">
                        Min order Rp {v.minOrder.toLocaleString('id-ID')}{v.maxDiscount ? ` Â· max diskon Rp ${v.maxDiscount.toLocaleString('id-ID')}` : ''}
                      </Text>
                    </View>
                    <Pressable onPress={() => copyCode(v.code)} className="rounded-lg bg-brand-50 px-3 py-2">
                      <View className="flex-row items-center gap-1">
                        <Copy color="#1D4ED8" size={12} />
                        <Text className="font-bold text-xs text-brand-700">{v.code}</Text>
                      </View>
                    </Pressable>
                  </View>
                  <Text className="font-sans mt-2 text-[10px] text-ink-400">
                    Berlaku sampai {new Date(v.validUntil).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )
        ) : used.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Tag color="#94A3B8" size={40} />
            <Text className="font-bold mt-3 text-base text-ink-900">Belum pakai voucher</Text>
            <Text className="font-sans mt-1 text-center text-xs text-ink-500">Apply kode di checkout untuk dapat diskon.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            {used.map((v) => (
              <View key={v.id} className="flex-row items-center gap-3 rounded-xl bg-white p-3">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
                  <Tag color="#1D4ED8" size={16} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-sm text-ink-900">{v.code}</Text>
                  <Text className="font-sans text-[11px] text-ink-500">
                    {new Date(v.usedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <Text className="font-bold text-sm text-success">-Rp {v.discountAmount.toLocaleString('id-ID')}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`px-4 py-2 ${active ? 'border-b-2 border-brand-600' : ''}`}>
      <Text className={`font-semibold text-sm ${active ? 'text-brand-700' : 'text-ink-500'}`}>{label}</Text>
    </Pressable>
  );
}


export default withAuth(VouchersScreen, 'customer');

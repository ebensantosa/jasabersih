import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Copy, Gift, Share2, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { toast } from '../../src/stores/ui';

type Me = {
  code: string;
  shareUrl: string;
  shareText: string;
  totalReferrals: number;
  totalPaid: number;
  stats: { pending: number; qualified: number; paid: number };
};

type HistoryItem = {
  id: string;
  referredId: string;
  referredName: string | null;
  referredPhone: string | null;
  status: string;
  bonusAmount: number | null;
  qualifiedAt: string | null;
  createdAt: string;
};

export default function ReferralScreen() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [m, h] = await Promise.all([api.get('/referral/me'), api.get('/referral/history')]);
      setMe((m.data?.data ?? m.data) as Me);
      setHistory((h.data?.data ?? []) as HistoryItem[]);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal load');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function copyCode() {
    if (!me) return;
    await Clipboard.setStringAsync(me.code);
    toast.success('Kode disalin');
  }

  async function shareCode() {
    if (!me) return;
    try {
      await Share.share({ message: me.shareText + '\n\n' + me.shareUrl, title: 'Kode Referral JasaBersih' });
    } catch {}
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">Referral & Bonus</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1D4ED8" /></View>
        ) : !me ? (
          <View className="flex-1 items-center justify-center"><Text className="font-sans text-ink-500">Tidak tersedia.</Text></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* Hero */}
            <View className="rounded-2xl bg-brand-700 p-5">
              <View className="flex-row items-center gap-2">
                <Gift color="#FACC15" size={20} />
                <Text className="font-bold text-base text-white">Ajak Teman, Dapat Bonus!</Text>
              </View>
              <Text className="font-sans mt-1 text-xs text-white/80">
                Setiap teman yang pakai kodemu untuk order pertama, kamu dapat <Text className="font-bold text-white">Rp 25.000</Text> masuk wallet.
              </Text>

              <View className="mt-4 rounded-xl bg-white p-3">
                <Text className="font-sans text-[11px] text-ink-500">Kode kamu</Text>
                <View className="mt-1 flex-row items-center justify-between">
                  <Text className="font-bold text-2xl tracking-widest text-brand-700">{me.code}</Text>
                  <Pressable onPress={copyCode} className="flex-row items-center gap-1 rounded-lg bg-brand-50 px-3 py-2">
                    <Copy color="#1D4ED8" size={14} />
                    <Text className="font-semibold text-xs text-brand-700">Salin</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={shareCode}
                className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-white py-3"
              >
                <Share2 color="#1D4ED8" size={16} />
                <Text className="font-bold text-sm text-brand-700">Bagikan Kode</Text>
              </Pressable>
            </View>

            {/* Stats */}
            <View className="flex-row gap-2">
              <StatCard label="Total Teman" value={String(me.totalReferrals)} color="#1D4ED8" />
              <StatCard label="Total Bonus" value={`Rp ${Number(me.totalPaid).toLocaleString('id-ID')}`} color="#047857" />
            </View>
            <View className="flex-row gap-2">
              <StatCard label="Pending" value={String(me.stats.pending)} color="#B45309" />
              <StatCard label="Qualified" value={String(me.stats.qualified)} color="#1D4ED8" />
              <StatCard label="Paid" value={String(me.stats.paid)} color="#047857" />
            </View>

            {/* How it works */}
            <View className="rounded-xl bg-white p-4">
              <Text className="font-bold text-sm text-ink-900">Cara Kerja</Text>
              <View className="mt-2 space-y-1.5">
                <Text className="font-sans text-xs text-ink-700">1. Bagikan kodemu ke teman/saudara</Text>
                <Text className="font-sans text-xs text-ink-700">2. Teman pakai kodemu saat daftar/booking pertama</Text>
                <Text className="font-sans text-xs text-ink-700">3. Setelah teman selesai order pertama → bonus Rp 25K masuk wallet kamu</Text>
                <Text className="font-sans text-xs text-ink-700">4. Bonus bisa langsung kamu tarik (min Rp 50.000)</Text>
              </View>
            </View>

            {/* History */}
            <View className="rounded-xl bg-white p-4">
              <View className="flex-row items-center gap-2">
                <Users color="#0F172A" size={16} />
                <Text className="font-bold text-sm text-ink-900">Riwayat Referral ({history.length})</Text>
              </View>
              {history.length === 0 ? (
                <Text className="font-sans mt-3 text-center text-xs text-ink-500">Belum ada teman pakai kodemu.</Text>
              ) : (
                <View className="mt-3 space-y-2">
                  {history.map((h) => (
                    <View key={h.id} className="flex-row items-center justify-between border-t border-ink-100 pt-2">
                      <View className="flex-1">
                        <Text className="font-medium text-sm text-ink-900">{h.referredName ?? '—'}</Text>
                        <Text className="font-sans text-[11px] text-ink-500">
                          {new Date(h.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                      <View>
                        <StatusBadge status={h.status} />
                        {h.bonusAmount && <Text className="font-bold mt-0.5 text-right text-xs text-success">+Rp {Number(h.bonusAmount).toLocaleString('id-ID')}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="flex-1 rounded-xl bg-white p-3">
      <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">{label}</Text>
      <Text style={{ color }} className="font-bold mt-1 text-lg">{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'menunggu' },
    qualified: { bg: '#DBEAFE', color: '#1D4ED8', label: 'qualified' },
    paid: { bg: '#D1FAE5', color: '#047857', label: 'paid ✓' },
  };
  const c = cfg[status] ?? cfg.pending!;
  return (
    <View style={{ backgroundColor: c.bg }} className="rounded-full px-2 py-0.5">
      <Text style={{ color: c.color }} className="font-bold text-[10px]">{c.label}</Text>
    </View>
  );
}

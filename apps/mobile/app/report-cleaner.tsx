import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../src/lib/api';
import { toast } from '../src/stores/ui';
import { withAuth } from '../src/components/AuthGate';
import { safeBack } from '../src/lib/safeBack';

const CATEGORIES: { code: string; label: string; example: string }[] = [
  { code: 'ask_phone', label: 'Minta nomor HP / WA pribadi', example: 'Cleaner minta WA untuk komunikasi langsung' },
  { code: 'ask_payment_outside', label: 'Ajak transfer di luar app', example: 'Bayar via DANA/transfer bank langsung ke rekening cleaner' },
  { code: 'inappropriate', label: 'Perilaku tidak pantas', example: 'Pelecehan, kasar, ancaman' },
  { code: 'other', label: 'Lainnya', example: 'Jelaskan di kolom catatan' },
];

function ReportCleanerScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!category) { toast.error('Pilih kategori dulu'); return; }
    if (!bookingId) { toast.error('Booking ID kosong'); return; }
    setBusy(true);
    try {
      await api.post('/reports/fraud', { bookingId, category, description: description.trim() || undefined });
      setDone(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim laporan');
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
          <View className="flex-1 items-center justify-center px-8">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 color="#047857" size={48} />
            </View>
            <Text className="font-bold mt-4 text-center text-lg text-ink-900">Laporan Terkirim</Text>
            <Text className="font-sans mt-2 text-center text-sm text-ink-600">
              Tim kami akan review dalam 1–3 hari. Kalau valid, kamu dapat <Text className="font-bold">voucher Rp 50.000</Text> via notifikasi.
            </Text>
            <Pressable onPress={() => safeBack()} className="mt-8 rounded-2xl bg-brand-600 px-6 py-3">
              <Text className="font-bold text-white">Kembali</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold text-base text-ink-900">Lapor Cleaner</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View className="rounded-2xl bg-amber-50 p-4">
            <View className="flex-row items-start gap-2">
              <ShieldAlert color="#B45309" size={18} />
              <View className="flex-1">
                <Text className="font-bold text-sm text-amber-900">Dapat voucher Rp 50.000</Text>
                <Text className="font-sans mt-1 text-[11px] leading-4 text-amber-900">
                  Lapor cleaner yang melanggar aturan platform. Setelah admin verifikasi, voucher otomatis masuk ke akunmu.
                </Text>
              </View>
            </View>
          </View>

          <View className="rounded-2xl bg-white p-4">
            <Text className="font-bold mb-3 text-sm text-ink-900">Kategori Pelanggaran</Text>
            <View className="gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c.code;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => setCategory(c.code)}
                    className={`flex-row items-start gap-3 rounded-xl border p-3 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                  >
                    <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full border-2 ${active ? 'border-brand-600 bg-brand-600' : 'border-ink-300'}`}>
                      {active && <View className="h-2 w-2 rounded-full bg-white" />}
                    </View>
                    <View className="flex-1">
                      <Text className={`font-bold text-sm ${active ? 'text-brand-700' : 'text-ink-900'}`}>{c.label}</Text>
                      <Text className="font-sans mt-0.5 text-[11px] text-ink-500">{c.example}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="rounded-2xl bg-white p-4">
            <Text className="font-bold mb-2 text-sm text-ink-900">Catatan / Detail</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Jelaskan apa yang terjadi (opsional, makin lengkap makin gampang di-verify)"
              multiline
              numberOfLines={4}
              className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 font-sans text-sm text-ink-900"
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
          </View>

          <Pressable
            disabled={busy || !category}
            onPress={submit}
            className={`items-center rounded-2xl py-4 ${busy || !category ? 'bg-ink-300' : 'bg-red-600'}`}
          >
            {busy ? <ActivityIndicator color="white" /> : <Text className="font-bold text-sm text-white">Kirim Laporan</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

export default withAuth(ReportCleanerScreen, 'customer');

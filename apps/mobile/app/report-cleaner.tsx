import { Stack, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withAuth } from '../src/components/AuthGate';
import { safeBack } from '../src/lib/safeBack';
import { api } from '../src/lib/api';
import { toast } from '../src/stores/ui';

const CATEGORIES: { code: string; label: string; example: string }[] = [
  { code: 'ask_phone', label: 'Minta nomor HP atau WhatsApp pribadi', example: 'Cleaner meminta nomor pribadi untuk komunikasi di luar aplikasi' },
  { code: 'ask_payment_outside', label: 'Ajak transfer di luar aplikasi', example: 'Bayar melalui transfer bank atau e-wallet pribadi di luar sistem' },
  { code: 'inappropriate', label: 'Perilaku tidak pantas', example: 'Pelecehan, kata-kata kasar, ancaman, atau sikap tidak sopan' },
  { code: 'other', label: 'Lainnya', example: 'Jelaskan di kolom catatan' },
];

function ReportCleanerScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!category) {
      toast.error('Pilih kategori dulu.');
      return;
    }
    if (!bookingId) {
      toast.error('Booking ID kosong.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/reports/fraud', { bookingId, category, description: description.trim() || undefined });
      setDone(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal mengirim laporan');
    } finally {
      setBusy(false);
    }
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
              Tim kami akan meninjau laporan ini dalam 1-3 hari kerja. Jika valid, kamu akan menerima <Text className="font-bold">voucher Rp 50.000</Text> lewat notifikasi.
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
                <Text className="font-bold text-sm text-amber-900">Voucher Rp 50.000</Text>
                <Text className="font-sans mt-1 text-[11px] leading-4 text-amber-900">
                  Laporkan jika cleaner melanggar aturan platform. Setelah admin memverifikasi, voucher akan masuk ke akunmu.
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
            <Text className="font-bold mb-1 text-sm text-ink-900">Detail Kronologi</Text>
            <Text className="font-sans mb-2 text-[11px] leading-4 text-ink-500">
              Format yang disarankan:
              {'\n'}- Kapan kejadian terjadi
              {'\n'}- Apa yang dikatakan cleaner atau customer
              {'\n'}- Apa yang kamu lakukan atau minta
              {'\n'}- Bukti pendukung seperti screenshot atau foto
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={'Kronologi singkat\n\nWaktu: ...\nLokasi: ...\nKejadian: ...\nBukti: ...'}
              multiline
              numberOfLines={6}
              maxLength={1000}
              className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 font-sans text-sm text-ink-900"
              style={{ minHeight: 140, textAlignVertical: 'top' }}
            />
            <Text className="font-medium mt-1 text-[10px] text-ink-400">{description.length} karakter</Text>
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

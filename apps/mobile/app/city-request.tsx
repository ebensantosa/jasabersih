import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Send } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../src/lib/api';
import { useLocationStore } from '../src/stores/location';
import { toast } from '../src/stores/ui';
import { safeBack } from '../src/lib/safeBack';

export default function CityRequestScreen() {
  const router = useRouter();
  const { city: cityParam } = useLocalSearchParams<{ city?: string }>();
  const loc = useLocationStore((s) => s.current);

  const [city, setCity] = useState(cityParam ?? loc?.shortLabel?.split(',').pop()?.trim() ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (city.trim().length < 2) { toast.error('Nama kota wajib'); return; }
    setBusy(true);
    try {
      await api.post('/app/city-requests', {
        city: city.trim(),
        contactName: name.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        lat: loc?.lat,
        lng: loc?.lng,
      });
      setDone(true);
      toast.success('Permintaan dikirim - terima kasih!');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim');
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
              <Send color="#047857" size={40} />
            </View>
            <Text className="font-bold mt-6 text-center text-xl text-ink-900">Terima kasih!</Text>
            <Text className="font-sans mt-2 text-center text-sm text-ink-600">
              Permintaan kamu untuk JasaBersih hadir di <Text className="font-bold">{city}</Text> sudah kami terima.
              Tim kami akan kabari kalau sudah tersedia.
            </Text>
            <Pressable onPress={() => router.replace('/')} className="mt-8 rounded-2xl bg-brand-600 px-6 py-3">
              <Text className="font-bold text-white">Kembali ke Beranda</Text>
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
          <Text className="font-bold text-base text-ink-900">Request Kota Baru</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View className="rounded-2xl bg-amber-50 p-4">
            <View className="flex-row items-start gap-2">
              <MapPin color="#B45309" size={18} />
              <View className="flex-1">
                <Text className="font-bold text-sm text-amber-900">Belum tersedia di kota kamu</Text>
                <Text className="font-sans mt-1 text-[11px] leading-4 text-amber-900">
                  JasaBersih saat ini hanya beroperasi di kota-kota tertentu. Isi form di bawah agar kota kamu jadi prioritas ekspansi kami.
                </Text>
              </View>
            </View>
          </View>

          <View className="rounded-2xl bg-white p-4">
            <Field label="Nama Kota *" value={city} onChange={setCity} placeholder="Misal: Bandung, Surabaya" />
            <Field label="Nama Kamu (opsional)" value={name} onChange={setName} placeholder="Untuk dihubungi balik" />
            <Field label="Nomor HP (opsional)" value={phone} onChange={setPhone} placeholder="08xxxxxxxxxx" keyboardType="phone-pad" />
            <Field label="Catatan (opsional)" value={notes} onChange={setNotes} placeholder="Misal: butuh untuk daerah xxx" multiline />
          </View>

          <Pressable
            disabled={busy}
            onPress={submit}
            className={`flex-row items-center justify-center gap-2 rounded-2xl py-4 ${busy ? 'bg-ink-300' : 'bg-brand-600'}`}
          >
            {busy ? <ActivityIndicator color="white" /> : <Send color="white" size={16} />}
            <Text className="font-bold text-sm text-white">{busy ? 'Mengirim…' : 'Kirim Permintaan'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: any; multiline?: boolean;
}) {
  return (
    <View className="mb-3">
      <Text className="font-medium mb-1 text-[11px] uppercase tracking-wider text-ink-500">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 font-sans text-sm text-ink-900"
        style={multiline ? { minHeight: 70, textAlignVertical: 'top' } : undefined}
      />
    </View>
  );
}

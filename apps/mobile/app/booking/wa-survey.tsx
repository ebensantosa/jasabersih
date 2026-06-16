import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ClipboardList, MapPin, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { WaIcon } from '../../src/components/BrandIcon';
import { validateMinLength } from '../../src/components/Field';
import { SERVICE_CATEGORIES } from '../../src/data/catalog';
import { safeBack } from '../../src/lib/safeBack';
import { useConfig } from '../../src/stores/appContent';
import { useAuthStore } from '../../src/stores/auth';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';
import { useUserStore } from '../../src/stores/user';

const QUICK_TEMPLATES: { label: string; text: string }[] = [
  { label: 'Pasca Renovasi', text: 'Pembersihan pasca renovasi: buang sisa material, debu semen, cat tumpah. ' },
  { label: 'Pasca Banjir', text: 'Pembersihan pasca banjir: lumpur, sanitasi area, cek perabot rusak. ' },
  { label: 'Properti Besar', text: 'Properti besar (villa/ruko 3 lantai). Butuh tim dan estimasi waktu pengerjaan. ' },
  { label: 'B2B / Kantor', text: 'Kebutuhan B2B kantor atau event. Perlu kuotasi formal dan invoice resmi. ' },
  { label: 'Area Khusus', text: 'Area khusus seperti kolam renang, rooftop, atau gudang. Butuh peralatan tambahan. ' },
];

const MIN_DESC = 20;

export default function WaSurvey() {
  const router = useRouter();
  const { category: categoryCode, workers, areaM2, propertyType, bedrooms, bathrooms } = useLocalSearchParams<{
    category?: string;
    workers?: string;
    areaM2?: string;
    propertyType?: string;
    bedrooms?: string;
    bathrooms?: string;
  }>();
  const tokens = useAuthStore((s) => s.tokens);
  const profile = useUserStore((s) => s.profile);
  const waNumber = useConfig('contact.whatsapp', '6285124363374');

  const category = SERVICE_CATEGORIES.find((c) => c.code === categoryCode) ?? SERVICE_CATEGORIES[0];
  const savedLocation = useLocationStore((s) => s.current);

  const [description, setDescription] = useState(() => {
    const parts: string[] = [];
    if (workers && Number(workers) > 1) parts.push(`- Butuh ${workers} petugas cleaner`);
    if (areaM2) parts.push(`- Luas area ${areaM2} m2`);
    if (propertyType) parts.push(`- Tipe properti: ${propertyType}`);
    if (bedrooms && Number(bedrooms) > 0) parts.push(`- ${bedrooms} kamar tidur`);
    if (bathrooms && Number(bathrooms) > 0) parts.push(`- ${bathrooms} kamar mandi`);
    return parts.length > 0 ? `${parts.join('\n')}\n\n` : '';
  });
  const [address, setAddress] = useState(savedLocation?.address ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null,
  );
  const [errors, setErrors] = useState<{ description?: string | null }>({});

  function buildLoginNextPath(): string {
    const params = new URLSearchParams();
    if (category?.code) params.set('category', category.code);
    if (workers) params.set('workers', workers);
    if (areaM2) params.set('areaM2', areaM2);
    if (propertyType) params.set('propertyType', propertyType);
    if (bedrooms) params.set('bedrooms', bedrooms);
    if (bathrooms) params.set('bathrooms', bathrooms);
    const query = params.toString();
    return query ? `/booking/wa-survey?${query}` : '/booking/wa-survey';
  }

  function applyTemplate(text: string): void {
    setDescription((prev) => (prev.endsWith('\n') || prev === '' ? prev + text : `${prev}\n${text}`));
    if (errors.description) setErrors({ description: null });
  }

  function buildWaMessage(): string {
    return [
      'Halo JasaBersih, saya ingin konsultasi via WhatsApp.',
      '',
      `Nama: ${profile?.name?.trim() || '-'}`,
      `No. HP akun: ${profile?.phone?.trim() || '-'}`,
      `Layanan: ${category?.name || '-'}`,
      `Alamat: ${address.trim() || '-'}`,
      '',
      'Deskripsi kebutuhan:',
      description.trim(),
    ].join('\n');
  }

  async function onSubmit(): Promise<void> {
    if (!tokens) {
      toast.warning('Login dulu untuk lanjut');
      router.push({ pathname: '/(auth)/login', params: { next: buildLoginNextPath() } });
      return;
    }

    const nextErrors = {
      description: validateMinLength(description, MIN_DESC, 'Deskripsi'),
    };
    setErrors(nextErrors);
    if (nextErrors.description) {
      toast.error(`Lengkapi deskripsi kebutuhan minimal ${MIN_DESC} karakter`);
      return;
    }

    const msg = encodeURIComponent(buildWaMessage());
    try {
      await Linking.openURL(`https://wa.me/${waNumber}?text=${msg}`);
    } catch {
      toast.error('Tidak bisa membuka WhatsApp');
    }
  }

  const descOk = description.length >= MIN_DESC;
  const descRemaining = Math.max(0, MIN_DESC - description.length);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-brand-700">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
            <View className="ml-1 flex-1">
              <Text className="font-bold text-base text-white">Konsultasi via WhatsApp</Text>
              <Text className="font-medium text-[11px] text-white/70">
                Langsung terhubung ke customer service
              </Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <View className="mx-4 mt-3 overflow-hidden rounded-2xl bg-white">
            <View className="flex-row items-center gap-2 border-b border-ink-100 px-4 py-3">
              <Sparkles color="#1D4ED8" size={16} strokeWidth={2.4} />
              <Text className="font-bold text-sm text-ink-900">Cocok untuk</Text>
            </View>
            <View className="gap-2 p-4">
              {[
                'Properti besar atau kompleks seperti villa dan ruko 3 lantai',
                'Pasca renovasi atau pasca banjir',
                'Kebutuhan B2B, kantor, atau event',
                'Masih bingung memilih paket yang pas',
                'Area khusus seperti kolam, rooftop, atau gudang',
              ].map((item) => (
                <View key={item} className="flex-row items-start gap-2">
                  <View className="mt-0.5 h-4 w-4 items-center justify-center rounded-full bg-brand-100">
                    <Check color="#1D4ED8" size={10} strokeWidth={3} />
                  </View>
                  <Text className="font-sans flex-1 text-xs text-ink-700">{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <ClipboardList color="#1D4ED8" size={14} strokeWidth={2.4} />
              <Text className="font-bold text-sm text-ink-900">Deskripsi Kebutuhan</Text>
            </View>
            <Text className="font-sans mb-3 text-[11px] text-ink-500">
              Nama dan nomor akun kamu akan otomatis ikut terkirim ke WhatsApp customer service.
            </Text>

            <View className="mb-3 flex-row flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((template) => (
                <Pressable
                  key={template.label}
                  onPress={() => applyTemplate(template.text)}
                  className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5"
                >
                  <Text className="font-semibold text-[11px] text-brand-700">+ {template.label}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={description}
              onChangeText={(value) => {
                setDescription(value);
                if (errors.description) {
                  setErrors({ description: validateMinLength(value, MIN_DESC, 'Deskripsi') });
                }
              }}
              multiline
              textAlignVertical="top"
              placeholder={'Contoh:\n- Villa 3 lantai, 250 m2\n- Habis renovasi besar\n- Butuh deep cleaning dan buang sisa material\n- Tersedia akhir pekan pagi'}
              placeholderTextColor="#94A3B8"
              className={`font-sans rounded-xl border bg-ink-50 px-4 py-3 text-sm text-ink-900 ${
                errors.description ? 'border-danger' : 'border-ink-200'
              }`}
              style={{ minHeight: 160, lineHeight: 20 }}
            />
            <View className="mt-1.5 flex-row items-center justify-between">
              {errors.description ? (
                <Text className="font-medium flex-1 text-[11px] text-danger">{errors.description}</Text>
              ) : (
                <Text className="font-medium flex-1 text-[11px] text-ink-400">
                  {descOk ? 'Deskripsi sudah cukup detail' : `Minimal ${descRemaining} karakter lagi`}
                </Text>
              )}
              <Text className={`font-semibold text-[10px] ${descOk ? 'text-emerald-600' : 'text-ink-400'}`}>
                {description.length} / {MIN_DESC}+
              </Text>
            </View>
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <MapPin color="#1D4ED8" size={14} strokeWidth={2.4} />
              <Text className="font-bold text-sm text-ink-900">Lokasi Properti</Text>
              <View className="rounded-full bg-ink-100 px-2 py-0.5">
                <Text className="font-medium text-[9px] text-ink-500">OPSIONAL</Text>
              </View>
            </View>
            <Text className="font-sans mb-3 text-[11px] text-ink-500">
              Lokasi akan ikut terkirim agar customer service lebih cepat memahami kebutuhan kamu.
            </Text>
            <AddressField
              value={address}
              onChange={setAddress}
              coords={coords}
              onCoordsChange={setCoords}
            />
          </View>

          <View className="mx-4 mt-3 mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Text className="font-bold mb-2.5 text-xs text-amber-900">Cara Kerjanya</Text>
            <View className="gap-2.5">
              {[
                'Tekan tombol untuk buka WhatsApp',
                'Pesan template otomatis terisi',
                'Kirim chat ke customer service',
                'Customer service bantu review kebutuhan dan estimasi',
                'Kalau cocok, proses booking dilanjutkan',
              ].map((step, index) => (
                <View key={step} className="flex-row items-start gap-2.5">
                  <View className="h-5 w-5 items-center justify-center rounded-full bg-amber-600">
                    <Text className="font-bold text-[10px] text-white">{index + 1}</Text>
                  </View>
                  <Text className="font-sans flex-1 text-xs leading-4 text-amber-900">{step}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
          <SafeAreaView edges={['bottom']}>
            <View className="p-4">
              <Pressable
                onPress={onSubmit}
                className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5"
                style={{ elevation: 2 }}
              >
                <View className="h-5 w-5 items-center justify-center rounded-full bg-white">
                  <WaIcon size={14} />
                </View>
                <Text className="font-bold text-sm text-white">Buka WhatsApp Customer Service</Text>
              </Pressable>
              <Text className="font-medium mt-2 text-center text-[10px] text-ink-400">
                Tidak membuat pesanan baru sebelum kamu mengirim chat
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </>
  );
}

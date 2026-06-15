import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ClipboardList, MapPin, Phone, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { WaIcon } from '../../src/components/BrandIcon';
import { validateMinLength, validatePhone } from '../../src/components/Field';
import { SERVICE_CATEGORIES } from '../../src/data/catalog';
import { useAuthStore } from '../../src/stores/auth';
import { useBookingsStore } from '../../src/stores/bookings';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

const QUICK_TEMPLATES: { label: string; text: string }[] = [
  { label: 'Pasca Renovasi', text: 'Pembersihan pasca renovasi: buang sisa material, debu semen, cat tumpah. ' },
  { label: 'Pasca Banjir', text: 'Pembersihan pasca banjir: lumpur, sanitasi area, cek perabot rusak. ' },
  { label: 'Properti Besar', text: 'Properti besar (villa/ruko 3 lantai). Butuh tim & estimasi waktu pengerjaan. ' },
  { label: 'B2B / Kantor', text: 'Kebutuhan B2B kantor/event. Perlu kuotasi formal & invoice resmi. ' },
  { label: 'Area Khusus', text: 'Area khusus (kolam renang, rooftop, gudang). Butuh peralatan tambahan. ' },
];

const MIN_DESC = 20;

export default function WaSurvey() {
  const router = useRouter();
  const { category: categoryCode, workers, areaM2, propertyType, bedrooms, bathrooms } = useLocalSearchParams<{
    category?: string; workers?: string; areaM2?: string; propertyType?: string; bedrooms?: string; bathrooms?: string;
  }>();
  const tokens = useAuthStore((s) => s.tokens);
  const create = useBookingsStore((s) => s.create);

  const category = SERVICE_CATEGORIES.find((c) => c.code === categoryCode) ?? SERVICE_CATEGORIES[0];

  const savedLocation = useLocationStore((s) => s.current);
  const [phone, setPhone] = useState('');
  // Prefill bullet-style supaya CS gampang baca & user gampang lanjutin
  const [description, setDescription] = useState(() => {
    const parts: string[] = [];
    if (workers && Number(workers) > 1) parts.push(`• Butuh ${workers} petugas cleaner`);
    if (areaM2) parts.push(`• Luas area ${areaM2} m²`);
    if (propertyType) parts.push(`• Tipe properti: ${propertyType}`);
    if (bedrooms && Number(bedrooms) > 0) parts.push(`• ${bedrooms} kamar tidur`);
    if (bathrooms && Number(bathrooms) > 0) parts.push(`• ${bathrooms} kamar mandi`);
    return parts.length > 0 ? parts.join('\n') + '\n\n' : '';
  });
  const [address, setAddress] = useState(savedLocation?.address ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null,
  );
  const [errors, setErrors] = useState<{ phone?: string | null; description?: string | null }>({});

  function applyTemplate(t: string): void {
    setDescription((prev) => (prev.endsWith('\n') || prev === '' ? prev + t : prev + '\n' + t));
    if (errors.description) setErrors({ ...errors, description: null });
  }

  function onSubmit(): void {
    if (!tokens) {
      toast.warning('Login dulu untuk lanjut');
      router.push({ pathname: '/(auth)/login', params: { next: '/booking/wa-survey' } });
      return;
    }
    if (!category) return;
    const e = {
      phone: validatePhone(phone),
      description: validateMinLength(description, MIN_DESC, 'Deskripsi'),
    };
    setErrors(e);
    if (e.phone || e.description) {
      toast.error(`Lengkapi nomor WA & deskripsi (min ${MIN_DESC} karakter)`);
      return;
    }

    const booking = create({
      pricingMode: 'wa_survey',
      categoryCode: category.code,
      categoryName: category.name,
      categoryImage: category.imageUrl,
      addressLine: address || '(belum diisi)',
      scheduledAt: 'Menunggu kuotasi',
      surveyDescription: description,
      addOns: [],
      basePrice: 0,
      dirtSurcharge: 0,
      totalPrice: 0,
      formSnapshot: { notes: description },
      initialStatus: 'wa_survey_pending',
    });
    toast.success(`Permintaan terkirim. CS akan WA ${phone} dalam 30 menit (jam kerja).`);
    router.replace({ pathname: '/booking/[id]', params: { id: booking.id } });
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
                Survey & quote untuk kebutuhan khusus
              </Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          {/* Hero "Cocok untuk" */}
          <View className="mx-4 mt-3 overflow-hidden rounded-2xl bg-white">
            <View className="flex-row items-center gap-2 border-b border-ink-100 px-4 py-3">
              <Sparkles color="#1D4ED8" size={16} strokeWidth={2.4} />
              <Text className="font-bold text-sm text-ink-900">Cocok untuk</Text>
            </View>
            <View className="gap-2 p-4">
              {[
                'Properti besar / kompleks (villa, ruko 3 lantai)',
                'Pasca renovasi atau pasca banjir',
                'Kebutuhan B2B / kantor / event',
                'Pertama kali pesan & masih bingung paket',
                'Area khusus (kolam, rooftop, gudang)',
              ].map((it) => (
                <View key={it} className="flex-row items-start gap-2">
                  <View className="mt-0.5 h-4 w-4 items-center justify-center rounded-full bg-brand-100">
                    <Check color="#1D4ED8" size={10} strokeWidth={3} />
                  </View>
                  <Text className="font-sans flex-1 text-xs text-ink-700">{it}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Card 1 — Phone */}
          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <Phone color="#1D4ED8" size={14} strokeWidth={2.4} />
              <Text className="font-bold text-sm text-ink-900">Nomor WhatsApp Aktif</Text>
            </View>
            <Text className="font-sans mb-2 text-[11px] text-ink-500">
              CS akan WhatsApp ke nomor ini dalam 30 menit (jam kerja).
            </Text>
            <View
              className={`flex-row items-center gap-2 rounded-xl border px-3 py-3 ${
                errors.phone ? 'border-danger' : 'border-ink-200'
              }`}
            >
              <Phone color="#94A3B8" size={16} />
              <TextInput
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (errors.phone) setErrors({ ...errors, phone: validatePhone(v) });
                }}
                placeholder="08xxxxxxxxxx"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                className="font-sans flex-1 text-sm text-ink-900"
              />
            </View>
            {errors.phone && (
              <Text className="font-medium mt-1 text-[11px] text-danger">{errors.phone}</Text>
            )}
          </View>

          {/* Card 2 — Deskripsi Kebutuhan */}
          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <ClipboardList color="#1D4ED8" size={14} strokeWidth={2.4} />
              <Text className="font-bold text-sm text-ink-900">Deskripsi Kebutuhan</Text>
            </View>
            <Text className="font-sans mb-3 text-[11px] text-ink-500">
              Pilih template di bawah untuk mulai cepat, atau ketik sendiri. Makin detail, makin akurat kuotasinya.
            </Text>

            {/* Quick template chips */}
            <View className="mb-3 flex-row flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((t) => (
                <Pressable
                  key={t.label}
                  onPress={() => applyTemplate(t.text)}
                  className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5"
                >
                  <Text className="font-semibold text-[11px] text-brand-700">+ {t.label}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                if (errors.description)
                  setErrors({ ...errors, description: validateMinLength(v, MIN_DESC, 'Deskripsi') });
              }}
              multiline
              textAlignVertical="top"
              placeholder={'Contoh:\n• Villa 3 lantai, ±250 m²\n• Habis renovasi besar\n• Butuh deep cleaning + buang sisa material\n• Available weekend pagi'}
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
                  {descOk ? '✓ Deskripsi cukup detail' : `Minimal ${descRemaining} karakter lagi`}
                </Text>
              )}
              <Text
                className={`font-semibold text-[10px] ${descOk ? 'text-emerald-600' : 'text-ink-400'}`}
              >
                {description.length} / {MIN_DESC}+
              </Text>
            </View>
          </View>

          {/* Card 3 — Lokasi */}
          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <MapPin color="#1D4ED8" size={14} strokeWidth={2.4} />
              <Text className="font-bold text-sm text-ink-900">Lokasi Properti</Text>
              <View className="rounded-full bg-ink-100 px-2 py-0.5">
                <Text className="font-medium text-[9px] text-ink-500">OPSIONAL</Text>
              </View>
            </View>
            <Text className="font-sans mb-3 text-[11px] text-ink-500">
              Bantu CS estimasi waktu tempuh & biaya transport (kalau jauh).
            </Text>
            <AddressField
              value={address}
              onChange={setAddress}
              coords={coords}
              onCoordsChange={setCoords}
            />
          </View>

          {/* Cara Kerjanya */}
          <View className="mx-4 mt-3 mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Text className="font-bold mb-2.5 text-xs text-amber-900">Cara Kerjanya</Text>
            <View className="gap-2.5">
              {[
                'Submit form ini',
                'CS hubungi WhatsApp (SLA 30 menit, jam kerja)',
                'Diskusi kebutuhan + survey on-site bila perlu',
                'CS kirim kuotasi ke app, kamu approve & bayar',
                'Cleaner di-assign, pengerjaan dimulai',
              ].map((step, i) => (
                <View key={step} className="flex-row items-start gap-2.5">
                  <View className="h-5 w-5 items-center justify-center rounded-full bg-amber-600">
                    <Text className="font-bold text-[10px] text-white">{i + 1}</Text>
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
                <Text className="font-bold text-sm text-white">Kirim ke WhatsApp CS</Text>
              </Pressable>
              <Text className="font-medium mt-2 text-center text-[10px] text-ink-400">
                Gratis · Tidak ada biaya sebelum kamu approve kuotasi
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </>
  );
}

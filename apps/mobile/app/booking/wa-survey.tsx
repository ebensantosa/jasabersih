import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Phone } from 'lucide-react-native';
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

export default function WaSurvey() {
  const router = useRouter();
  const { category: categoryCode } = useLocalSearchParams<{ category?: string }>();
  const tokens = useAuthStore((s) => s.tokens);
  const create = useBookingsStore((s) => s.create);

  const category = SERVICE_CATEGORIES.find((c) => c.code === categoryCode) ?? SERVICE_CATEGORIES[0];

  const savedLocation = useLocationStore((s) => s.current);
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState(savedLocation?.address ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null,
  );
  const [errors, setErrors] = useState<{ phone?: string | null; description?: string | null }>({});

  function onSubmit() {
    if (!tokens) {
      toast.warning('Login dulu untuk lanjut');
      router.push({ pathname: '/(auth)/login', params: { next: '/booking/wa-survey' } });
      return;
    }
    if (!category) return;
    const e = {
      phone: validatePhone(phone),
      description: validateMinLength(description, 20, 'Deskripsi'),
    };
    setErrors(e);
    if (e.phone || e.description) {
      toast.error('Lengkapi nomor WA & deskripsi (min 20 karakter)');
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

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-brand-700">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => safeBack(router)} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
            <View className="ml-1 flex-1">
              <Text className="font-bold text-base text-white">Konsultasi via WhatsApp</Text>
              <Text className="font-medium text-[11px] text-white/70">
                Survey & quote untuk job kompleks
              </Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-bold text-sm text-ink-900">Cocok untuk:</Text>
            <View className="mt-2 gap-1.5">
              {[
                'Properti besar / kompleks (villa 3 lantai, ruko)',
                'Pasca renovasi / pasca banjir',
                'Customer B2B yang butuh kuotasi formal',
                'Pertama kali pesan & masih bingung paket',
                'Permintaan unik (kolam renang, rooftop, dll)',
              ].map((it) => (
                <View key={it} className="flex-row items-start gap-2">
                  <Check color="#1D4ED8" size={14} strokeWidth={2.4} />
                  <Text className="font-sans flex-1 text-xs text-ink-700">{it}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-semibold mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">
              Nomor WhatsApp Aktif
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

            <Text className="font-semibold mb-1.5 mt-4 text-[11px] uppercase tracking-wider text-ink-500">
              Deskripsi Kebutuhan
            </Text>
            <TextInput
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                if (errors.description)
                  setErrors({ ...errors, description: validateMinLength(v, 20, 'Deskripsi') });
              }}
              multiline
              placeholder="Contoh: villa 3 lantai 250m², habis renovasi, butuh deep cleaning + buang sisa material."
              placeholderTextColor="#94A3B8"
              className={`font-sans rounded-xl border px-4 py-3 text-sm text-ink-900 ${
                errors.description ? 'border-danger' : 'border-ink-200'
              }`}
              style={{ minHeight: 130 }}
            />
            <View className="mt-1 flex-row items-center justify-between">
              {errors.description ? (
                <Text className="font-medium text-[11px] text-danger">{errors.description}</Text>
              ) : (
                <View />
              )}
              <Text className="font-medium text-[10px] text-ink-400">
                {description.length} karakter
              </Text>
            </View>

            <Text className="font-semibold mb-1.5 mt-4 text-[11px] uppercase tracking-wider text-ink-500">
              Lokasi Properti (opsional)
            </Text>
            <AddressField
              value={address}
              onChange={setAddress}
              coords={coords}
              onCoordsChange={setCoords}
            />
          </View>

          <View className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Text className="font-semibold text-xs text-amber-900">Cara Kerjanya</Text>
            <View className="mt-2 gap-1.5">
              {[
                '1. Kamu submit form ini',
                '2. CS hubungi WA (SLA 30 menit jam kerja)',
                '3. Diskusi kebutuhan & survey on-site (gratis kalau order > Rp 500K)',
                '4. CS kirim quote ke app, kamu approve & bayar',
                '5. Cleaner di-assign, flow normal',
              ].map((it) => (
                <Text key={it} className="font-sans text-xs text-amber-900">
                  {it}
                </Text>
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
              >
                <View className="h-5 w-5 items-center justify-center rounded-full bg-white">
                  <WaIcon size={14} />
                </View>
                <Text className="font-bold text-sm text-white">Kirim ke WhatsApp CS</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </>
  );
}

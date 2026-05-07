import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Clock, Info, Minus, Plus } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { HOURLY_TIERS, SERVICE_CATEGORIES, formatRupiah } from '../../src/data/catalog';
import { useAuthStore } from '../../src/stores/auth';
import { useBookingsStore } from '../../src/stores/bookings';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';

const TIME_SLOTS = ['08:00', '10:00', '13:00', '15:00', '17:00'];
const DATE_OPTIONS = (() => {
  const out: { label: string; iso: string; date: string }[] = [];
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      label: i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : days[d.getDay()] ?? '',
      date: String(d.getDate()),
      iso: d.toISOString().slice(0, 10),
    });
  }
  return out;
})();

export default function HourlyBooking() {
  const router = useRouter();
  const { category: categoryCode } = useLocalSearchParams<{ category?: string }>();
  const tokens = useAuthStore((s) => s.tokens);
  const create = useBookingsStore((s) => s.create);

  const category = SERVICE_CATEGORIES.find((c) => c.code === categoryCode) ?? SERVICE_CATEGORIES[0];

  const [tierCode, setTierCode] = useState<string>(HOURLY_TIERS[0]?.code ?? '');
  const tier = HOURLY_TIERS.find((t) => t.code === tierCode) ?? HOURLY_TIERS[0];
  const [hours, setHours] = useState<number>(tier?.minHours ?? 2);

  const [date, setDate] = useState(DATE_OPTIONS[0]?.iso ?? '');
  const [time, setTime] = useState('10:00');
  const savedLocation = useLocationStore((s) => s.current);
  const [address, setAddress] = useState(savedLocation?.address ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null,
  );
  const [tasks, setTasks] = useState('');
  const [errors, setErrors] = useState<{ address?: string | null; tasks?: string | null }>({});
  const scrollRef = useRef<ScrollView>(null);

  const total = (tier?.pricePerHour ?? 0) * hours;

  function changeTier(code: string) {
    const t = HOURLY_TIERS.find((x) => x.code === code);
    setTierCode(code);
    if (t && hours < t.minHours) setHours(t.minHours);
  }

  function onSubmit() {
    if (!tokens) {
      toast.warning('Login dulu untuk lanjut');
      router.push({ pathname: '/(auth)/login', params: { next: '/booking/hourly' } });
      return;
    }
    if (!tier || !category) return;
    const e = {
      address: address.trim() ? null : 'Alamat lengkap wajib diisi',
      tasks: tasks.trim().length < 10 ? 'Tulis prioritas/task min 10 karakter' : null,
    };
    setErrors(e);
    if (e.address || e.tasks) {
      toast.error('Lengkapi alamat & checklist task');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const booking = create({
      pricingMode: 'hourly',
      categoryCode: category.code,
      categoryName: category.name,
      categoryImage: category.imageUrl,
      hourlyTierCode: tier.code,
      hourlyTierName: tier.name,
      hours,
      addressLine: address,
      scheduledAt: `${date} ${time}`,
      addOns: [],
      basePrice: tier.pricePerHour * hours,
      dirtSurcharge: 0,
      totalPrice: total,
      formSnapshot: { notes: tasks },
      initialStatus: 'pending_payment',
    });
    toast.success('Pesanan dibuat — silakan bayar untuk mulai cari cleaner');
    router.replace({ pathname: '/booking/[id]', params: { id: booking.id } });
  }

  if (!tier || !category) return null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-brand-700">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
            <View className="ml-1 flex-1">
              <Text className="font-bold text-base text-white">Booking Per Jam</Text>
              <Text className="font-medium text-[11px] text-white/70">Bayar per jam, fleksibel</Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <Section title="Pilih Tier Cleaner">
            <View className="gap-2">
              {HOURLY_TIERS.map((t) => {
                const active = t.code === tierCode;
                return (
                  <Pressable
                    key={t.code}
                    onPress={() => changeTier(t.code)}
                    className={`rounded-xl border p-3 ${
                      active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="font-semibold text-sm text-ink-900">{t.name}</Text>
                      <Text className="font-bold text-sm text-brand-600">
                        {formatRupiah(t.pricePerHour)}/jam
                      </Text>
                    </View>
                    <Text className="font-sans mt-1 text-[11px] text-ink-600">{t.description}</Text>
                    <Text className="font-medium mt-1 text-[10px] text-amber-700">
                      Minimum {t.minHours} jam
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Durasi Booking">
            <View className="flex-row items-center justify-between">
              <Text className="font-medium text-sm text-ink-700">{hours} jam</Text>
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => setHours(Math.max(tier.minHours, hours - 0.5))}
                  className="h-9 w-9 items-center justify-center rounded-full border border-ink-300"
                >
                  <Minus color="#1D4ED8" size={16} strokeWidth={2.4} />
                </Pressable>
                <Text className="font-bold w-12 text-center text-base text-ink-900">{hours}</Text>
                <Pressable
                  onPress={() => setHours(Math.min(8, hours + 0.5))}
                  className="h-9 w-9 items-center justify-center rounded-full border border-ink-300"
                >
                  <Plus color="#1D4ED8" size={16} strokeWidth={2.4} />
                </Pressable>
              </View>
            </View>
            <Text className="font-sans mt-2 text-[11px] text-ink-500">
              Kelipatan 30 menit. Min {tier.minHours} jam.
            </Text>
          </Section>

          <Section title="Checklist Tugas">
            <View className="mb-2 flex-row gap-2 rounded-xl bg-brand-50 p-3">
              <Info color="#1D4ED8" size={16} />
              <Text className="font-medium flex-1 text-[11px] text-brand-900">
                Wajib: tulis prioritas/urutan task. Tanpa instruksi → cleaner pakai default order
                (KM → dapur → kamar → tamu).
              </Text>
            </View>
            <TextInput
              value={tasks}
              onChangeText={(v) => {
                setTasks(v);
                if (errors.tasks)
                  setErrors({ ...errors, tasks: v.trim().length < 10 ? 'Min 10 karakter' : null });
              }}
              multiline
              placeholder={
                'Contoh:\n1. Sikat 2 kamar mandi (prioritas)\n2. Cuci piring numpuk\n3. Pel seluruh lantai\n4. Lap kaca jendela ruang tamu'
              }
              placeholderTextColor="#94A3B8"
              className={`font-sans rounded-xl border bg-white px-4 py-3 text-sm ${
                errors.tasks ? 'border-danger' : 'border-ink-200'
              }`}
              style={{ minHeight: 130 }}
            />
            {errors.tasks && (
              <Text className="font-medium mt-1 text-[11px] text-danger">{errors.tasks}</Text>
            )}
          </Section>

          <Section title="Jadwal">
            <Label>Tanggal</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {DATE_OPTIONS.map((d) => {
                  const active = d.iso === date;
                  return (
                    <Pressable
                      key={d.iso}
                      onPress={() => setDate(d.iso)}
                      className={`w-16 items-center rounded-xl border py-3 ${
                        active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
                      }`}
                    >
                      <Text
                        className={`font-medium text-[11px] ${
                          active ? 'text-white' : 'text-ink-500'
                        }`}
                      >
                        {d.label}
                      </Text>
                      <Text
                        className={`font-bold mt-0.5 text-lg ${
                          active ? 'text-white' : 'text-ink-900'
                        }`}
                      >
                        {d.date}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Label className="mt-4">Jam Mulai</Label>
            <View className="flex-row flex-wrap gap-2">
              {TIME_SLOTS.map((t) => {
                const active = t === time;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTime(t)}
                    className={`rounded-xl border px-4 py-2.5 ${
                      active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
                    }`}
                  >
                    <Text
                      className={`font-semibold text-xs ${active ? 'text-white' : 'text-ink-700'}`}
                    >
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Alamat">
            <AddressField
              value={address}
              onChange={(v) => {
                setAddress(v);
                if (errors.address && v.trim()) setErrors({ ...errors, address: null });
              }}
              coords={coords}
              onCoordsChange={setCoords}
              error={errors.address}
            />
          </Section>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-bold text-sm text-ink-900">Rincian Harga</Text>
            <View className="mt-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Clock color="#1D4ED8" size={14} />
                <Text className="font-sans text-sm text-ink-600">
                  {tier.name} · {hours} jam × {formatRupiah(tier.pricePerHour)}
                </Text>
              </View>
              <Text className="font-bold text-base text-brand-600">{formatRupiah(total)}</Text>
            </View>
            <Text className="font-sans mt-2 text-[11px] text-ink-500">
              Bayar di muka. Cleaner selesai lebih cepat → tidak ada refund. Lewat 5 menit dari
              durasi → dapat notif "Mau extend?".
            </Text>
          </View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
          <SafeAreaView edges={['bottom']}>
            <View className="flex-row items-center gap-3 p-4">
              <View className="flex-1">
                <Text className="font-medium text-[11px] text-ink-400">Total</Text>
                <Text className="font-bold text-lg text-ink-900">{formatRupiah(total)}</Text>
              </View>
              <Pressable onPress={onSubmit} className="rounded-2xl bg-brand-600 px-8 py-3.5">
                <Text className="font-bold text-sm text-white">Buat Pesanan</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
      <Text className="font-bold mb-3 text-sm text-ink-900">{title}</Text>
      {children}
    </View>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text
      className={`font-semibold mb-2 text-[11px] uppercase tracking-wider text-ink-500 ${className ?? ''}`}
    >
      {children}
    </Text>
  );
}

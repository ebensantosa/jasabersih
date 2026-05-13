import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Bath, Bed, ChefHat, Minus, Plus, Sofa, Trees, UtensilsCrossed, Warehouse, Wind, Square, Droplets, Layers, Brush } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { useAddressesStore } from '../../src/stores/addresses';
import { useBookingsStore } from '../../src/stores/bookings';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { formatRupiah } from '../../src/data/catalog';
import { safeBack } from '../../src/lib/safeBack';

type Item = { key: string; label: string; price: number; icon: any; durationMin: number; unit?: string };

const ROOMS: Item[] = [
  { key: 'kamar_tidur', label: 'Kamar Tidur', price: 35000, icon: Bed, durationMin: 25 },
  { key: 'kamar_mandi', label: 'Kamar Mandi', price: 30000, icon: Bath, durationMin: 20 },
  { key: 'ruang_tamu', label: 'Ruang Tamu', price: 40000, icon: Sofa, durationMin: 30 },
  { key: 'ruang_keluarga', label: 'Ruang Keluarga', price: 40000, icon: Sofa, durationMin: 30 },
  { key: 'dapur', label: 'Dapur', price: 50000, icon: ChefHat, durationMin: 35 },
  { key: 'ruang_makan', label: 'Ruang Makan', price: 35000, icon: UtensilsCrossed, durationMin: 25 },
  { key: 'balkon', label: 'Balkon', price: 25000, icon: Trees, durationMin: 20 },
  { key: 'halaman', label: 'Halaman / Teras', price: 30000, icon: Trees, durationMin: 25 },
  { key: 'garasi', label: 'Garasi', price: 35000, icon: Warehouse, durationMin: 25 },
  { key: 'tangga', label: 'Tangga (per lantai)', price: 20000, icon: Layers, durationMin: 15 },
];

const EXTRAS: Item[] = [
  { key: 'sofa', label: 'Sofa (per seater)', price: 35000, icon: Sofa, durationMin: 15, unit: 'seater' },
  { key: 'kasur', label: 'Kasur (per pcs)', price: 80000, icon: Bed, durationMin: 30, unit: 'kasur' },
  { key: 'karpet', label: 'Karpet (per m²)', price: 25000, icon: Square, durationMin: 10, unit: 'm²' },
  { key: 'ac', label: 'AC (per unit)', price: 75000, icon: Wind, durationMin: 30, unit: 'unit' },
  { key: 'kipas_angin', label: 'Kipas Angin', price: 25000, icon: Wind, durationMin: 10, unit: 'unit' },
  { key: 'jendela', label: 'Jendela / Kaca', price: 15000, icon: Square, durationMin: 10, unit: 'pcs' },
  { key: 'lantai_extra', label: 'Pel Lantai Khusus', price: 30000, icon: Brush, durationMin: 15, unit: 'ruangan' },
  { key: 'kamar_mandi_deep', label: 'Deep Clean K.Mandi', price: 60000, icon: Droplets, durationMin: 40, unit: 'unit' },
];

const TIME_SLOTS = ['07:00', '08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

function makeDateOptions(): { date: Date; label: string; sub: string }[] {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const out: { date: Date; label: string; sub: string }[] = [];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const label = i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : days[d.getDay()];
    const sub = `${d.getDate()} ${months[d.getMonth()]}`;
    out.push({ date: d, label, sub });
  }
  return out;
}

function CustomBooking() {
  const router = useRouter();
  const create = useBookingsStore((s) => s.create);
  const addressList = useAddressesStore((s) => s.list);
  const savedLocation = useLocationStore((s) => s.current);
  const defaultAddress = addressList.find((a) => a.isDefault) ?? addressList[0] ?? null;

  const allItems = [...ROOMS, ...EXTRAS];
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(allItems.map((i) => [i.key, 0])),
  );
  const [address, setAddress] = useState(defaultAddress?.addressLine ?? savedLocation?.address ?? '');

  const dateOptions = useMemo(() => makeDateOptions(), []);
  const [dateIdx, setDateIdx] = useState(1); // default besok
  const [timeSlot, setTimeSlot] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const scheduleAt = useMemo(() => {
    const d = new Date(dateOptions[dateIdx]!.date);
    const [hh, mm] = timeSlot.split(':').map(Number);
    d.setHours(hh!, mm!, 0, 0);
    return d;
  }, [dateOptions, dateIdx, timeSlot]);

  const { total, totalMin, itemCount } = useMemo(() => {
    let t = 0, m = 0, n = 0;
    for (const it of allItems) {
      const c = counts[it.key] ?? 0;
      if (c > 0) { t += c * it.price; m += c * it.durationMin; n += c; }
    }
    return { total: t, totalMin: m, itemCount: n };
  }, [counts]);

  function bump(k: string, delta: number) {
    setCounts((p) => ({ ...p, [k]: Math.max(0, Math.min(50, (p[k] ?? 0) + delta)) }));
  }

  async function submit() {
    if (itemCount === 0) { toast.error('Pilih minimal 1 layanan'); return; }
    if (!address.trim()) { toast.error('Alamat wajib diisi'); return; }
    setSubmitting(true);
    const items = allItems.filter((r) => (counts[r.key] ?? 0) > 0).map((r) => ({
      key: r.key, label: r.label, qty: counts[r.key]!, pricePerUnit: r.price, subtotal: counts[r.key]! * r.price,
    }));
    const labelSummary = items.map((i) => `${i.qty}× ${i.label}`).join(', ');
    try {
      const booking = await create({
        pricingMode: 'package',
        categoryCode: 'custom',
        categoryName: 'Layanan Custom',
        categoryImage: undefined,
        packageId: undefined,
        packageName: `Custom: ${labelSummary}`,
        addressLine: address,
        scheduledAt: scheduleAt.toISOString(),
        addOns: [],
        baseAmount: total,
        totalPrice: total,
        durationMin: totalMin,
        formSnapshot: { mode: 'custom', items, totalMin, notes },
        initialStatus: 'pending_payment',
      });
      toast.success('Pesanan custom dibuat — silakan bayar');
      router.replace({ pathname: '/booking/[id]', params: { id: booking.id } });
    } catch {
      // toast handled in store
    } finally {
      setSubmitting(false);
    }
  }

  function renderItem(it: Item, idx: number, last: boolean) {
    const Icon = it.icon;
    const c = counts[it.key] ?? 0;
    return (
      <View key={it.key} className={`flex-row items-center gap-3 py-3 ${!last ? 'border-b border-ink-100' : ''}`}>
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
          <Icon color="#1D4ED8" size={20} strokeWidth={2} />
        </View>
        <View className="flex-1">
          <Text className="font-semibold text-sm text-ink-900">{it.label}</Text>
          <Text className="text-[11px] text-ink-500">{formatRupiah(it.price)}{it.unit ? ` / ${it.unit}` : ''} · ~{it.durationMin}m</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => bump(it.key, -1)}
            disabled={c === 0}
            className={`h-8 w-8 items-center justify-center rounded-lg ${c === 0 ? 'bg-ink-100' : 'bg-brand-50'}`}
          >
            <Minus color={c === 0 ? '#94A3B8' : '#1D4ED8'} size={14} strokeWidth={2.4} />
          </Pressable>
          <Text className="font-bold w-6 text-center text-sm text-ink-900">{c}</Text>
          <Pressable
            onPress={() => bump(it.key, 1)}
            className="h-8 w-8 items-center justify-center rounded-lg bg-brand-50"
          >
            <Plus color="#1D4ED8" size={14} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
          <Pressable onPress={() => safeBack('/(tabs)')} className="h-10 w-10 items-center justify-center -ml-2">
            <ArrowLeft size={22} color="#0F172A" />
          </Pressable>
          <View className="flex-1">
            <Text className="font-bold text-base text-ink-900">Layanan Custom</Text>
            <Text className="text-[11px] text-ink-500">Atur sendiri, bayar tanpa konsultasi</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
          <View className="mx-4 mt-4 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-bold text-sm text-ink-900">Ruangan</Text>
              <Text className="text-[10px] text-ink-500">{ROOMS.length} pilihan</Text>
            </View>
            {ROOMS.map((it, i) => renderItem(it, i, i === ROOMS.length - 1))}
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-bold text-sm text-ink-900">Tambahan</Text>
              <Text className="text-[10px] text-ink-500">{EXTRAS.length} pilihan</Text>
            </View>
            {EXTRAS.map((it, i) => renderItem(it, i, i === EXTRAS.length - 1))}
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-bold mb-2 text-sm text-ink-900">Alamat</Text>
            <AddressField value={address} onChange={setAddress} />
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-bold mb-3 text-sm text-ink-900">Tanggal</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pr-4">
                {dateOptions.map((d, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setDateIdx(i)}
                    className={`min-w-[70px] items-center rounded-xl border px-3 py-2.5 ${dateIdx === i ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                  >
                    <Text className={`font-bold text-xs ${dateIdx === i ? 'text-brand-700' : 'text-ink-900'}`}>{d.label}</Text>
                    <Text className={`mt-0.5 text-[10px] ${dateIdx === i ? 'text-brand-600' : 'text-ink-500'}`}>{d.sub}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text className="font-bold mt-4 mb-2 text-sm text-ink-900">Jam</Text>
            <View className="flex-row flex-wrap gap-2">
              {TIME_SLOTS.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTimeSlot(t)}
                  className={`rounded-lg border px-3 py-2 ${timeSlot === t ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                >
                  <Text className={`font-semibold text-xs ${timeSlot === t ? 'text-brand-700' : 'text-ink-700'}`}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-bold mb-2 text-sm text-ink-900">Catatan (opsional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Mis. ada hewan peliharaan, akses pintu samping, dll"
              multiline
              numberOfLines={3}
              className="rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-900"
              style={{ textAlignVertical: 'top', minHeight: 70 }}
            />
          </View>

          {itemCount > 0 && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-bold mb-2 text-sm text-ink-900">Rincian</Text>
              {allItems.filter((r) => (counts[r.key] ?? 0) > 0).map((r) => (
                <View key={r.key} className="flex-row justify-between py-1">
                  <Text className="text-xs text-ink-700">{counts[r.key]}× {r.label}</Text>
                  <Text className="text-xs text-ink-900">{formatRupiah(counts[r.key]! * r.price)}</Text>
                </View>
              ))}
              <View className="mt-2 border-t border-ink-100 pt-2 flex-row justify-between">
                <Text className="font-bold text-sm text-ink-900">Total · ~{Math.round(totalMin / 60 * 10) / 10}j</Text>
                <Text className="font-bold text-sm text-brand-700">{formatRupiah(total)}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white" style={{ elevation: 8 }}>
          <SafeAreaView edges={['bottom']}>
            <View className="flex-row items-center justify-between border-b border-ink-100 px-4 py-3">
              <View>
                <Text className="text-[10px] uppercase tracking-wider text-ink-500">Total Bayar</Text>
                <Text className="font-extrabold text-lg text-brand-700">{formatRupiah(total)}</Text>
              </View>
              {itemCount > 0 && <Text className="text-[10px] text-ink-500">{itemCount} item dipilih</Text>}
            </View>
            <View className="p-4">
              <Pressable
                onPress={submit}
                disabled={submitting || itemCount === 0}
                className={`h-12 items-center justify-center rounded-2xl ${itemCount === 0 ? 'bg-ink-300' : 'bg-brand-600'}`}
              >
                <Text className="font-bold text-sm text-white">
                  {submitting ? 'Memproses...' : itemCount === 0 ? 'Pilih layanan dulu' : 'Buat Pesanan'}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaView>
    </>
  );
}

export default withAuth(CustomBooking);

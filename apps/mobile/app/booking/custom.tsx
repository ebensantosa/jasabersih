import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Bath, Bed, ChefHat, Minus, Plus, Sofa, Trees, UtensilsCrossed, Warehouse, Wind, Square, Droplets, Layers, Brush } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { AddressPickerInline } from '../../src/components/AddressPicker';
import { useAddressesStore } from '../../src/stores/addresses';
import { useApiAddons, useApiServices, useAppContent } from '../../src/stores/appContent';
import { useBookingsStore } from '../../src/stores/bookings';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { formatRupiah } from '../../src/data/catalog';
import { safeBack } from '../../src/lib/safeBack';

type Item = { key: string; label: string; price: number; icon: any; durationMin: number; unit?: string };

// Fallback icon resolver — pick icon by code substring.
function iconFor(code: string): any {
  const c = code.toLowerCase();
  if (c.includes('kamar') && !c.includes('mandi')) return Bed;
  if (c.includes('mandi') || c.includes('toilet') || c.includes('bath') || c.includes('shower')) return Bath;
  if (c.includes('dapur') || c.includes('kompor') || c.includes('kulkas') || c.includes('piring') || c.includes('oven') || c.includes('masak') || c.includes('dispenser')) return ChefHat;
  if (c.includes('sofa') || c.includes('tamu') || c.includes('keluarga')) return Sofa;
  if (c.includes('vacuum') || c.includes('vakum') || c.includes('hydro')) return Wind;
  if (c.includes('jendela') || c.includes('kaca')) return Square;
  if (c.includes('pekarangan') || c.includes('halaman') || c.includes('teras')) return Trees;
  if (c.includes('garasi')) return Warehouse;
  if (c.includes('lemari') || c.includes('furniture') || c.includes('angkut')) return Layers;
  if (c.includes('sampah') || c.includes('saluran')) return Droplets;
  return Brush;
}

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

  const services = useApiServices();
  const allPackages = useAppContent((s) => s.content.packages);
  const apiAddons = useApiAddons();
  // ROOMS = services × their package price (1 paket per service setelah seed).
  const ROOMS: Item[] = useMemo(() => services.map((s: any) => {
    const pkg = allPackages.find((p: any) => p.serviceId === s.id);
    return {
      key: s.code ?? s.id,
      label: s.name,
      price: Number(pkg?.price ?? 0),
      icon: iconFor(String(s.code ?? '')),
      durationMin: Number(pkg?.durationMin ?? 60),
    };
  }).filter((r) => r.price > 0), [services, allPackages]);
  const EXTRAS: Item[] = useMemo(() => apiAddons.map((a: any) => ({
    key: a.code ?? a.id,
    label: a.name,
    price: Number(a.price ?? 0),
    icon: iconFor(String(a.code ?? '')),
    durationMin: Number(a.durationMin ?? 15),
    unit: a.description ?? undefined,
  })), [apiAddons]);

  const allItems = [...ROOMS, ...EXTRAS];
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [address, setAddress] = useState(defaultAddress?.addressLine ?? savedLocation?.address ?? '');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [useNewLocation, setUseNewLocation] = useState(addressList.length === 0);

  const dateOptions = useMemo(() => makeDateOptions(), []);
  const [dateIdx, setDateIdx] = useState(1); // default besok
  const [timeSlot, setTimeSlot] = useState('09:00');

  // Auto-pilih slot jam pertama yang masih valid (kalau hari ini & slot terpilih udah lewat).
  useEffect(() => {
    if (dateIdx !== 0) return;
    const earliest = new Date(Date.now() + 60 * 60 * 1000);
    const [hh, mm] = timeSlot.split(':').map(Number);
    const cur = new Date(); cur.setHours(hh!, mm!, 0, 0);
    if (cur.getTime() >= earliest.getTime()) return;
    const next = TIME_SLOTS.find((t) => {
      const [h, m] = t.split(':').map(Number);
      const d = new Date(); d.setHours(h!, m!, 0, 0);
      return d.getTime() >= earliest.getTime();
    });
    if (next) setTimeSlot(next);
    else setDateIdx(1); // semua slot hari ini udah lewat → besok
  }, [dateIdx, timeSlot]);
  const [notes, setNotes] = useState('');
  const [emptyHouse, setEmptyHouse] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const EMPTY_HOUSE_DISC = 0.20;

  const scheduleAt = useMemo(() => {
    const d = new Date(dateOptions[dateIdx]!.date);
    const [hh, mm] = timeSlot.split(':').map(Number);
    d.setHours(hh!, mm!, 0, 0);
    return d;
  }, [dateOptions, dateIdx, timeSlot]);

  const { subtotal, total, discount, totalMin, itemCount } = useMemo(() => {
    let t = 0, m = 0, n = 0;
    for (const it of allItems) {
      const c = counts[it.key] ?? 0;
      if (c > 0) { t += c * it.price; m += c * it.durationMin; n += c; }
    }
    const disc = emptyHouse ? Math.round((t * EMPTY_HOUSE_DISC) / 1000) * 1000 : 0;
    return { subtotal: t, total: t - disc, discount: disc, totalMin: m, itemCount: n };
  }, [counts, emptyHouse]);

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
        baseAmount: subtotal,
        totalPrice: total,
        durationMin: totalMin,
        formSnapshot: { mode: 'custom', items, totalMin, notes, emptyHouse, emptyHouseDiscount: discount },
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
            {addressList.length > 0 && !useNewLocation && (
              <>
                <AddressPickerInline
                  selectedId={selectedAddressId}
                  onSelect={(a) => {
                    setSelectedAddressId(a.id);
                    setAddress(a.addressLine);
                  }}
                />
                <Pressable onPress={() => setUseNewLocation(true)} className="mt-3 self-start">
                  <Text className="font-semibold text-xs text-brand-600">
                    + Pakai alamat lain (sekali pakai)
                  </Text>
                </Pressable>
              </>
            )}
            {(addressList.length === 0 || useNewLocation) && (
              <>
                <AddressField value={address} onChange={setAddress} />
                {addressList.length > 0 && (
                  <Pressable onPress={() => setUseNewLocation(false)} className="mt-3 self-start">
                    <Text className="font-semibold text-xs text-brand-600">
                      ←  Pakai alamat tersimpan
                    </Text>
                  </Pressable>
                )}
              </>
            )}
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
              {/* Quick action: pilih jam tercepat */}
              <Pressable
                onPress={() => {
                  const earliest = new Date(Date.now() + 60 * 60 * 1000);
                  setDateIdx(0);
                  const slot = TIME_SLOTS.find((t) => {
                    const [hh, mm] = t.split(':').map(Number);
                    const d = new Date(); d.setHours(hh!, mm!, 0, 0);
                    return d.getTime() >= earliest.getTime();
                  });
                  if (slot) setTimeSlot(slot);
                  else { setDateIdx(1); setTimeSlot('07:00'); }
                }}
                className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-2"
              >
                <Text className="font-extrabold text-xs text-emerald-700">Tercepat</Text>
              </Pressable>

              {TIME_SLOTS.map((t) => {
                const isToday = dateIdx === 0;
                let disabled = false;
                if (isToday) {
                  const [hh, mm] = t.split(':').map(Number);
                  const slot = new Date();
                  slot.setHours(hh!, mm!, 0, 0);
                  // Butuh min lead time 2 jam dari sekarang.
                  const earliest = new Date(Date.now() + 60 * 60 * 1000);
                  disabled = slot.getTime() < earliest.getTime();
                }
                const active = timeSlot === t;
                return (
                  <Pressable
                    key={t}
                    disabled={disabled}
                    onPress={() => setTimeSlot(t)}
                    className={`rounded-lg border px-3 py-2 ${
                      disabled
                        ? 'border-ink-100 bg-ink-50'
                        : active
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-ink-200 bg-white'
                    }`}
                  >
                    <Text
                      className={`font-semibold text-xs ${
                        disabled ? 'text-ink-300 line-through' : active ? 'text-brand-700' : 'text-ink-700'
                      }`}
                    >
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={() => setEmptyHouse(!emptyHouse)}
            className={`mx-4 mt-3 flex-row items-center gap-3 rounded-2xl border p-3.5 ${
              emptyHouse ? 'border-emerald-500 bg-emerald-50' : 'border-ink-200 bg-white'
            }`}
          >
            <View
              className={`h-5 w-5 items-center justify-center rounded border-2 ${
                emptyHouse ? 'border-emerald-600 bg-emerald-600' : 'border-ink-300 bg-white'
              }`}
            >
              {emptyHouse && <Text className="text-[10px] font-bold text-white">✓</Text>}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className={`font-extrabold text-sm ${emptyHouse ? 'text-emerald-800' : 'text-ink-900'}`}>
                  Rumah Kosong (Tanpa Barang)
                </Text>
                <View className="rounded bg-emerald-200 px-1.5 py-0.5">
                  <Text className="font-extrabold text-[9px] text-emerald-900">DISKON 20%</Text>
                </View>
              </View>
              <Text className="font-medium mt-0.5 text-[11px] text-ink-600">
                Semua barang sudah dipindah, kerja lebih cepat tanpa hambatan furniture.
              </Text>
            </View>
          </Pressable>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-bold mb-2 text-sm text-ink-900">Catatan (opsional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Contoh: ada hewan peliharaan, akses pintu samping, dll"
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
              {discount > 0 && (
                <View className="mt-2 flex-row justify-between border-t border-ink-100 pt-2">
                  <Text className="text-xs text-emerald-700">Subtotal</Text>
                  <Text className="text-xs text-ink-700">{formatRupiah(subtotal)}</Text>
                </View>
              )}
              {discount > 0 && (
                <View className="flex-row justify-between py-1">
                  <Text className="text-xs text-emerald-700">Diskon Rumah Kosong (20%)</Text>
                  <Text className="text-xs font-bold text-emerald-700">−{formatRupiah(discount)}</Text>
                </View>
              )}
              <View className={`flex-row justify-between ${discount > 0 ? 'border-t border-ink-100 pt-2' : 'mt-2 border-t border-ink-100 pt-2'}`}>
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

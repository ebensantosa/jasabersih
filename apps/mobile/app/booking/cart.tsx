import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Minus, Plus, Clock, CalendarDays, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withAuth } from '../../src/components/AuthGate';
import { ADDONS, SERVICE_CATEGORIES, formatRupiah } from '../../src/data/catalog';
import { useAppContentStore } from '../../src/stores/appContent';
import { useBookingsStore } from '../../src/stores/bookings';
import { toast } from '../../src/stores/ui';
import { type SavedAddress } from '../../src/stores/addresses';
import { AddressPickerInline } from '../../src/components/AddressPicker';
import { safeBack } from '../../src/lib/safeBack';

// Grup addon untuk tampilan terorganisir
const ADDON_GROUPS = [...new Set(ADDONS.map((a) => a.group))];

// Layanan yang tidak bisa dipilih per-unit (modal WA / bundle khusus)
const EXCLUDED_CODES = new Set(['skala_besar']);

type ServiceItem = { code: string; name: string; qty: number; unitPrice: number; durationMin: number };
type AddonItem = { code: string; name: string; qty: number; price: number; durationMin: number };

function BookingCart() {
  const router = useRouter();
  const createBooking = useBookingsStore((s) => s.create);
  const apiServices = useAppContentStore((s) => s.services ?? []);
  const [serviceItems, setServiceItems] = useState<Record<string, number>>({});
  const [addonItems, setAddonItems] = useState<Record<string, number>>({});
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressLine, setAddressLine] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Merge data API (unitPrice live) dengan catalog (nama, icon, durationMin)
  const services = useMemo(() => {
    return SERVICE_CATEGORIES
      .filter((s) => !EXCLUDED_CODES.has(s.code) && s.isActive !== false && !s.isBundle)
      .map((s) => {
        const fromApi = apiServices.find((a: any) => a.code === s.code);
        const unitPrice = fromApi?.unitPrice ? Number(fromApi.unitPrice) : s.startingPrice;
        const durationMin = fromApi?.durationMin ? Number(fromApi.durationMin) : 90;
        return { ...s, unitPrice, durationMin };
      });
  }, [apiServices]);

  function setServiceQty(code: string, delta: number) {
    setServiceItems((prev) => {
      const next = (prev[code] ?? 0) + delta;
      if (next <= 0) { const { [code]: _, ...rest } = prev; return rest; }
      return { ...prev, [code]: Math.min(next, 10) };
    });
  }

  function setAddonQty(code: string, delta: number) {
    setAddonItems((prev) => {
      const next = (prev[code] ?? 0) + delta;
      if (next <= 0) { const { [code]: _, ...rest } = prev; return rest; }
      return { ...prev, [code]: Math.min(next, 20) };
    });
  }

  const serviceTotal = useMemo(() =>
    services.reduce((s, svc) => s + (serviceItems[svc.code] ?? 0) * svc.unitPrice, 0),
  [services, serviceItems]);

  const addonTotal = useMemo(() =>
    ADDONS.reduce((s, a) => s + (addonItems[a.code] ?? 0) * a.price, 0),
  [addonItems]);

  const grandTotal = serviceTotal + addonTotal;

  const totalItems = Object.values(serviceItems).reduce((s, v) => s + v, 0)
    + Object.values(addonItems).reduce((s, v) => s + v, 0);

  const estimatedMinutes = useMemo(() => {
    const svcMins = services.reduce((s, svc) => s + (serviceItems[svc.code] ?? 0) * svc.durationMin, 0);
    const addonMins = ADDONS.reduce((s, a) => s + (addonItems[a.code] ?? 0) * a.durationMin, 0);
    return svcMins + addonMins;
  }, [services, serviceItems, addonItems]);

  async function submit() {
    if (totalItems === 0) { toast.error('Pilih minimal 1 layanan.'); return; }
    if (!addressLine.trim()) { toast.error('Isi alamat dulu.'); return; }
    if (!scheduledAt) { toast.error('Pilih jadwal cleaning.'); return; }

    const selectedServices: ServiceItem[] = services
      .filter((s) => (serviceItems[s.code] ?? 0) > 0)
      .map((s) => ({ code: s.code, name: s.name, qty: serviceItems[s.code]!, unitPrice: s.unitPrice, durationMin: s.durationMin }));

    const selectedAddons: AddonItem[] = ADDONS
      .filter((a) => (addonItems[a.code] ?? 0) > 0)
      .map((a) => ({ code: a.code, name: a.name, qty: addonItems[a.code]!, price: a.price, durationMin: a.durationMin }));

    const categoryName = selectedServices.map((s) => s.name).join(', ');

    setSubmitting(true);
    try {
      const b = await createBooking({
        pricingMode: 'package',
        categoryCode: selectedServices[0]?.code ?? 'multi',
        categoryName,
        categoryImage: '',
        addressLine: addressLine.trim(),
        scheduledAt: scheduledAt.toISOString(),
        basePrice: grandTotal,
        dirtSurcharge: 0,
        totalPrice: grandTotal,
        addOns: selectedAddons.map((a) => ({ code: a.code, name: a.name, price: a.price * a.qty })),
        customerNotes: notes.trim() || undefined,
        formSnapshot: {
          pricingMode: 'flat_unit',
          serviceItems: selectedServices.map((s) => ({ ...s, subtotal: s.qty * s.unitPrice })),
          addonItems: selectedAddons.map((a) => ({ ...a, subtotal: a.qty * a.price })),
          estimatedMinutes,
          categoryName,
          packageName: 'Flat per Unit',
          notes: notes.trim(),
        } as any,
      });
      router.replace({ pathname: '/booking/[id]', params: { id: b.id } });
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal membuat booking.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatSchedule(d: Date) {
    return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  }

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-1 bg-ink-50">
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header */}
        <SafeAreaView edges={['top']} className="bg-white border-b border-ink-100">
          <View className="flex-row items-center gap-3 px-4 py-3">
            <Pressable onPress={() => safeBack()} className="h-9 w-9 items-center justify-center rounded-full bg-ink-100">
              <ArrowLeft color="#0F172A" size={20} />
            </Pressable>
            <View className="flex-1">
              <Text className="font-extrabold text-lg text-ink-900">Pilih Layanan</Text>
              {totalItems > 0 && (
                <Text className="font-medium text-xs text-brand-600">{totalItems} item · {formatRupiah(grandTotal)}</Text>
              )}
            </View>
            {totalItems > 0 && (
              <View className="h-6 w-6 items-center justify-center rounded-full bg-brand-600">
                <Text className="font-bold text-[10px] text-white">{totalItems}</Text>
              </View>
            )}
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }} showsVerticalScrollIndicator={false}>

          {/* ===== LAYANAN UTAMA ===== */}
          <View>
            <Text className="font-extrabold text-sm text-ink-900 mb-2">Layanan Utama</Text>
            <Text className="font-sans text-xs text-ink-500 mb-3">Pilih ruangan/area yang mau dibersihkan. Bisa pilih lebih dari 1.</Text>
            <View className="gap-2">
              {services.map((svc) => {
                const qty = serviceItems[svc.code] ?? 0;
                return (
                  <View key={svc.code} className="flex-row items-center bg-white rounded-2xl px-4 py-3" style={{ elevation: 1 }}>
                    <View className="flex-1">
                      <Text className="font-bold text-sm text-ink-900">{svc.name}</Text>
                      <Text className="font-medium text-xs text-ink-500 mt-0.5">
                        {formatRupiah(svc.unitPrice)}/unit · ~{svc.durationMin} mnt
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                      {qty > 0 && (
                        <>
                          <Pressable
                            onPress={() => setServiceQty(svc.code, -1)}
                            className="h-8 w-8 items-center justify-center rounded-full bg-ink-100"
                          >
                            <Minus color="#475569" size={14} strokeWidth={2.5} />
                          </Pressable>
                          <Text className="font-extrabold text-base text-ink-900 w-5 text-center">{qty}</Text>
                        </>
                      )}
                      <Pressable
                        onPress={() => setServiceQty(svc.code, 1)}
                        className={`h-8 w-8 items-center justify-center rounded-full ${qty > 0 ? 'bg-brand-600' : 'bg-brand-50 border border-brand-300'}`}
                      >
                        <Plus color={qty > 0 ? 'white' : '#1D4ED8'} size={14} strokeWidth={2.5} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ===== ADDONS ===== */}
          <View>
            <Text className="font-extrabold text-sm text-ink-900 mb-2">Layanan Tambahan</Text>
            <Text className="font-sans text-xs text-ink-500 mb-3">Opsional. Ditambahkan ke total harga.</Text>
            {ADDON_GROUPS.map((group) => {
              const groupAddons = ADDONS.filter((a) => a.group === group);
              return (
                <View key={group} className="mb-3">
                  <Text className="font-bold text-[11px] uppercase tracking-wider text-ink-400 mb-1.5">{group}</Text>
                  <View className="gap-1.5">
                    {groupAddons.map((addon) => {
                      const qty = addonItems[addon.code] ?? 0;
                      return (
                        <View key={addon.code} className="flex-row items-center bg-white rounded-xl px-3 py-2.5" style={{ elevation: 1 }}>
                          <View className="flex-1">
                            <Text className="font-semibold text-[13px] text-ink-800">{addon.name}</Text>
                            <Text className="font-medium text-[11px] text-ink-400 mt-0.5">
                              {formatRupiah(addon.price)}{addon.unit ? ` / ${addon.unit}` : ''}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-2.5">
                            {qty > 0 && (
                              <>
                                <Pressable
                                  onPress={() => setAddonQty(addon.code, -1)}
                                  className="h-7 w-7 items-center justify-center rounded-full bg-ink-100"
                                >
                                  <Minus color="#475569" size={12} strokeWidth={2.5} />
                                </Pressable>
                                <Text className="font-extrabold text-sm text-ink-900 w-4 text-center">{qty}</Text>
                              </>
                            )}
                            <Pressable
                              onPress={() => setAddonQty(addon.code, 1)}
                              className={`h-7 w-7 items-center justify-center rounded-full ${qty > 0 ? 'bg-emerald-600' : 'bg-emerald-50 border border-emerald-300'}`}
                            >
                              <Plus color={qty > 0 ? 'white' : '#059669'} size={12} strokeWidth={2.5} />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>

          {/* ===== JADWAL ===== */}
          <View>
            <Text className="font-extrabold text-sm text-ink-900 mb-2">Jadwal</Text>
            <Pressable
              onPress={() => setShowSchedule(true)}
              className="flex-row items-center gap-3 bg-white rounded-2xl px-4 py-3.5"
              style={{ elevation: 1 }}
            >
              <CalendarDays color="#1D4ED8" size={20} strokeWidth={2} />
              <View className="flex-1">
                <Text className={`font-semibold text-sm ${scheduledAt ? 'text-ink-900' : 'text-ink-400'}`}>
                  {scheduledAt ? formatSchedule(scheduledAt) : 'Pilih tanggal & jam'}
                </Text>
                {estimatedMinutes > 0 && (
                  <Text className="font-medium text-[11px] text-ink-500 mt-0.5">
                    <Clock color="#94A3B8" size={10} /> Est. selesai ~{Math.round(estimatedMinutes / 60 * 10) / 10} jam
                  </Text>
                )}
              </View>
              <ChevronRight color="#94A3B8" size={16} />
            </Pressable>
          </View>

          {/* ===== ALAMAT ===== */}
          <View>
            <Text className="font-extrabold text-sm text-ink-900 mb-2">Alamat</Text>
            <AddressPickerInline
              selectedId={selectedAddressId}
              onSelect={(addr: SavedAddress) => { setSelectedAddressId(addr.id); setAddressLine(addr.addressLine); }}
            />
          </View>

          {/* ===== CATATAN ===== */}
          <View>
            <Text className="font-extrabold text-sm text-ink-900 mb-2">Catatan untuk Cleaner <Text className="font-normal text-ink-400">(opsional)</Text></Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Contoh: Fokus ke kamar utama, ada anjing peliharaan, kunci di loker depan..."
              multiline
              numberOfLines={3}
              maxLength={500}
              className="bg-white rounded-2xl px-4 py-3 text-sm text-ink-900 font-sans"
              style={{ elevation: 1, minHeight: 80, textAlignVertical: 'top' }}
              placeholderTextColor="#94A3B8"
            />
          </View>
        </ScrollView>

        {/* ===== BOTTOM SUMMARY + CTA ===== */}
        {totalItems > 0 && (
          <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-ink-100 px-4 pb-8 pt-3" style={{ elevation: 8 }}>
            {/* Breakdown ringkas */}
            <View className="mb-3 gap-1">
              {Object.entries(serviceItems).map(([code, qty]) => {
                const svc = services.find((s) => s.code === code);
                if (!svc) return null;
                return (
                  <View key={code} className="flex-row justify-between">
                    <Text className="font-medium text-xs text-ink-500">{svc.name} ×{qty}</Text>
                    <Text className="font-semibold text-xs text-ink-700">{formatRupiah(qty * svc.unitPrice)}</Text>
                  </View>
                );
              })}
              {Object.entries(addonItems).map(([code, qty]) => {
                const addon = ADDONS.find((a) => a.code === code);
                if (!addon) return null;
                return (
                  <View key={code} className="flex-row justify-between">
                    <Text className="font-medium text-xs text-ink-500">{addon.name} ×{qty}</Text>
                    <Text className="font-semibold text-xs text-ink-700">{formatRupiah(qty * addon.price)}</Text>
                  </View>
                );
              })}
              <View className="mt-1 border-t border-ink-100 pt-1 flex-row justify-between">
                <Text className="font-bold text-sm text-ink-900">Total</Text>
                <Text className="font-extrabold text-sm text-brand-700">{formatRupiah(grandTotal)}</Text>
              </View>
            </View>

            <Pressable
              onPress={submit}
              disabled={submitting}
              className="rounded-2xl bg-brand-600 py-3.5 items-center"
              style={{ opacity: submitting ? 0.6 : 1 }}
            >
              {submitting
                ? <ActivityIndicator color="white" />
                : <Text className="font-extrabold text-base text-white">Pesan Sekarang</Text>}
            </Pressable>
          </View>
        )}

        {/* Schedule Picker */}
        {showSchedule && (
          <ScheduleSheet
            value={scheduledAt}
            onChange={(d) => { setScheduledAt(d); setShowSchedule(false); }}
            onClose={() => setShowSchedule(false)}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// Komponen tanggal + jam sederhana
function ScheduleSheet({ value, onChange, onClose }: { value: Date | null; onChange: (d: Date) => void; onClose: () => void }) {
  const [date, setDate] = useState(() => {
    const d = value ?? new Date();
    d.setHours(8, 0, 0, 0);
    // Minimal besok
    if (d <= new Date()) { d.setDate(d.getDate() + 1); }
    return d;
  });

  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 - 19:00

  return (
    <View className="absolute inset-0 bg-black/50" style={{ zIndex: 99 }}>
      <Pressable className="flex-1" onPress={onClose} />
      <View className="bg-white rounded-t-3xl px-5 pt-5 pb-8">
        <Text className="font-extrabold text-base text-ink-900 mb-4">Pilih Jadwal</Text>

        {/* Date selector - 14 hari ke depan */}
        <Text className="font-bold text-xs text-ink-500 mb-2">Tanggal</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <View className="flex-row gap-2">
            {Array.from({ length: 14 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() + i + 1);
              d.setHours(date.getHours(), 0, 0, 0);
              const isSelected = d.toDateString() === date.toDateString();
              return (
                <Pressable
                  key={i}
                  onPress={() => setDate(new Date(d))}
                  className={`items-center rounded-xl px-3 py-2 min-w-[56px] ${isSelected ? 'bg-brand-600' : 'bg-ink-100'}`}
                >
                  <Text className={`font-bold text-[10px] ${isSelected ? 'text-white' : 'text-ink-500'}`}>
                    {d.toLocaleDateString('id-ID', { weekday: 'short' }).toUpperCase()}
                  </Text>
                  <Text className={`font-extrabold text-base ${isSelected ? 'text-white' : 'text-ink-900'}`}>
                    {d.getDate()}
                  </Text>
                  <Text className={`font-medium text-[9px] ${isSelected ? 'text-white/80' : 'text-ink-400'}`}>
                    {d.toLocaleDateString('id-ID', { month: 'short' })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Hour selector */}
        <Text className="font-bold text-xs text-ink-500 mb-2">Jam mulai</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
          <View className="flex-row gap-2">
            {hours.map((h) => {
              const isSelected = date.getHours() === h;
              return (
                <Pressable
                  key={h}
                  onPress={() => { const d = new Date(date); d.setHours(h, 0, 0, 0); setDate(d); }}
                  className={`items-center justify-center rounded-xl px-4 py-2 ${isSelected ? 'bg-brand-600' : 'bg-ink-100'}`}
                >
                  <Text className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-ink-700'}`}>{String(h).padStart(2, '0')}:00</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <Pressable onPress={() => onChange(date)} className="rounded-2xl bg-brand-600 py-3.5 items-center">
          <Text className="font-extrabold text-base text-white">
            Konfirmasi — {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} pukul {String(date.getHours()).padStart(2, '0')}:00
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default withAuth(BookingCart, 'customer');

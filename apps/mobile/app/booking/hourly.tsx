// Per-jam booking flow. Customer pilih tier (general/deep), durasi, alamat, jadwal.
// Submit ke /bookings dengan pricingMode='hourly' + hourlyTierId + hoursBooked.
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Check, Clock, Info, Minus, Plus, Sparkles, Wrench } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { AddressPickerInline } from '../../src/components/AddressPicker';
import { ScheduleModal } from '../../src/components/ScheduleModal';
import { useServices } from '../../src/hooks/useServices';
import { formatEndTime, quoteNightOvertime } from '../../src/lib/overtimePricing';
import { safeBack } from '../../src/lib/safeBack';
import { useAddressesStore } from '../../src/stores/addresses';
import { useApiHourlyTiers } from '../../src/stores/appContent';
import { useBookingsStore } from '../../src/stores/bookings';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';

const OPS_START_HOUR = 7;
const OPS_END_HOUR = 21;

function rupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function tierIcon(code: string | null) {
  if (code === 'deep') return { Icon: Wrench, tint: '#047857', bg: '#D1FAE5' };
  return { Icon: Sparkles, tint: '#1D4ED8', bg: '#DBEAFE' };
}

function earliestAvailable(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  if (d.getHours() < OPS_START_HOUR) d.setHours(OPS_START_HOUR, 0, 0, 0);
  else if (d.getHours() >= OPS_END_HOUR) { d.setDate(d.getDate() + 1); d.setHours(OPS_START_HOUR, 0, 0, 0); }
  return d;
}

function formatScheduleLabel(d: Date): string {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = (dd.getTime() - today.getTime()) / 86400000;
  const datePart = diff === 0 ? 'Hari ini'
    : diff === 1 ? 'Besok'
    : `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${datePart} · ${time}`;
}

export default function HourlyBooking() {
  const router = useRouter();
  const { category: categoryCode } = useLocalSearchParams<{ category?: string }>();
  const SERVICE_CATEGORIES = useServices();
  const category = SERVICE_CATEGORIES.find((s) => s.code === categoryCode) ?? null;

  const tiers = useApiHourlyTiers();
  const savedLocation = useLocationStore((s) => s.current);
  const addressList = useAddressesStore((s) => s.list);
  const addressesHydrated = useAddressesStore((s) => s.hydrated);
  const defaultAddress = addressList.find((a) => a.isDefault) ?? addressList[0] ?? null;

  // Sama dgn booking/new: redirect ke halaman tambah alamat kalau kosong.
  useEffect(() => {
    if (!addressesHydrated) return;
    if (addressList.length === 0) {
      router.replace({ pathname: '/addresses/edit', params: { returnTo: `/booking/hourly?category=${categoryCode ?? ''}` } });
    }
  }, [addressesHydrated, addressList.length, categoryCode, router]);
  const create = useBookingsStore((s) => s.create);

  const [tierId, setTierId] = useState<string | null>(tiers[0]?.id ?? null);
  const [hours, setHours] = useState<number>(tiers[0]?.minHours ?? 2);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [useNewLocation, setUseNewLocation] = useState(addressList.length === 0);
  const selectedAddress = addressList.find((a) => a.id === selectedAddressId);
  const [address, setAddress] = useState(
    selectedAddress?.addressLine ?? savedLocation?.address ?? '',
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    selectedAddress ? { lat: selectedAddress.lat, lng: selectedAddress.lng }
    : savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng }
    : null,
  );
  const [notes, setNotes] = useState('');
  const [scheduleAt, setScheduleAt] = useState<Date>(() => earliestAvailable());
  const [schedModalOpen, setSchedModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-pick first tier saat data tiers selesai load
  useEffect(() => {
    const firstTier = tiers[0];
    if (!tierId && firstTier) {
      setTierId(firstTier.id);
      setHours(firstTier.minHours);
    }
  }, [tiers, tierId]);

  const tier = useMemo(() => tiers.find((t) => t.id === tierId) ?? null, [tiers, tierId]);
  const minH = tier?.minHours ?? 2;
  // Hard cap di 8 jam buat 1 sesi realistic - lebih dari itu cleaner kecapean +
  // satu sesi gak harus marathon. Walau admin set tier maxHours lebih besar,
  // mobile tetep batasi 8.
  const maxH = Math.min(tier?.maxHours ?? 8, 8);
  const clampedHours = Math.min(Math.max(hours, minH), maxH);
  const subtotal = tier ? tier.pricePerHour * clampedHours : 0;
  const overtimeQuote = useMemo(() => quoteNightOvertime(scheduleAt, clampedHours * 60), [scheduleAt, clampedHours]);
  const total = subtotal + overtimeQuote.surcharge;

  function dec() { setHours((h) => Math.max(minH, h - 1)); }
  function inc() { setHours((h) => Math.min(maxH, h + 1)); }

  async function onSubmit() {
    if (!tier) { toast.error('Pilih jenis pembersihan dulu'); return; }
    if (!address.trim()) { toast.error('Alamat wajib diisi'); return; }
    if (!coords) { toast.error('Pin lokasi di peta dulu biar cleaner bisa nyari'); return; }
    if (!notes.trim()) { toast.error('Deskripsi pekerjaan wajib diisi'); return; }

    setSubmitting(true);
    try {
      const booking = await create({
        pricingMode: 'hourly',
        categoryCode: category?.code ?? 'hourly',
        categoryName: category?.name ?? tier.name ?? 'Per Jam',
        categoryImage: category?.imageUrl ?? '',
        hourlyTierId: tier.id,
        hourlyTierCode: tier.code ?? undefined,
        hourlyTierName: tier.name ?? undefined,
        hours: clampedHours,
        addressLine: address.trim(),
        scheduledAt: scheduleAt.toISOString(),
        addOns: [],
        basePrice: subtotal,
        dirtSurcharge: 0,
        totalPrice: total,
        formSnapshot: {
          billingMode: 'per_hour',
          tierCode: tier.code,
          tierName: tier.name,
          hours: clampedHours,
          pricePerHour: tier.pricePerHour,
          overtimeSurcharge: overtimeQuote.surcharge,
          overtimeHours: overtimeQuote.overtimeHours,
          estimatedEndAt: overtimeQuote.estimatedEnd.toISOString(),
          lat: coords.lat,
          lng: coords.lng,
          customerNotes: notes.trim() || undefined,
        } as any,
      } as any);

      // Lanjut ke payment screen (sama dengan flow per-ruangan)
      router.replace({ pathname: '/payment/[bookingId]', params: { bookingId: booking.id } });
    } catch {
      // Error toast sudah di-handle di store.create
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <LinearGradient
          colors={['#1E3A8A', '#047857', '#0E7490']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingBottom: 28, width: '100%', alignSelf: 'stretch' }}
        >
          <SafeAreaView edges={['top']}>
            <View className="flex-row items-center px-3 py-2">
              <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <ArrowLeft color="white" size={20} />
              </Pressable>
              <Text className="font-bold ml-2 flex-1 text-base text-white">Booking Per Jam</Text>
            </View>
            <View className="px-5 pt-2">
              <Text className="font-extrabold text-2xl text-white">{category?.name ?? 'Per Jam'}</Text>
              <Text className="font-sans mt-1 text-[12px] text-white/85">
                Bayar sesuai durasi kerja, fleksibel sesuai kebutuhan
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView className="-mt-5" contentContainerStyle={{ padding: 16, paddingBottom: 160 }}>
          {tiers.length === 0 ? (
            <View className="items-center rounded-2xl bg-white p-8 shadow-sm" style={{ elevation: 3 }}>
              <Text className="font-bold text-center text-sm text-ink-700">Tier per-jam belum tersedia</Text>
              <Text className="font-sans mt-2 text-center text-[12px] text-ink-500">
                Coba lagi sebentar atau hubungi CS.
              </Text>
            </View>
          ) : (
            <>
              {/* Tier picker */}
              <View className="rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                <Text className="font-bold text-sm text-ink-900">Jenis Pembersihan</Text>
                <View className="mt-3 gap-2">
                  {tiers.map((t) => {
                    const { Icon, tint, bg } = tierIcon(t.code);
                    const active = tier?.id === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => { setTierId(t.id); setHours(t.minHours); }}
                        className={`flex-row items-center gap-3 rounded-xl border-2 p-3 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                      >
                        <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: bg }}>
                          <Icon color={tint} size={18} strokeWidth={2.2} />
                        </View>
                        <View className="flex-1">
                          <Text className="font-bold text-[13px] text-ink-900">{t.name ?? '-'}</Text>
                          {t.description && (
                            <Text className="font-sans text-[11px] text-ink-500" numberOfLines={2}>
                              {t.description}
                            </Text>
                          )}
                        </View>
                        <View>
                          <Text className="font-extrabold text-[14px]" style={{ color: tint }}>
                            {rupiah(t.pricePerHour)}
                          </Text>
                          <Text className="font-sans text-right text-[10px] text-ink-500">/jam</Text>
                        </View>
                        {active && (
                          <View className="ml-1 h-5 w-5 items-center justify-center rounded-full bg-brand-600">
                            <Check color="white" size={12} strokeWidth={3} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Duration stepper */}
              {tier && (
                <View className="mt-3 rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                  <View className="flex-row items-center gap-2">
                    <Clock color="#1D4ED8" size={16} strokeWidth={2.4} />
                    <Text className="font-bold text-sm text-ink-900">Durasi Kerja</Text>
                  </View>
                  <Text className="font-sans mt-1 text-[11px] text-ink-500">
                    Min {minH} jam, maks {maxH} jam per sesi
                  </Text>
                  <View className="mt-4 flex-row items-center justify-between">
                    <Pressable
                      onPress={dec}
                      disabled={clampedHours <= minH}
                      className={`h-12 w-12 items-center justify-center rounded-full ${clampedHours <= minH ? 'bg-ink-100' : 'bg-brand-600'}`}
                    >
                      <Minus color={clampedHours <= minH ? '#94A3B8' : 'white'} size={20} strokeWidth={2.6} />
                    </Pressable>
                    <View className="items-center">
                      <Text className="font-extrabold text-4xl text-ink-900">{clampedHours}</Text>
                      <Text className="font-medium text-[11px] text-ink-500">jam</Text>
                    </View>
                    <Pressable
                      onPress={inc}
                      disabled={clampedHours >= maxH}
                      className={`h-12 w-12 items-center justify-center rounded-full ${clampedHours >= maxH ? 'bg-ink-100' : 'bg-brand-600'}`}
                    >
                      <Plus color={clampedHours >= maxH ? '#94A3B8' : 'white'} size={20} strokeWidth={2.6} />
                    </Pressable>
                  </View>
                  {/* Quick presets */}
                  <View className="mt-4 flex-row gap-2">
                    {[2, 3, 4, 6].filter((h) => h >= minH && h <= maxH).map((h) => (
                      <Pressable
                        key={h}
                        onPress={() => setHours(h)}
                        className={`flex-1 rounded-lg border py-2 ${clampedHours === h ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                      >
                        <Text className={`font-bold text-center text-[12px] ${clampedHours === h ? 'text-brand-700' : 'text-ink-600'}`}>
                          {h}j
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Address */}
              <View className="mt-3 rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                <Text className="font-bold text-sm text-ink-900">Alamat Pengerjaan</Text>
                <Text className="font-sans mt-1 mb-3 text-[11px] text-ink-500">
                  Pin lokasi biar cleaner bisa nyari rumah kamu
                </Text>
                {addressList.length > 0 && !useNewLocation ? (
                  <>
                    <AddressPickerInline
                      selectedId={selectedAddressId}
                      onSelect={(a) => {
                        setSelectedAddressId(a.id);
                        setAddress(a.addressLine);
                        setCoords({ lat: a.lat, lng: a.lng });
                      }}
                    />
                    <Pressable onPress={() => { setUseNewLocation(true); setCoords(null); }} className="mt-3 self-start">
                      <Text className="font-semibold text-xs text-brand-600">
                        + Pakai alamat lain (sekali pakai)
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <AddressField
                      value={address}
                      onChange={setAddress}
                      coords={coords}
                      onCoordsChange={setCoords}
                    />
                    {addressList.length > 0 && (
                      <Pressable
                        onPress={() => {
                          setUseNewLocation(false);
                          if (selectedAddress) {
                            setAddress(selectedAddress.addressLine);
                            setCoords({ lat: selectedAddress.lat, lng: selectedAddress.lng });
                          }
                        }}
                        className="mt-3 self-start"
                      >
                        <Text className="font-semibold text-xs text-brand-600">
                          ← Pakai alamat tersimpan
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>

              {/* Notes */}
              <View className="mt-3 rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                <Text className="font-bold text-sm text-ink-900">Deskripsi Pekerjaan</Text>
                <Text className="font-sans mt-1 mb-2 text-[11px] text-ink-500">
                  Wajib diisi agar cleaner tahu area dan prioritas yang harus dibersihkan
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Contoh: Fokus bersihkan toilet, lantai, wastafel, kaca, dan dinding area basah terlebih dahulu"
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  className="font-sans rounded-xl border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900"
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                />
              </View>

              {/* Schedule */}
              <View className="mt-3 rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                <Text className="font-bold text-sm text-ink-900">Jadwal Pengerjaan</Text>
                <Pressable
                  onPress={() => setSchedModalOpen(true)}
                  className="mt-2 flex-row items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3"
                >
                  <Calendar color="#1D4ED8" size={18} />
                  <Text className="font-semibold flex-1 text-[13px] text-brand-900">{formatScheduleLabel(scheduleAt)}</Text>
                  <Text className="font-bold text-[11px] text-brand-700">Ubah</Text>
                </Pressable>
                <Text className="font-sans mt-1.5 text-[10px] text-ink-500">
                  Jam operasional {OPS_START_HOUR}:00 - {OPS_END_HOUR}:00
                </Text>
              </View>

              {/* Info */}
              <View className="mt-3 flex-row items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Info color="#B45309" size={14} strokeWidth={2.4} />
                <View className="flex-1">
                  <Text className="font-bold text-[12px] text-amber-900">Cara kerja per-jam</Text>
                  <Text className="font-sans mt-0.5 text-[11px] leading-4 text-amber-900">
                    Pekerjaan selesai mengikuti estimasi waktu sejak cleaner mulai bekerja. Countdown durasi nanti tampil di aplikasi customer dan cleaner agar waktu kerja tercatat sama.
                  </Text>
                  <Text className="font-sans mt-1 text-[11px] leading-4 text-amber-900">
                    Jika estimasi pekerjaan lewat jam 21:00, biaya lembur otomatis ditambahkan Rp 50.000 per jam.
                  </Text>
                </View>
              </View>

              {/* Price breakdown */}
              {tier && (
                <View className="mt-3 rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                  <Text className="font-bold text-sm text-ink-900">Rincian Harga</Text>
                  <View className="mt-3 gap-2">
                    <View className="flex-row justify-between">
                      <Text className="font-sans text-[13px] text-ink-600">
                        {tier.name} · {clampedHours} jam
                      </Text>
                      <Text className="font-semibold text-[13px] text-ink-900">{rupiah(subtotal)}</Text>
                    </View>
                    {overtimeQuote.surcharge > 0 && (
                      <View className="flex-row justify-between gap-3">
                        <View className="flex-1">
                          <Text className="font-sans text-[13px] text-ink-600">
                            Biaya lembur malam ({overtimeQuote.overtimeHours} jam)
                          </Text>
                          <Text className="font-sans mt-0.5 text-[10px] text-amber-700">
                            Estimasi selesai {formatEndTime(overtimeQuote.estimatedEnd)}. Waktu lewat 21:00 dikenakan Rp 50.000 per jam.
                          </Text>
                        </View>
                        <Text className="font-semibold text-[13px] text-ink-900">{rupiah(overtimeQuote.surcharge)}</Text>
                      </View>
                    )}
                    <View className="my-2 h-px bg-ink-100" />
                    <View className="flex-row items-center justify-between">
                      <Text className="font-bold text-sm text-ink-900">Total</Text>
                      <Text className="font-extrabold text-xl text-brand-700">{rupiah(total)}</Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Sticky CTA */}
        {tier && (
          <View className="absolute bottom-0 left-0 right-0 border-t border-ink-100 bg-white px-4 pb-6 pt-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-sans text-[11px] text-ink-500">Total ({clampedHours} jam)</Text>
              <Text className="font-extrabold text-lg text-brand-700">{rupiah(total)}</Text>
            </View>
            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              className={`rounded-2xl py-4 ${submitting ? 'bg-brand-400' : 'bg-brand-600'}`}
              style={{ elevation: 3 }}
            >
              <Text className="font-bold text-center text-sm text-white">
                {submitting ? 'Memproses…' : 'Lanjut ke Pembayaran'}
              </Text>
            </Pressable>
          </View>
        )}

        <ScheduleModal
          visible={schedModalOpen}
          value={scheduleAt}
          onChange={(d) => { setScheduleAt(d); setSchedModalOpen(false); }}
          onClose={() => setSchedModalOpen(false)}
        />
      </View>
    </>
  );
}

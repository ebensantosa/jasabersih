import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlertTriangle, ArrowLeft, Calendar, Camera, Check, ChevronLeft, Clock, Minus, Plus } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { AddressPickerInline } from '../../src/components/AddressPicker';
import { Stepper } from '../../src/components/Stepper';
import { StepProgress } from '../../src/components/StepWizard';
import {
  ADDONS as LOCAL_ADDONS,
  DIRT_CHARACTERS,
  DIRT_LEVELS,
  FLOOR_OPTIONS,
  FLOOR_TYPES,
  FURNITURE_DENSITY,
  PACKAGES as LOCAL_PACKAGES,
  PROPERTY_TYPES,
  ROOM_FACILITIES,
  SERVICE_CATEGORIES,
  formatRupiah,
  type FurnitureDensity,
  type PropertyType,
} from '../../src/data/catalog';
import { useAddressesStore } from '../../src/stores/addresses';
import { useApiAddons, useApiPackagesForService, useConfig } from '../../src/stores/appContent';
import { useServices } from '../../src/hooks/useServices';
import { useBookingsStore } from '../../src/stores/bookings';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { applyCleanMode, useCleaningModeStore } from '../../src/stores/cleaningMode';

// Operasional 07:00–21:00. Earliest slot = sekarang + 1 jam (snap ke ops window).
const OPS_START_HOUR = 7;
const OPS_END_HOUR = 21;
function earliestAvailable(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  if (d.getHours() < OPS_START_HOUR) {
    d.setHours(OPS_START_HOUR, 0, 0, 0);
  } else if (d.getHours() >= OPS_END_HOUR) {
    d.setDate(d.getDate() + 1);
    d.setHours(OPS_START_HOUR, 0, 0, 0);
  }
  return d;
}
function formatScheduleLabel(d: Date): string {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = (dd.getTime() - today.getTime()) / (24 * 3600 * 1000);
  const dayLabel = diff === 0 ? 'Hari ini' : diff === 1 ? 'Besok' : `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dayLabel} · ${hh}:${mm}`;
}

const STEP_LABELS = ['Properti', 'Kondisi', 'Jadwal'];
const TOTAL_STEPS = 3;

function NewBooking() {
  const router = useRouter();
  const { category: categoryCode, package: packageId } = useLocalSearchParams<{
    category: string;
    package?: string;
  }>();
  const create = useBookingsStore((s) => s.create);
  const SERVICE_CATEGORIES_LIVE = useServices();

  const category = SERVICE_CATEGORIES_LIVE.find((c) => c.code === categoryCode) ?? SERVICE_CATEGORIES[0];

  // Prefer API packages for this service code (admin-editable). Fallback to local.
  const apiPackages = useApiPackagesForService(category?.code ?? '');
  const PACKAGES = useMemo(() => {
    if (apiPackages.length > 0) {
      return apiPackages.map((p) => ({
        id: p.id,
        categoryCode: category?.code ?? '',
        name: p.name,
        price: Number(p.price),
        durationMin: Number(p.durationMin),
        scope: typeof p.scope === 'string' ? p.scope : (p.scope?.note ?? ''),
        includes: Array.isArray((p.scope as any)?.includes) ? (p.scope as any).includes as string[] : [],
        note: typeof p.scope === 'object' && p.scope ? (p.scope as any).note as string | undefined : undefined,
      }));
    }
    return LOCAL_PACKAGES.map((p) => ({ ...p, includes: [] as string[], note: undefined as string | undefined }));
  }, [apiPackages, category?.code]);

  // Merge API addons with local icons (icons stay hardcoded by code).
  const apiAddons = useApiAddons();
  const ADDONS = useMemo(() => {
    if (apiAddons.length === 0) return LOCAL_ADDONS;
    const localByCode = new Map(LOCAL_ADDONS.map((a) => [a.code, a]));
    return apiAddons.map((a) => {
      const local = a.code ? localByCode.get(a.code) : undefined;
      return {
        code: a.code ?? a.id,
        name: a.name,
        price: Number(a.price),
        durationMin: Number(a.durationMin),
        unit: local?.unit,
        icon: local?.icon ?? LOCAL_ADDONS[0]!.icon,
      };
    });
  }, [apiAddons]);

  const categoryPackages = PACKAGES.filter((p) => p.categoryCode === category?.code);
  const initialPackage =
    PACKAGES.find((p) => p.id === packageId) ?? categoryPackages[0] ?? PACKAGES[0];

  const [step, setStep] = useState(1);

  const [pickedPackageId, setPickedPackageId] = useState<string>(initialPackage?.id ?? '');
  const pkg = PACKAGES.find((p) => p.id === pickedPackageId);

  const cleanMode = useCleaningModeStore((s) => s.mode);
  const setCleaningMode = useCleaningModeStore((s) => s.setMode);
  const deepMultiplierRaw = useConfig('pricing.deep_clean_multiplier' as any, 1.45 as any);
  const deepMultiplier = Number(deepMultiplierRaw) || 1.45;

  const [propertyType, setPropertyType] = useState<PropertyType>('Rumah');
  const [floor, setFloor] = useState<string>('1');
  const [hasLift, setHasLift] = useState(false);
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [facilities, setFacilities] = useState<Set<string>>(new Set(['Dapur', 'Ruang Tamu']));
  const [areaM2, setAreaM2] = useState(60);

  const [dirtLevel, setDirtLevel] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [photoCount, setPhotoCount] = useState(0);
  const [dirtChars, setDirtChars] = useState<Set<string>>(new Set(['Debu']));
  const [floorType, setFloorType] = useState<string>('Keramik');
  const [furniture, setFurniture] = useState<FurnitureDensity>('Sedang');
  const [hasWater, setHasWater] = useState(true);
  const [hasElectricity, setHasElectricity] = useState(true);
  const [hasPet, setHasPet] = useState(false);
  const [petNote, setPetNote] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());

  const savedLocation = useLocationStore((s) => s.current);
  const addressList = useAddressesStore((s) => s.list);
  const defaultAddress = addressList.find((a) => a.isDefault) ?? addressList[0] ?? null;

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    defaultAddress?.id ?? null,
  );
  const selectedAddress = addressList.find((a) => a.id === selectedAddressId);

  const [scheduleAt, setScheduleAt] = useState<Date>(() => earliestAvailable());
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const scheduleIso = scheduleAt.toISOString();
  const [address, setAddress] = useState(
    selectedAddress?.addressLine ?? savedLocation?.address ?? '',
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    selectedAddress
      ? { lat: selectedAddress.lat, lng: selectedAddress.lng }
      : savedLocation
        ? { lat: savedLocation.lat, lng: savedLocation.lng }
        : null,
  );
  const [addressError, setAddressError] = useState<string | null>(null);
  const [useNewLocation, setUseNewLocation] = useState(addressList.length === 0);

  const scrollRef = useRef<ScrollView>(null);

  const dirtMultiplier = DIRT_LEVELS.find((d) => d.level === dirtLevel)?.multiplier ?? 1;
  const photoPenalty = dirtLevel >= 4 && photoCount < 3 ? 0.25 : 0;
  const rawPackagePrice = pkg?.price ?? 0;
  const basePrice = applyCleanMode(rawPackagePrice, cleanMode, deepMultiplier);
  const deepSurcharge = cleanMode === 'deep' ? basePrice - rawPackagePrice : 0;
  const dirtSurcharge = Math.round(basePrice * (dirtMultiplier - 1 + photoPenalty));

  // Penyesuaian luas: baseline 60 m², +5% per 20 m² ekstra, max +20%
  const areaSteps = Math.min(4, Math.max(0, Math.floor((areaM2 - 60) / 20)));
  const sizePctExtra = areaSteps * 0.05;
  const sizeSurcharge = Math.round(basePrice * sizePctExtra);

  // Lantai: floor 1 baseline; floor 2 +10%; floor 3 +20%; >3 +30%. Tanpa lift = +5% extra (capek angkut alat).
  const floorN = floor === '>3' ? 4 : Math.max(1, parseInt(floor, 10) || 1);
  const floorPct = floorN === 1 ? 0 : floorN === 2 ? 0.10 : floorN === 3 ? 0.20 : 0.30;
  const noLiftPenalty = floorN >= 3 && !hasLift ? 0.05 : 0;
  const floorPctTotal = floorPct + noLiftPenalty;
  const floorSurcharge = Math.round(basePrice * floorPctTotal);

  // Ruangan ekstra: kamar tidur ke-2+ +10% per kamar (max 4 ekstra), kamar mandi ke-2+ +5% per (max 3 ekstra)
  const extraBedrooms = Math.min(4, Math.max(0, bedrooms - 1));
  const extraBathrooms = Math.min(3, Math.max(0, bathrooms - 1));
  const roomPctExtra = extraBedrooms * 0.10 + extraBathrooms * 0.05;
  const roomSurcharge = Math.round(basePrice * roomPctExtra);

  // Tipe properti modifier
  const propertyMultiplier =
    propertyType === 'Villa' ? 0.15 :
    propertyType === 'Apartemen' ? 0.05 :
    propertyType === 'Ruko' || propertyType === 'Kantor' ? 0.10 :
    0;
  const propertySurcharge = Math.round(basePrice * propertyMultiplier);

  // Hewan peliharaan: +Rp 15k flat (extra time + risiko alergi/cleaner takut)
  const petSurcharge = hasPet ? 15000 : 0;

  const addonTotal = useMemo(
    () => ADDONS.filter((a) => selectedAddons.has(a.code)).reduce((s, a) => s + a.price, 0),
    [selectedAddons],
  );
  // basePrice sudah include deepSurcharge (via applyCleanMode). Surcharge lain = additive di atasnya.
  const subtotal = basePrice + dirtSurcharge + sizeSurcharge + floorSurcharge + roomSurcharge + propertySurcharge + petSurcharge + addonTotal;
  const [voucher, setVoucher] = useState<{ code: string; discount: number; voucherId: string } | null>(null);
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherChecking, setVoucherChecking] = useState(false);
  const total = subtotal - (voucher?.discount ?? 0);

  async function applyVoucher() {
    if (!voucherInput.trim()) return;
    setVoucherChecking(true);
    try {
      const { api } = await import('../../src/lib/api');
      const res = await api.post('/vouchers/validate', { code: voucherInput.trim().toUpperCase(), orderAmount: subtotal });
      const data = res.data?.data ?? res.data;
      setVoucher({ code: data.code, discount: data.discount, voucherId: data.voucherId });
      setVoucherInput('');
      toast.success(`Voucher ${data.code} dipakai — hemat ${formatRupiah(data.discount)}!`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Voucher tidak valid');
    } finally {
      setVoucherChecking(false);
    }
  }

  function toggleSet<T extends string>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function next() {
    if (step === 1 && !pkg) {
      toast.error('Pilih paket dulu');
      return;
    }
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      submit();
    }
  }

  function back() {
    if (step > 1) {
      setStep(step - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      router.back();
    }
  }

  function submit() {
    if (!pkg || !category) return;
    if (!address.trim()) {
      setAddressError('Alamat wajib diisi (pin di peta atau ketik manual)');
      toast.error('Alamat wajib diisi');
      return;
    }
    setAddressError(null);
    if (dirtLevel >= 4 && photoCount < 3) {
      Alert.alert(
        'Foto wajib di skala 4–5',
        'Min 3 foto. Tanpa foto, harga +25% sebagai ketidakpastian premium. Lanjut?',
        [
          { text: 'Batal', style: 'cancel' },
          { text: 'Lanjut', onPress: doSubmit },
        ],
      );
      return;
    }
    doSubmit();
  }

  function doSubmit() {
    if (!pkg || !category) return;
    const booking = create({
      pricingMode: 'package',
      categoryCode: category.code,
      categoryName: category.name,
      categoryImage: category.imageUrl,
      packageId: pkg.id,
      packageName: cleanMode === 'deep' ? `${pkg.name} (Deep Cleaning)` : pkg.name,
      addressLine: address,
      scheduledAt: scheduleIso,
      addOns: ADDONS.filter((a) => selectedAddons.has(a.code)).map((a) => ({
        code: a.code,
        name: a.name,
        price: a.price,
      })),
      basePrice,
      dirtSurcharge,
      totalPrice: total,
      formSnapshot: {
        propertyType,
        floor,
        hasLift,
        bedrooms,
        bathrooms,
        facilities: Array.from(facilities),
        areaM2,
        dirtLevel,
        dirtCharacters: Array.from(dirtChars),
        floorType,
        furnitureDensity: furniture,
        hasWater,
        hasElectricity,
        hasPet,
        petNote,
        notes,
        photoCount,
        cleanMode,
        cleanModeMultiplier: cleanMode === 'deep' ? deepMultiplier : 1,
      },
      initialStatus: 'pending_payment',
    });
    toast.success('Pesanan dibuat — silakan bayar untuk mulai cari cleaner');
    router.replace({ pathname: '/booking/[id]', params: { id: booking.id } });
  }

  if (!category) return null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-white">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={back} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <View className="ml-1 flex-1">
              <Text className="font-bold text-base text-ink-900">{category.name}</Text>
            </View>
          </View>
          <StepProgress current={step} total={TOTAL_STEPS} labels={STEP_LABELS} />
        </SafeAreaView>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: 180 }}
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <>
              {categoryPackages.length > 0 && (
                <Section title="Pilih Paket">
                  <View className="gap-2">
                    {categoryPackages.map((p) => {
                      const active = p.id === pickedPackageId;
                      const includes: string[] = (p as any).includes ?? [];
                      const note: string | undefined = (p as any).note;
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => setPickedPackageId(p.id)}
                          className={`rounded-xl border p-3 ${
                            active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                          }`}
                        >
                          <View className="flex-row items-center justify-between">
                            <Text className="font-semibold flex-1 text-sm text-ink-900">{p.name}</Text>
                            <View className="items-end">
                              <Text className="font-bold text-sm text-brand-600">{formatRupiah(applyCleanMode(p.price, cleanMode, deepMultiplier))}</Text>
                              {cleanMode === 'deep' && (
                                <Text className="font-sans text-[10px] text-ink-400 line-through">{formatRupiah(p.price)}</Text>
                              )}
                              <Text className="font-sans text-[10px] text-ink-500">±{p.durationMin} menit</Text>
                            </View>
                          </View>
                          {includes.length > 0 && (
                            <View className="mt-2">
                              <Text className="font-semibold mb-1 text-[10px] uppercase tracking-wider text-ink-500">Termasuk:</Text>
                              {includes.slice(0, active ? 99 : 3).map((it, i) => (
                                <View key={i} className="flex-row gap-1.5 py-0.5">
                                  <Text className="font-sans text-[11px] text-success">✓</Text>
                                  <Text className="font-sans flex-1 text-[11px] text-ink-700">{it}</Text>
                                </View>
                              ))}
                              {!active && includes.length > 3 && (
                                <Text className="font-medium mt-1 text-[10px] text-brand-600">+{includes.length - 3} item lain · tap untuk lihat semua</Text>
                              )}
                            </View>
                          )}
                          {note && (
                            <View className="mt-2 rounded bg-amber-50 px-2 py-1">
                              <Text className="font-sans text-[10px] text-amber-800">â“˜ {note}</Text>
                            </View>
                          )}
                          {p.scope && includes.length === 0 && (
                            <Text className="font-sans mt-1 text-[11px] text-ink-600">{p.scope}</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>
              )}

              <Section title="Properti">
                <Label>Tipe Properti</Label>
                <Chips
                  options={PROPERTY_TYPES as readonly string[]}
                  value={propertyType}
                  onChange={(v) => setPropertyType(v as PropertyType)}
                />
                <Label className="mt-3">Lantai / Tingkat</Label>
                <Chips options={FLOOR_OPTIONS as readonly string[]} value={floor} onChange={setFloor} />
                {(propertyType === 'Apartemen' || floor !== '1') && (
                  <View className="mt-3">
                    <ToggleRow label="Akses Lift" value={hasLift} onChange={setHasLift} />
                  </View>
                )}
              </Section>

              <Section title="Ruangan">
                <View className="flex-row items-center justify-between">
                  <Label className="mb-0">Kamar Tidur</Label>
                  <Stepper value={bedrooms} onChange={setBedrooms} min={0} max={10} />
                </View>
                <View className="mt-3 flex-row items-center justify-between">
                  <Label className="mb-0">Kamar Mandi</Label>
                  <Stepper value={bathrooms} onChange={setBathrooms} min={0} max={10} />
                </View>
                <Label className="mt-4">Fasilitas Lain</Label>
                <View className="flex-row flex-wrap gap-2">
                  {ROOM_FACILITIES.map((f) => {
                    const active = facilities.has(f);
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setFacilities(toggleSet(facilities, f))}
                        className={`rounded-full border px-3 py-1.5 ${
                          active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
                        }`}
                      >
                        <Text
                          className={`font-semibold text-xs ${active ? 'text-white' : 'text-ink-700'}`}
                        >
                          {f}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>

              <Section title="Perkiraan Luas">
                <Text className="font-sans -mt-1 mb-3 text-[11px] text-ink-500">
                  Pilih kira-kira ukuran area yang akan dibersihkan. Kalau ragu, lihat contoh di bawah.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {[
                    { value: 25, label: 'Kost / Studio', range: '~25 m²' },
                    { value: 50, label: 'Rumah Kecil', range: '~50 m²' },
                    { value: 80, label: 'Rumah Sedang', range: '~80 m²' },
                    { value: 120, label: 'Rumah Besar', range: '~120 m²' },
                    { value: 200, label: 'Sangat Besar', range: '200+ m²' },
                  ].map((opt) => {
                    const active = areaM2 === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setAreaM2(opt.value)}
                        className={`rounded-xl border px-3 py-2 ${
                          active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                        }`}
                      >
                        <Text className={`font-bold text-[12px] ${active ? 'text-brand-700' : 'text-ink-900'}`}>
                          {opt.label}
                        </Text>
                        <Text className="font-sans text-[10px] text-ink-500">{opt.range}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View className="mt-4 rounded-xl bg-ink-50 p-3">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="font-semibold text-[10px] uppercase tracking-wider text-ink-500">
                        Atau atur sendiri
                      </Text>
                      <Text className="font-extrabold text-base text-ink-900">{areaM2} m²</Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => setAreaM2(Math.max(10, areaM2 - 10))}
                        className="h-10 w-10 items-center justify-center rounded-full border border-ink-300 bg-white"
                      >
                        <Minus color="#1D4ED8" size={18} strokeWidth={2.4} />
                      </Pressable>
                      <Pressable
                        onPress={() => setAreaM2(Math.min(500, areaM2 + 10))}
                        className="h-10 w-10 items-center justify-center rounded-full border border-ink-300 bg-white"
                      >
                        <Plus color="#1D4ED8" size={18} strokeWidth={2.4} />
                      </Pressable>
                    </View>
                  </View>
                  <Text className="font-sans mt-1.5 text-[10px] text-ink-500">
                    Tap +/- untuk naik/turun 10 m². Min 10 m², max 500 m².
                  </Text>
                </View>
              </Section>
            </>
          )}

          {step === 2 && (
            <>
              <Section title="Tingkat Kotor">
                <View className="flex-row gap-1.5">
                  {DIRT_LEVELS.map((d) => {
                    const active = d.level === dirtLevel;
                    return (
                      <Pressable
                        key={d.level}
                        onPress={() => setDirtLevel(d.level)}
                        className={`flex-1 items-center rounded-xl border py-2.5 ${
                          active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
                        }`}
                      >
                        <Text className={`font-bold text-base ${active ? 'text-white' : 'text-ink-900'}`}>
                          {d.level}
                        </Text>
                        <Text
                          className={`font-medium text-[10px] ${active ? 'text-white' : 'text-ink-500'}`}
                        >
                          {d.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="font-sans mt-2 text-[11px] text-ink-500">
                  {DIRT_LEVELS.find((d) => d.level === dirtLevel)?.desc}
                </Text>
                {dirtLevel >= 4 && (
                  <View className="mt-3 flex-row gap-2 rounded-xl bg-amber-50 p-3">
                    <AlertTriangle color="#B45309" size={16} />
                    <Text className="font-medium flex-1 text-[11px] text-amber-900">
                      Foto wajib min 3. Tanpa foto: harga +25%.
                    </Text>
                  </View>
                )}

                <Label className="mt-4">Foto Kondisi</Label>
                <View className="flex-row flex-wrap gap-2">
                  {Array.from({ length: Math.max(3, photoCount + 1) }).map((_, i) => {
                    const filled = i < photoCount;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => setPhotoCount(filled ? photoCount - 1 : photoCount + 1)}
                        className={`h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed ${
                          filled ? 'border-brand-600 bg-brand-50' : 'border-ink-300 bg-ink-50'
                        }`}
                      >
                        <Camera color={filled ? '#1D4ED8' : '#94A3B8'} size={20} strokeWidth={2.2} />
                        <Text
                          className={`font-medium mt-1 text-[10px] ${
                            filled ? 'text-brand-700' : 'text-ink-500'
                          }`}
                        >
                          {filled ? 'Foto ' + (i + 1) : '+ Tambah'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Label className="mt-4">Karakter Kotor</Label>
                <View className="flex-row flex-wrap gap-2">
                  {DIRT_CHARACTERS.map((c) => {
                    const active = dirtChars.has(c);
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setDirtChars(toggleSet(dirtChars, c))}
                        className={`rounded-full border px-3 py-1.5 ${
                          active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
                        }`}
                      >
                        <Text className={`font-medium text-xs ${active ? 'text-white' : 'text-ink-700'}`}>
                          {c}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>

              <Section title="Material & Akses">
                <Label>Tipe Lantai</Label>
                <Chips
                  options={FLOOR_TYPES as readonly string[]}
                  value={floorType}
                  onChange={setFloorType}
                />
                <Label className="mt-3">Furniture</Label>
                <Chips
                  options={FURNITURE_DENSITY as readonly string[]}
                  value={furniture}
                  onChange={(v) => setFurniture(v as FurnitureDensity)}
                />
                <View className="mt-3 gap-2">
                  <ToggleRow label="Sumber Air Tersedia" value={hasWater} onChange={setHasWater} />
                  <ToggleRow
                    label="Sumber Listrik (untuk vacuum)"
                    value={hasElectricity}
                    onChange={setHasElectricity}
                  />
                  <ToggleRow label="Hewan Peliharaan" value={hasPet} onChange={setHasPet} />
                </View>
                {hasPet && (
                  <TextInput
                    value={petNote}
                    onChangeText={setPetNote}
                    placeholder="Tipe & jumlah (mis. 2 kucing)"
                    placeholderTextColor="#94A3B8"
                    className="font-sans mt-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm"
                  />
                )}
              </Section>

              <Section title="Add-on (Opsional)">
                <View className="gap-2">
                  {ADDONS.map((a) => {
                    const active = selectedAddons.has(a.code);
                    return (
                      <Pressable
                        key={a.code}
                        onPress={() => setSelectedAddons(toggleSet(selectedAddons, a.code))}
                        className={`flex-row items-center gap-3 rounded-xl border p-3 ${
                          active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                        }`}
                      >
                        <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                          <a.icon color="#1D4ED8" size={18} strokeWidth={2.2} />
                        </View>
                        <View className="flex-1">
                          <Text className="font-semibold text-sm text-ink-900">{a.name}</Text>
                          <Text className="font-medium text-[11px] text-brand-600">
                            +{formatRupiah(a.price)}
                            {a.unit ? (
                              <Text className="font-sans text-[10px] text-ink-500"> {a.unit}</Text>
                            ) : null}
                          </Text>
                        </View>
                        <View
                          className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                            active ? 'border-brand-600 bg-brand-600' : 'border-ink-300'
                          }`}
                        >
                          {active && <Check color="white" size={14} strokeWidth={3} />}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>

              <Section title="Catatan untuk Cleaner">
                <TextInput
                  value={notes}
                  onChangeText={(v) => v.length <= 200 && setNotes(v)}
                  multiline
                  placeholder="Misal: kunci di pos satpam, ada bayi tidur jam 13.00"
                  placeholderTextColor="#94A3B8"
                  className="font-sans rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm"
                  style={{ minHeight: 60 }}
                />
                <Text className="font-medium mt-1 self-end text-[10px] text-ink-400">
                  {notes.length}/200
                </Text>
              </Section>
            </>
          )}

          {step === 3 && (
            <>
              <Section title="Kapan dikerjakan">
                {Platform.OS === 'web' ? (
                  <WebSchedulePicker value={scheduleAt} onChange={setScheduleAt} />
                ) : (
                  <Pressable
                    onPress={() => setPickerMode('date')}
                    className="flex-row items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3"
                  >
                    <View>
                      <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">Pilih Tanggal & Jam</Text>
                      <Text className="font-bold mt-0.5 text-sm text-ink-900">
                        {formatScheduleLabel(scheduleAt)}
                      </Text>
                    </View>
                    <Calendar color="#1D4ED8" size={18} />
                  </Pressable>
                )}
                <Text className="mt-2 text-[11px] text-ink-500">
                  Operasional 07:00–21:00. Paling cepat 1 jam dari sekarang.
                </Text>
                {Platform.OS !== 'web' && pickerMode && (
                  <DateTimePicker
                    value={scheduleAt}
                    mode={pickerMode}
                    minimumDate={earliestAvailable()}
                    is24Hour
                    onChange={(event, selected) => {
                      const wasMode = pickerMode;
                      // Android closes after each pick; iOS stays open until manual dismiss.
                      // Either way: process this pick, then chain to time if was date.
                      if (Platform.OS === 'android') setPickerMode(null);
                      if (event?.type === 'dismissed' || !selected) {
                        setPickerMode(null);
                        return;
                      }
                      const next = new Date(scheduleAt);
                      if (wasMode === 'date') {
                        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                      } else {
                        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                      }
                      // Enforce ops window
                      if (next.getHours() < OPS_START_HOUR) next.setHours(OPS_START_HOUR, 0, 0, 0);
                      if (next.getHours() >= OPS_END_HOUR) next.setHours(OPS_END_HOUR - 1, 0, 0, 0);
                      // Enforce min = now+1h
                      const min = earliestAvailable();
                      if (next.getTime() < min.getTime()) {
                        toast.error('Jadwal minimal 1 jam dari sekarang');
                        setScheduleAt(min);
                        setPickerMode(null);
                        return;
                      }
                      setScheduleAt(next);
                      // After date picked, auto-open time picker — single-flow UX.
                      if (wasMode === 'date') {
                        if (Platform.OS === 'android') setTimeout(() => setPickerMode('time'), 100);
                        else setPickerMode('time');
                      } else {
                        setPickerMode(null);
                      }
                    }}
                  />
                )}
              </Section>

              <Section title="Alamat">
                {addressList.length > 0 && !useNewLocation && (
                  <>
                    <AddressPickerInline
                      selectedId={selectedAddressId}
                      onSelect={(a) => {
                        setSelectedAddressId(a.id);
                        setAddress(a.addressLine);
                        setCoords({ lat: a.lat, lng: a.lng });
                        setAddressError(null);
                      }}
                      error={addressError}
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
                    <AddressField
                      value={address}
                      onChange={(v) => {
                        setAddress(v);
                        if (addressError && v.trim()) setAddressError(null);
                      }}
                      coords={coords}
                      onCoordsChange={setCoords}
                      error={addressError}
                    />
                    {addressList.length > 0 && (
                      <Pressable
                        onPress={() => setUseNewLocation(false)}
                        className="mt-3 self-start"
                      >
                        <Text className="font-semibold text-xs text-brand-600">
                          ←  Pakai alamat tersimpan
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </Section>

              <Section title="Upgrade Deep Cleaning (Opsional)">
                <Pressable
                  onPress={() => setCleaningMode(cleanMode === 'deep' ? 'general' : 'deep')}
                  className={`flex-row items-start gap-3 rounded-xl border p-3 ${
                    cleanMode === 'deep' ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                  }`}
                >
                  <View
                    className={`mt-0.5 h-5 w-5 items-center justify-center rounded border-2 ${
                      cleanMode === 'deep' ? 'border-brand-600 bg-brand-600' : 'border-ink-300 bg-white'
                    }`}
                  >
                    {cleanMode === 'deep' && <Check color="white" size={14} strokeWidth={3} />}
                  </View>
                  <View className="flex-1">
                    <Text className={`font-bold text-sm ${cleanMode === 'deep' ? 'text-brand-700' : 'text-ink-900'}`}>
                      Pakai Deep Cleaning
                    </Text>
                    <Text className="font-sans mt-1 text-[11px] leading-4 text-ink-600">
                      Pembersihan menyeluruh sampai ke detail: kerak kamar mandi, jamur nat, noda
                      membandel, bekas renovasi, sela-sela furnitur. Pakai cairan khusus &amp; waktu
                      pengerjaan lebih lama.
                    </Text>
                    {cleanMode === 'deep' && (
                      <View className="mt-2 rounded bg-amber-50 px-2 py-1">
                        <Text className="font-medium text-[10px] text-amber-800">
                          ⓘ Harga sudah disesuaikan untuk deep cleaning
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              </Section>

              <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
                <Text className="font-bold text-sm text-ink-900">Rincian Harga</Text>
                <View className="mt-3 gap-2">
                  {pkg && <Row label={pkg.name} value={formatRupiah(rawPackagePrice)} />}
                  {deepSurcharge > 0 && (
                    <Row
                      label="Upgrade Deep Cleaning"
                      value={`+${formatRupiah(deepSurcharge)}`}
                    />
                  )}
                  {sizeSurcharge > 0 && (
                    <Row
                      label={`Luas ${areaM2} m²`}
                      value={`+${formatRupiah(sizeSurcharge)}`}
                    />
                  )}
                  {floorSurcharge > 0 && (
                    <Row
                      label={`Lantai ${floor}${noLiftPenalty > 0 ? ' (tanpa lift)' : ''}`}
                      value={`+${formatRupiah(floorSurcharge)}`}
                    />
                  )}
                  {roomSurcharge > 0 && (
                    <Row
                      label={`${extraBedrooms > 0 ? `+${extraBedrooms} kamar` : ''}${extraBedrooms > 0 && extraBathrooms > 0 ? ' & ' : ''}${extraBathrooms > 0 ? `+${extraBathrooms} kamar mandi` : ''}`}
                      value={`+${formatRupiah(roomSurcharge)}`}
                    />
                  )}
                  {propertySurcharge > 0 && (
                    <Row
                      label={`Tipe ${propertyType}`}
                      value={`+${formatRupiah(propertySurcharge)}`}
                    />
                  )}
                  {dirtMultiplier > 1 && (
                    <Row
                      label={`Tingkat kotor ${dirtLevel}`}
                      value={`+${formatRupiah(Math.round(basePrice * (dirtMultiplier - 1)))}`}
                    />
                  )}
                  {photoPenalty > 0 && (
                    <Row
                      label="Premium tanpa foto"
                      value={`+${formatRupiah(Math.round(basePrice * 0.25))}`}
                    />
                  )}
                  {petSurcharge > 0 && (
                    <Row label="Ada hewan peliharaan" value={`+${formatRupiah(petSurcharge)}`} />
                  )}
                  {ADDONS.filter((a) => selectedAddons.has(a.code)).map((a) => (
                    <Row key={a.code} label={a.name} value={`+${formatRupiah(a.price)}`} />
                  ))}
                </View>

                <View className="mt-3 border-t border-ink-100 pt-3">
                  <Text className="font-semibold mb-2 text-[11px] uppercase tracking-wider text-ink-500">Voucher / Promo</Text>
                  {voucher ? (
                    <View className="flex-row items-center justify-between rounded-xl border border-success/30 bg-success/10 p-3">
                      <View>
                        <Text className="font-bold text-sm text-success">{voucher.code}</Text>
                        <Text className="font-sans text-[11px] text-ink-600">-{formatRupiah(voucher.discount)}</Text>
                      </View>
                      <Pressable onPress={() => setVoucher(null)} className="rounded-full bg-white px-3 py-1">
                        <Text className="font-medium text-xs text-ink-600">Hapus</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View className="flex-row gap-2">
                      <TextInput
                        value={voucherInput}
                        onChangeText={(v) => setVoucherInput(v.toUpperCase())}
                        placeholder="Masukkan kode"
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="characters"
                        className="font-sans flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-900"
                      />
                      <Pressable
                        onPress={applyVoucher}
                        disabled={voucherChecking || !voucherInput.trim()}
                        className={`rounded-xl px-4 py-2.5 ${voucherChecking || !voucherInput.trim() ? 'bg-brand-300' : 'bg-brand-600'}`}
                      >
                        <Text className="font-semibold text-sm text-white">{voucherChecking ? 'Cek…' : 'Pakai'}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                <View className="mt-3 border-t border-ink-100 pt-3">
                  <Row label="Subtotal" value={formatRupiah(subtotal)} />
                  {voucher && <Row label={`Voucher (${voucher.code})`} value={`-${formatRupiah(voucher.discount)}`} />}
                  <View className="mt-2 border-t border-ink-100 pt-2">
                    <Row label="Total" value={formatRupiah(total)} bold />
                  </View>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white" style={{ elevation: 8 }}>
          <SafeAreaView edges={['bottom']}>
            {pkg && (
              <View className="flex-row items-center justify-between border-b border-ink-100 px-4 py-3">
                <View className="flex-1 pr-2">
                  <Text className="font-sans text-[10px] uppercase tracking-wider text-ink-500">
                    {step === TOTAL_STEPS ? 'Total Bayar' : 'Estimasi Total'}
                  </Text>
                  <Text className="font-extrabold mt-0.5 text-lg text-brand-700">{formatRupiah(total)}</Text>
                </View>
                {step !== TOTAL_STEPS && (
                  <Text className="font-medium max-w-[40%] text-right text-[9px] text-ink-400">
                    Bisa berubah saat tambah pilihan
                  </Text>
                )}
              </View>
            )}
            <View className="flex-row gap-2 p-4">
              <Pressable
                onPress={back}
                className="h-12 flex-row items-center justify-center gap-1 rounded-2xl border border-ink-300 px-4"
              >
                <ChevronLeft color="#475569" size={18} strokeWidth={2.2} />
                <Text className="font-semibold text-sm text-ink-700">
                  {step === 1 ? 'Batal' : 'Kembali'}
                </Text>
              </Pressable>
              <Pressable onPress={next} className="h-12 flex-1 items-center justify-center rounded-2xl bg-brand-600">
                <Text className="font-bold text-sm text-white" numberOfLines={1}>
                  {step === TOTAL_STEPS ? `Buat Pesanan · ${formatRupiah(total)}` : 'Lanjut'}
                </Text>
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

function Chips({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            className={`rounded-full border px-3 py-1.5 ${
              active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
            }`}
          >
            <Text className={`font-semibold text-xs ${active ? 'text-white' : 'text-ink-700'}`}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} className="flex-row items-center justify-between py-1">
      <Text className="font-medium text-sm text-ink-800">{label}</Text>
      <View className={`h-6 w-11 rounded-full p-0.5 ${value ? 'bg-brand-600' : 'bg-ink-300'}`}>
        <View className={`h-5 w-5 rounded-full bg-white ${value ? 'self-end' : 'self-start'}`} />
      </View>
    </Pressable>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className={`text-sm ${bold ? 'font-bold text-ink-900' : 'font-sans text-ink-600'}`}>
        {label}
      </Text>
      <Text className={`text-sm ${bold ? 'font-bold text-brand-600' : 'font-semibold text-ink-800'}`}>
        {value}
      </Text>
    </View>
  );
}


// Web-only schedule picker — uses native HTML <input type="date|time"> via
// React Native Web. Validates ops window 07–21 and min lead-time = now+1h.
function WebSchedulePicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const min = earliestAvailable();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocal = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function commit(next: Date) {
    if (next.getHours() < OPS_START_HOUR) next.setHours(OPS_START_HOUR, 0, 0, 0);
    if (next.getHours() >= OPS_END_HOUR) next.setHours(OPS_END_HOUR - 1, 0, 0, 0);
    if (next.getTime() < earliestAvailable().getTime()) {
      toast.error('Jadwal minimal 1 jam dari sekarang');
      onChange(earliestAvailable());
      return;
    }
    onChange(next);
  }

  return (
    // @ts-expect-error — host elements work in react-native-web
    <input
      type="datetime-local"
      value={toLocal(value)}
      min={toLocal(min)}
      step={60 * 15}
      onChange={(e: any) => {
        const v = String(e.target.value);
        if (!v) return;
        const next = new Date(v);
        if (Number.isNaN(next.getTime())) return;
        commit(next);
      }}
      style={{
        width: '100%',
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        background: 'white',
        fontSize: 14,
        color: '#0F172A',
        outline: 'none',
        fontFamily: 'inherit',
      } as any}
    />
  );
}

export default withAuth(NewBooking, 'customer');

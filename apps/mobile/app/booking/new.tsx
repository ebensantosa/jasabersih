import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, Camera, Check, ChevronLeft } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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

  const [date, setDate] = useState(DATE_OPTIONS[0]?.iso ?? '');
  const [time, setTime] = useState('10:00');
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
  // Estimasi tambah luas: baseline 60 m², +5% per 20 m² ekstra, max +20%
  const areaSteps = Math.min(4, Math.max(0, Math.floor((areaM2 - 60) / 20)));
  const sizePctExtra = areaSteps * 0.05;
  const sizeSurcharge = Math.round(basePrice * sizePctExtra);
  const addonTotal = useMemo(
    () => ADDONS.filter((a) => selectedAddons.has(a.code)).reduce((s, a) => s + a.price, 0),
    [selectedAddons],
  );
  const subtotal = basePrice + dirtSurcharge + sizeSurcharge + addonTotal;
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
      toast.success(`Voucher ${data.code} dipakai â€” hemat ${formatRupiah(data.discount)}!`);
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
        'Foto wajib di skala 4â€“5',
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
      scheduledAt: `${date} ${time}`,
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
    toast.success('Pesanan dibuat â€” silakan bayar untuk mulai cari cleaner');
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
              <Text className="font-medium text-[11px] text-ink-500">
                Langkah {step} dari {TOTAL_STEPS} Â· {STEP_LABELS[step - 1]}
              </Text>
            </View>
          </View>
          <StepProgress current={step} total={TOTAL_STEPS} labels={STEP_LABELS} />
        </SafeAreaView>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <>
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
                    <View className="flex-row items-center justify-between">
                      <Text className={`font-bold text-sm ${cleanMode === 'deep' ? 'text-brand-700' : 'text-ink-900'}`}>
                        Pakai Deep Cleaning
                      </Text>
                      <Text className="font-bold text-[11px] text-amber-700">+45%</Text>
                    </View>
                    <Text className="font-sans mt-1 text-[11px] leading-4 text-ink-600">
                      Pembersihan menyeluruh sampai ke detail: kerak kamar mandi, jamur nat, noda
                      membandel, bekas renovasi, sela-sela furnitur. Pakai cairan khusus &amp; waktu
                      pengerjaan lebih lama. Cocok kalau sudah lama nggak di-deep clean.
                    </Text>
                    {cleanMode === 'deep' && (
                      <View className="mt-2 rounded bg-amber-50 px-2 py-1">
                        <Text className="font-medium text-[10px] text-amber-800">
                          ⓘ Harga paket otomatis +45% (dibulatkan ke atas per Rp 1.000)
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              </Section>

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
                              <Text className="font-sans text-[10px] text-ink-500">Â±{p.durationMin} menit</Text>
                            </View>
                          </View>
                          {includes.length > 0 && (
                            <View className="mt-2">
                              <Text className="font-semibold mb-1 text-[10px] uppercase tracking-wider text-ink-500">Termasuk:</Text>
                              {includes.slice(0, active ? 99 : 3).map((it, i) => (
                                <View key={i} className="flex-row gap-1.5 py-0.5">
                                  <Text className="font-sans text-[11px] text-success">âœ“</Text>
                                  <Text className="font-sans flex-1 text-[11px] text-ink-700">{it}</Text>
                                </View>
                              ))}
                              {!active && includes.length > 3 && (
                                <Text className="font-medium mt-1 text-[10px] text-brand-600">+{includes.length - 3} item lain Â· tap untuk lihat semua</Text>
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

              <Section title="Luas Area">
                <Label>Total Luas: {areaM2} mÂ²</Label>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => setAreaM2(Math.max(10, areaM2 - 10))}
                    className="h-9 w-9 items-center justify-center rounded-full border border-ink-300"
                  >
                    <Text className="font-bold text-brand-600">âˆ’</Text>
                  </Pressable>
                  <View className="h-2 flex-1 rounded-full bg-ink-200">
                    <View
                      className="h-2 rounded-full bg-brand-600"
                      style={{ width: `${Math.min(100, ((areaM2 - 10) / 490) * 100)}%` }}
                    />
                  </View>
                  <Pressable
                    onPress={() => setAreaM2(Math.min(500, areaM2 + 10))}
                    className="h-9 w-9 items-center justify-center rounded-full border border-ink-300"
                  >
                    <Text className="font-bold text-brand-600">+</Text>
                  </Pressable>
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
              <Section title="Tanggal & Jam">
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
                            className={`font-medium text-[11px] ${active ? 'text-white' : 'text-ink-500'}`}
                          >
                            {d.label}
                          </Text>
                          <Text
                            className={`font-bold mt-0.5 text-lg ${active ? 'text-white' : 'text-ink-900'}`}
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
                          â† Pakai alamat tersimpan
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </Section>

              <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
                <Text className="font-bold text-sm text-ink-900">Rincian Harga</Text>
                <View className="mt-3 gap-2">
                  {pkg && <Row label={pkg.name} value={formatRupiah(rawPackagePrice)} />}
                  {deepSurcharge > 0 && (
                    <Row
                      label={`Deep Cleaning (+${Math.round((deepMultiplier - 1) * 100)}%)`}
                      value={`+${formatRupiah(deepSurcharge)}`}
                    />
                  )}
                  {sizeSurcharge > 0 && (
                    <Row
                      label={`Estimasi luas ${areaM2} m² (+${Math.round(sizePctExtra * 100)}%)`}
                      value={`+${formatRupiah(sizeSurcharge)}`}
                    />
                  )}
                  {dirtMultiplier > 1 && (
                    <Row
                      label={`Tingkat kotor ${dirtLevel} (+${Math.round((dirtMultiplier - 1) * 100)}%)`}
                      value={`+${formatRupiah(Math.round(basePrice * (dirtMultiplier - 1)))}`}
                    />
                  )}
                  {photoPenalty > 0 && (
                    <Row
                      label="Premium tanpa foto (+25%)"
                      value={`+${formatRupiah(Math.round(basePrice * 0.25))}`}
                    />
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
                        <Text className="font-semibold text-sm text-white">{voucherChecking ? 'Cekâ€¦' : 'Pakai'}</Text>
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
              <View className="border-b border-ink-100 px-4 pt-3">
                <View className="flex-row items-end justify-between">
                  <View className="flex-1">
                    <Text className="font-sans text-[10px] uppercase tracking-wider text-ink-500">
                      {step === TOTAL_STEPS ? 'Total' : 'Estimasi Total'}
                    </Text>
                    <Text className="font-extrabold text-lg text-brand-700">{formatRupiah(total)}</Text>
                    <Text className="font-sans text-[10px] text-ink-500" numberOfLines={1}>
                      {pkg.name}
                      {cleanMode === 'deep' ? ' · Deep' : ''}
                      {dirtMultiplier > 1 ? ` · Kotor L${dirtLevel}` : ''}
                      {sizeSurcharge > 0 ? ` · ${areaM2}m²` : ''}
                      {selectedAddons.size > 0 ? ` · +${selectedAddons.size} addon` : ''}
                    </Text>
                  </View>
                  {step !== TOTAL_STEPS && (
                    <Text className="font-medium text-[10px] text-ink-400">Bisa berubah saat tambah pilihan</Text>
                  )}
                </View>
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


export default withAuth(NewBooking, 'customer');

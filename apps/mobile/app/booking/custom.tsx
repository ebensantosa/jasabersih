import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Bath, Bed, Brush, Camera, Check, ChefHat, Droplets, Layers, Minus, Plus, Sofa, Square, Trees, Warehouse, Wind } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Image as RNImage, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withAuth } from '../../src/components/AuthGate';
import { AddressField } from '../../src/components/AddressField';
import { AddressPickerInline } from '../../src/components/AddressPicker';
import { ScheduleModal } from '../../src/components/ScheduleModal';
import { formatRupiah } from '../../src/data/catalog';
import { compressImage } from '../../src/lib/imageCompress';
import { formatEndTime, quoteNightOvertime } from '../../src/lib/overtimePricing';
import { uploadWithSignedUrl } from '../../src/lib/signedUpload';
import { useApiAddons, useApiServices, useAppContent } from '../../src/stores/appContent';
import { useAddressesStore } from '../../src/stores/addresses';
import { useBookingsStore } from '../../src/stores/bookings';
import { applyCleanMode } from '../../src/stores/cleaningMode';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';

type Item = { key: string; label: string; price: number; icon: any; durationMin: number; unit?: string };
type RoomSelection = { general: number; deep: number };

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

function makeDateOptions(): { date: Date; label: string; sub: string }[] {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const out: { date: Date; label: string; sub: string }[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const label = i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : (days[d.getDay()] ?? 'Min');
    const sub = `${d.getDate()} ${months[d.getMonth()]}`;
    out.push({ date: d, label, sub });
  }
  return out;
}

function QtyControl({
  value,
  onMinus,
  onPlus,
  tone = 'brand',
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  tone?: 'brand' | 'deep';
}) {
  const activeBg = tone === 'deep' ? 'bg-emerald-50' : 'bg-brand-50';
  const activeColor = tone === 'deep' ? '#059669' : '#1D4ED8';
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        onPress={onMinus}
        disabled={value === 0}
        className={`h-8 w-8 items-center justify-center rounded-lg ${value === 0 ? 'bg-ink-100' : activeBg}`}
      >
        <Minus color={value === 0 ? '#94A3B8' : activeColor} size={14} strokeWidth={2.4} />
      </Pressable>
      <Text className="w-6 text-center text-sm font-bold text-ink-900">{value}</Text>
      <Pressable onPress={onPlus} className={`h-8 w-8 items-center justify-center rounded-lg ${activeBg}`}>
        <Plus color={activeColor} size={14} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
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
  const appConfig = useAppContent((s) => s.content.config);
  const deepMultiplier = Number(appConfig['pricing.deep_clean_multiplier' as any] ?? 1.45) || 1.45;

  const excludedServiceCodes = new Set([
    'kamar_km_dalam',
    'ruko',
    'kantor',
    'apartemen',
    'full_house',
    'paket_bundle',
    'subscription',
    'general_cleaning',
    'deep_cleaning',
    'kos',
    'konsultasi',
    'pasca_renovasi',
  ]);

  const rooms: Item[] = useMemo(
    () =>
      services
        .filter((s: any) => !excludedServiceCodes.has(String(s.code ?? '')))
        .map((s: any) => {
          const pkg = allPackages.find((p: any) => p.serviceId === s.id);
          if (pkg?.scope && typeof pkg.scope === 'object' && (pkg.scope as any).perMeter) return null;
          return {
            key: s.code ?? s.id,
            label: s.name,
            price: Number(pkg?.price ?? 0),
            icon: iconFor(String(s.code ?? '')),
            durationMin: Number(pkg?.durationMin ?? 60),
          };
        })
        .filter((room): room is Item => room !== null && room.price > 0),
    [services, allPackages],
  );

  const isSpecialUnit = (desc: string | null | undefined) => {
    const d = (desc ?? '').toLowerCase();
    return d.includes('per m²') || d.includes('/m²') || d.includes('per panel') || d.includes('per lubang') || d.includes('per daun');
  };

  const extras: Item[] = useMemo(
    () =>
      apiAddons
        .filter((a: any) => !isSpecialUnit(a.description))
        .map((a: any) => ({
          key: a.code ?? a.id,
          label: a.name,
          price: Number(a.price ?? 0),
          icon: iconFor(String(a.code ?? '')),
          durationMin: Number(a.durationMin ?? 15),
          unit: a.description ?? undefined,
        })),
    [apiAddons],
  );

  const [roomCounts, setRoomCounts] = useState<Record<string, RoomSelection>>({});
  const [extraCounts, setExtraCounts] = useState<Record<string, number>>({});
  const [address, setAddress] = useState(defaultAddress?.addressLine ?? savedLocation?.address ?? '');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [useNewLocation, setUseNewLocation] = useState(addressList.length === 0);
  const selectedAddress = addressList.find((a) => a.id === selectedAddressId) ?? null;
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    defaultAddress
      ? { lat: defaultAddress.lat, lng: defaultAddress.lng }
      : savedLocation
        ? { lat: savedLocation.lat, lng: savedLocation.lng }
        : null,
  );

  const dateOptions = useMemo(() => makeDateOptions(), []);
  const [dateIdx, setDateIdx] = useState(1);
  const [timeSlot, setTimeSlot] = useState('09:00');
  const [useNowTime, setUseNowTime] = useState(false);
  const [notes, setNotes] = useState('');
  const [emptyHouse, setEmptyHouse] = useState(false);
  const [schedModalOpen, setSchedModalOpen] = useState(false);
  const [photos, setPhotos] = useState<{ uri: string; url: string }[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const emptyHouseDiscountRate = 0.2;

  const scheduleAt = useMemo(() => {
    if (useNowTime && dateIdx === 0) {
      const nowPlus1h = new Date(Date.now() + 60 * 60 * 1000);
      if (nowPlus1h.getHours() < 7) nowPlus1h.setHours(7, 0, 0, 0);
      else if (nowPlus1h.getHours() >= 20) {
        nowPlus1h.setDate(nowPlus1h.getDate() + 1);
        nowPlus1h.setHours(7, 0, 0, 0);
      }
      return nowPlus1h;
    }
    const d = new Date(dateOptions[dateIdx]!.date);
    const [hh, mm] = timeSlot.split(':').map(Number);
    d.setHours(hh!, mm!, 0, 0);
    return d;
  }, [dateOptions, dateIdx, timeSlot, useNowTime]);

  const { subtotal, totalBeforeOvertime, discount, totalMin, itemCount, mainItemCount, summaryRows } = useMemo(() => {
    let runningMainSubtotal = 0;
    let runningAddonSubtotal = 0;
    let runningMinutes = 0;
    let runningCount = 0;
    let runningMainCount = 0;
    const rows: Array<{ key: string; label: string; qty: number; totalPrice: number }> = [];

    for (const room of rooms) {
      const selection = roomCounts[room.key] ?? { general: 0, deep: 0 };
      if (selection.general > 0) {
        const totalPrice = selection.general * room.price;
        rows.push({
          key: `${room.key}:general`,
          label: `${room.label} (General)`,
          qty: selection.general,
          totalPrice,
        });
        runningMainSubtotal += totalPrice;
        runningMinutes += selection.general * room.durationMin;
        runningCount += selection.general;
        runningMainCount += selection.general;
      }
      if (selection.deep > 0) {
        const deepPrice = applyCleanMode(room.price, 'deep', deepMultiplier);
        const totalPrice = selection.deep * deepPrice;
        rows.push({
          key: `${room.key}:deep`,
          label: `${room.label} (Deep Clean)`,
          qty: selection.deep,
          totalPrice,
        });
        runningMainSubtotal += totalPrice;
        runningMinutes += selection.deep * Math.ceil(room.durationMin * deepMultiplier);
        runningCount += selection.deep;
        runningMainCount += selection.deep;
      }
    }

    for (const extra of extras) {
      const qty = extraCounts[extra.key] ?? 0;
      if (qty > 0) {
        const totalPrice = qty * extra.price;
        rows.push({
          key: extra.key,
          label: extra.label,
          qty,
          totalPrice,
        });
        runningAddonSubtotal += totalPrice;
        runningMinutes += qty * extra.durationMin;
        runningCount += qty;
      }
    }

    const subtotalValue = runningMainSubtotal + runningAddonSubtotal;
    const discountValue = emptyHouse ? Math.round((runningMainSubtotal * emptyHouseDiscountRate) / 1000) * 1000 : 0;
    return {
      subtotal: subtotalValue,
      totalBeforeOvertime: subtotalValue - discountValue,
      discount: discountValue,
      totalMin: runningMinutes,
      itemCount: runningCount,
      mainItemCount: runningMainCount,
      summaryRows: rows,
    };
  }, [rooms, extras, roomCounts, extraCounts, emptyHouse, deepMultiplier]);
  const overtimeQuote = useMemo(() => quoteNightOvertime(scheduleAt, totalMin), [scheduleAt, totalMin]);
  const total = totalBeforeOvertime + overtimeQuote.surcharge;

  function bumpExtra(key: string, delta: number) {
    setExtraCounts((prev) => ({ ...prev, [key]: Math.max(0, Math.min(50, (prev[key] ?? 0) + delta)) }));
  }

  function bumpRoom(key: string, mode: keyof RoomSelection, delta: number) {
    setRoomCounts((prev) => {
      const current = prev[key] ?? { general: 0, deep: 0 };
      const nextValue = Math.max(0, Math.min(50, current[mode] + delta));
      return {
        ...prev,
        [key]: {
          general: mode === 'general' ? nextValue : 0,
          deep: mode === 'deep' ? nextValue : 0,
        },
      };
    });
  }

  function setRoomMode(key: string, mode: keyof RoomSelection) {
    setRoomCounts((prev) => {
      const current = prev[key] ?? { general: 0, deep: 0 };
      const carryCount = Math.max(current.general, current.deep, 1);
      return {
        ...prev,
        [key]: {
          general: mode === 'general' ? carryCount : 0,
          deep: mode === 'deep' ? carryCount : 0,
        },
      };
    });
  }

  function showPhotoPicker() {
    if (Platform.OS === 'web') {
      void pickPhoto('library');
      return;
    }
    Alert.alert('Tambah Foto', 'Ambil dari:', [
      { text: 'Kamera', onPress: () => pickPhoto('camera') },
      { text: 'Galeri', onPress: () => pickPhoto('library') },
      { text: 'Batal', style: 'cancel' },
    ]);
  }

  async function pickPhoto(source: 'camera' | 'library') {
    if (photos.length >= 3) {
      toast.warning('Maksimal 3 foto');
      return;
    }

    try {
      const ImagePicker = await import('expo-image-picker');
      const {
        launchCameraAsync,
        launchImageLibraryAsync,
        MediaTypeOptions,
        requestCameraPermissionsAsync,
        requestMediaLibraryPermissionsAsync,
      } = ImagePicker;

      if (source === 'camera') {
        const perm = await requestCameraPermissionsAsync();
        if (!perm.granted) {
          toast.warning('Izin kamera ditolak');
          return;
        }
      } else {
        const perm = await requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          toast.warning('Izin galeri ditolak');
          return;
        }
      }

      const result =
        source === 'camera'
          ? await launchCameraAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.9 })
          : await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.9 });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (photos.length >= 10) {
        toast.warning('Maksimal 10 foto kondisi.');
        return;
      }
      setPhotoUploading(true);

      const compressed = await compressImage(asset.uri);
      const { api } = await import('../../src/lib/api');
      const { publicUrl } = await uploadWithSignedUrl(
        async () => {
          const presign = await api.post('/bookings/condition-photo-upload-url', { contentType: 'image/jpeg' });
          return (presign.data?.data ?? presign.data) as { uploadUrl: string; publicUrl: string };
        },
        compressed.uri,
        'image/jpeg',
      );

      setPhotos((prev) => [...prev, { uri: compressed.uri, url: publicUrl }]);
    } catch (error: any) {
      toast.error(error?.message ?? 'Gagal upload foto');
    } finally {
      setPhotoUploading(false);
    }
  }

  async function submit() {
    if (mainItemCount === 0) {
      toast.error('Pilih minimal 1 layanan utama. Add-on tidak bisa dipesan sendiri.');
      return;
    }
    if (!address.trim()) {
      toast.error('Alamat wajib diisi');
      return;
    }

    const { checkCoverage } = await import('../../src/lib/coverage');
    const { useLocationStore: locationStore } = await import('../../src/stores/location');
    const { useAppContent: appContentStore } = await import('../../src/stores/appContent');

    const pickedAddress = addressList.find((a) => a.id === selectedAddressId);
    const userLoc = locationStore.getState().current;
    const areas = appContentStore.getState().content.serviceAreas;
    const checkLoc =
      coords
        ? { lat: coords.lat, lng: coords.lng }
        : pickedAddress && Number.isFinite(pickedAddress.lat) && Number.isFinite(pickedAddress.lng)
          ? { lat: pickedAddress.lat, lng: pickedAddress.lng }
          : userLoc
            ? { lat: userLoc.lat, lng: userLoc.lng }
            : null;

    const coverage = checkCoverage(checkLoc, areas);
    if (!coverage.covered) {
      router.push({
        pathname: '/city-request',
        params: { city: userLoc?.shortLabel ?? coverage.nearestAreaName ?? '' },
      });
      return;
    }

    setSubmitting(true);
    const items = [
      ...rooms.flatMap((room) => {
        const selection = roomCounts[room.key] ?? { general: 0, deep: 0 };
        const rows: Array<{
          key: string;
          label: string;
          qty: number;
          pricePerUnit: number;
          subtotal: number;
          cleaningMode: 'general' | 'deep' | null;
        }> = [];

        if (selection.general > 0) {
          rows.push({
            key: `${room.key}:general`,
            label: `${room.label} - General`,
            qty: selection.general,
            pricePerUnit: room.price,
            subtotal: selection.general * room.price,
            cleaningMode: 'general',
          });
        }

        if (selection.deep > 0) {
          const deepPrice = applyCleanMode(room.price, 'deep', deepMultiplier);
          rows.push({
            key: `${room.key}:deep`,
            label: `${room.label} - Deep Clean`,
            qty: selection.deep,
            pricePerUnit: deepPrice,
            subtotal: selection.deep * deepPrice,
            cleaningMode: 'deep',
          });
        }

        return rows;
      }),
      ...extras
        .filter((extra) => (extraCounts[extra.key] ?? 0) > 0)
        .map((extra) => ({
          key: extra.key,
          label: extra.label,
          qty: extraCounts[extra.key]!,
          pricePerUnit: extra.price,
          subtotal: extraCounts[extra.key]! * extra.price,
          cleaningMode: null,
        })),
    ];

    const labelSummary = items.map((item) => `${item.qty}x ${item.label}`).join(', ');

    try {
      const ctaImage = (useAppContent.getState().content.config as Record<string, unknown>)['home.cta_image_url'] as
        | string
        | undefined;
      const customIcon = typeof ctaImage === 'string' && ctaImage.trim() ? { uri: ctaImage.trim() } : undefined;

      const booking = await create({
        pricingMode: 'package',
        categoryCode: 'custom',
        categoryName: 'Layanan Custom',
        categoryImage: customIcon as any,
        packageId: undefined,
        packageName: `Custom: ${labelSummary}`,
        addressLine: address,
        scheduledAt: scheduleAt.toISOString(),
        addOns: [],
        basePrice: subtotal,
        dirtSurcharge: 0,
        totalPrice: total,
        customerNotes: notes.trim() || undefined,
        formSnapshot: {
          mode: 'custom',
          items,
          totalMin,
          overtimeSurcharge: overtimeQuote.surcharge,
          overtimeHours: overtimeQuote.overtimeHours,
          estimatedEndAt: overtimeQuote.estimatedEnd.toISOString(),
          notes,
          customerNotes: notes.trim() || undefined,
          emptyHouse,
          emptyHouseDiscount: discount,
          conditionPhotos: photos.map((photo) => photo.url).filter(Boolean),
        },
        initialStatus: 'pending_payment',
      } as any);

      toast.success('Pesanan custom dibuat, silakan bayar');
      try {
        const { Track } = await import('../../src/lib/analytics');
        Track.bookingCreated(booking.id, total, 'custom');
      } catch {}
      router.replace({ pathname: '/booking/[id]', params: { id: booking.id } });
    } catch {
      // handled in store
    } finally {
      setSubmitting(false);
    }
  }

  function renderRoomItem(room: Item, idx: number, last: boolean) {
    const Icon = room.icon;
    const selection = roomCounts[room.key] ?? { general: 0, deep: 0 };
    const deepPrice = applyCleanMode(room.price, 'deep', deepMultiplier);
    const deepDuration = Math.ceil(room.durationMin * deepMultiplier);
    const totalSelected = selection.general + selection.deep;
    const isDeep = selection.deep > 0;
    const count = isDeep ? selection.deep : selection.general;
    const activeMode: keyof RoomSelection = isDeep ? 'deep' : 'general';
    const activePrice = isDeep ? deepPrice : room.price;
    const activeDuration = isDeep ? deepDuration : room.durationMin;

    return (
      <View key={room.key} className={`py-3 ${!last ? 'border-b border-ink-100' : ''}`}>
        <View className="mb-3 flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
            <Icon color="#1D4ED8" size={20} strokeWidth={2} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-ink-900">{room.label}</Text>
            <Text className="text-[11px] text-ink-500">Pilih jenis pembersihan untuk ruangan ini</Text>
          </View>
          {totalSelected > 0 && (
            <View className="rounded-full bg-ink-100 px-2.5 py-1">
              <Text className="text-[10px] font-bold text-ink-700">{totalSelected} dipilih</Text>
            </View>
          )}
        </View>

        <View
          className={`rounded-2xl border p-3 ${
            isDeep ? 'border-emerald-300 bg-emerald-50' : totalSelected > 0 ? 'border-brand-300 bg-brand-50' : 'border-ink-200 bg-white'
          }`}
        >
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold text-ink-900">{formatRupiah(activePrice)}</Text>
                <View className={`rounded-full px-2 py-1 ${isDeep ? 'bg-emerald-100' : 'bg-ink-100'}`}>
                  <Text className={`text-[10px] font-bold ${isDeep ? 'text-emerald-800' : 'text-ink-700'}`}>
                    {isDeep ? 'Deep Clean' : 'General'}
                  </Text>
                </View>
              </View>
              <Text className="mt-0.5 text-[11px] text-ink-500">Estimasi {activeDuration} menit</Text>
              <Text className={`mt-1 text-[10px] ${isDeep ? 'text-emerald-700' : 'text-ink-500'}`}>
                {isDeep
                  ? 'Deep Clean untuk area lebih kotor atau butuh hasil lebih detail.'
                  : 'General untuk pembersihan rutin dan kondisi normal.'}
              </Text>
            </View>
            <QtyControl
              value={count}
              onMinus={() => bumpRoom(room.key, activeMode, -1)}
              onPlus={() => bumpRoom(room.key, activeMode, 1)}
              tone={isDeep ? 'deep' : 'brand'}
            />
          </View>

          <Pressable
            onPress={() => setRoomMode(room.key, isDeep ? 'general' : 'deep')}
            className="mt-3 flex-row items-center gap-2 border-t border-ink-100 pt-3"
          >
            <View className={`h-5 w-5 items-center justify-center rounded border ${isDeep ? 'border-emerald-500 bg-emerald-500' : 'border-ink-300 bg-white'}`}>
              {isDeep && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
            </View>
            <Text className={`flex-1 text-[11px] font-semibold ${isDeep ? 'text-emerald-700' : 'text-ink-600'}`}>
              {isDeep ? 'Deep Clean aktif untuk ruangan ini' : 'Centang jika ruangan ini perlu Deep Clean'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderExtraItem(extra: Item, idx: number, last: boolean) {
    const Icon = extra.icon;
    const qty = extraCounts[extra.key] ?? 0;
    return (
      <View key={extra.key} className={`flex-row items-center gap-3 py-3 ${!last ? 'border-b border-ink-100' : ''}`}>
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
          <Icon color="#1D4ED8" size={20} strokeWidth={2} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink-900">{extra.label}</Text>
          <Text className="text-[11px] text-ink-500">
            {formatRupiah(extra.price)}
            {extra.unit ? ` / ${extra.unit}` : ''}
            {` · ~${extra.durationMin}m`}
          </Text>
        </View>
        <QtyControl value={qty} onMinus={() => bumpExtra(extra.key, -1)} onPlus={() => bumpExtra(extra.key, 1)} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
          <Pressable onPress={() => router.replace('/(tabs)' as never)} className="-ml-2 h-10 w-10 items-center justify-center">
            <ArrowLeft size={22} color="#0F172A" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-base font-bold text-ink-900">Layanan Custom</Text>
            <Text className="text-[11px] text-ink-500">Atur sendiri layanan per ruangan</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
          <View className="mx-4 mt-4 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-bold text-ink-900">Ruangan</Text>
              <Text className="text-[10px] text-ink-500">{rooms.length} pilihan</Text>
            </View>
            <View className="mb-2 rounded-2xl border border-ink-100 bg-ink-50 px-3 py-2.5">
              <Text className="text-[11px] leading-4 text-ink-600">
                General cocok untuk pembersihan rutin harian. Deep Clean cocok untuk area yang lebih kotor, lama tidak dibersihkan, atau butuh pengerjaan lebih detail.
              </Text>
            </View>
            {rooms.map((room, idx) => renderRoomItem(room, idx, idx === rooms.length - 1))}
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-bold text-ink-900">Tambahan</Text>
              <Text className="text-[10px] text-ink-500">{extras.length} pilihan</Text>
            </View>
            {extras.map((extra, idx) => renderExtraItem(extra, idx, idx === extras.length - 1))}
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="mb-2 text-sm font-bold text-ink-900">Alamat</Text>
            {addressList.length > 0 && !useNewLocation && (
              <>
                <AddressPickerInline
                  selectedId={selectedAddressId}
                  onSelect={(picked) => {
                    setSelectedAddressId(picked.id);
                    setAddress(picked.addressLine);
                    setCoords({ lat: picked.lat, lng: picked.lng });
                  }}
                />
                <Pressable onPress={() => { setUseNewLocation(true); setCoords(null); }} className="mt-3 self-start">
                  <Text className="text-xs font-semibold text-brand-600">+ Pakai alamat lain</Text>
                </Pressable>
              </>
            )}

            {(addressList.length === 0 || useNewLocation) && (
              <>
                <AddressField value={address} onChange={setAddress} coords={coords} onCoordsChange={setCoords} />
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
                    <Text className="text-xs font-semibold text-brand-600">Kembali ke alamat tersimpan</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              Foto Kondisi (Opsional, max 3)
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {photos.map((photo, idx) => (
                <View key={idx} className="relative h-20 w-20">
                  <RNImage source={{ uri: photo.uri }} style={{ width: 80, height: 80, borderRadius: 12 }} />
                  <Pressable
                    onPress={() => setPhotos((prev) => prev.filter((_, photoIdx) => photoIdx !== idx))}
                    className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-red-600"
                  >
                    <Text className="text-[10px] font-bold text-white">x</Text>
                  </Pressable>
                </View>
              ))}
              {photos.length < 3 && (
                <Pressable
                  onPress={showPhotoPicker}
                  disabled={photoUploading}
                  className="h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-brand-300 bg-brand-50"
                >
                  <Camera color="#1D4ED8" size={20} strokeWidth={2.2} />
                  <Text className="mt-1 text-[10px] font-medium text-brand-700">{photoUploading ? '...' : '+ Tambah'}</Text>
                </Pressable>
              )}
            </View>
            <Text className="mt-2 text-[10px] text-ink-500">JPG / PNG / WEBP, otomatis dikompres di bawah 5MB</Text>
          </View>

          <Pressable
            onPress={() => setSchedModalOpen(true)}
            className="mx-4 mt-3 flex-row items-center justify-between rounded-2xl bg-white p-4"
          >
            <View>
              <Text className="text-[10px] font-medium uppercase tracking-wider text-ink-500">Pilih Tanggal dan Jam</Text>
              <Text className="mt-0.5 text-sm font-bold text-ink-900">
                {useNowTime && dateIdx === 0
                  ? `Sekarang (${String(scheduleAt.getHours()).padStart(2, '0')}:${String(scheduleAt.getMinutes()).padStart(2, '0')})`
                  : `${dateOptions[dateIdx]?.label ?? ''} · ${timeSlot}`}
              </Text>
            </View>
            <Text className="font-bold text-brand-600">›</Text>
          </Pressable>

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
              {emptyHouse && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className={`text-sm font-extrabold ${emptyHouse ? 'text-emerald-800' : 'text-ink-900'}`}>Rumah Kosong</Text>
                <View className="rounded bg-emerald-200 px-1.5 py-0.5">
                  <Text className="text-[9px] font-extrabold text-emerald-900">DISKON 20%</Text>
                </View>
              </View>
              <Text className="mt-0.5 text-[11px] font-medium text-ink-600">
                Pilih ini jika barang sudah dipindahkan sehingga pengerjaan lebih cepat.
              </Text>
            </View>
          </Pressable>

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="mb-2 text-sm font-bold text-ink-900">Catatan (opsional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Contoh: ada hewan peliharaan, akses pintu samping, atau area prioritas"
              multiline
              numberOfLines={3}
              maxLength={500}
              className="rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-900"
              style={{ textAlignVertical: 'top', minHeight: 70 }}
            />
          </View>

          {itemCount > 0 && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="mb-2 text-sm font-bold text-ink-900">Rincian</Text>
              {summaryRows.map((row) => (
                <View key={row.key} className="flex-row justify-between py-1">
                  <Text className="text-xs text-ink-700">{row.qty}x {row.label}</Text>
                  <Text className="text-xs text-ink-900">{formatRupiah(row.totalPrice)}</Text>
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
                  <Text className="text-xs text-emerald-700">Diskon Rumah Kosong</Text>
                  <Text className="text-xs font-bold text-emerald-700">-{formatRupiah(discount)}</Text>
                </View>
              )}
              {overtimeQuote.surcharge > 0 && (
                <View className="border-t border-ink-100 pt-2">
                  <View className="flex-row justify-between py-1">
                    <Text className="text-xs text-amber-700">Biaya Lembur Malam</Text>
                    <Text className="text-xs font-bold text-amber-700">{formatRupiah(overtimeQuote.surcharge)}</Text>
                  </View>
                  <Text className="text-[10px] text-amber-700">
                    Estimasi selesai {formatEndTime(overtimeQuote.estimatedEnd)}. Waktu lewat 21:00 dikenakan Rp 50.000 per jam.
                  </Text>
                </View>
              )}
              <View className={`flex-row justify-between border-t border-ink-100 pt-2 ${discount > 0 ? '' : 'mt-2'}`}>
                <Text className="text-sm font-bold text-ink-900">Total · ~{Math.round((totalMin / 60) * 10) / 10}j</Text>
                <Text className="text-sm font-bold text-brand-700">{formatRupiah(total)}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white" style={{ elevation: 8 }}>
          <SafeAreaView edges={['bottom']}>
            <View className="flex-row items-center justify-between border-b border-ink-100 px-4 py-3">
              <View>
                <Text className="text-[10px] uppercase tracking-wider text-ink-500">Total Bayar</Text>
                <Text className="text-lg font-extrabold text-brand-700">{formatRupiah(total)}</Text>
              </View>
              {itemCount > 0 && <Text className="text-[10px] text-ink-500">{itemCount} item dipilih</Text>}
              {mainItemCount === 0 && itemCount > 0 && (
                <Text className="text-[10px] text-amber-700">Add-on tidak bisa dipesan tanpa layanan utama.</Text>
              )}
            </View>
            <View className="p-4">
              <Pressable
                onPress={submit}
                disabled={submitting || mainItemCount === 0}
                className={`h-12 items-center justify-center rounded-2xl ${mainItemCount === 0 ? 'bg-ink-300' : 'bg-brand-600'}`}
              >
                <Text className="text-sm font-bold text-white">
                  {submitting ? 'Memproses...' : mainItemCount === 0 ? 'Pilih layanan utama dulu' : 'Buat Pesanan'}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaView>

      <ScheduleModal
        visible={schedModalOpen}
        value={scheduleAt}
        onChange={(date) => {
          setUseNowTime(false);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const selected = new Date(date);
          selected.setHours(0, 0, 0, 0);
          setDateIdx(Math.max(0, Math.min(13, Math.round((selected.getTime() - today.getTime()) / 86400000))));
          setTimeSlot(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
          setSchedModalOpen(false);
        }}
        onClose={() => setSchedModalOpen(false)}
      />
    </>
  );
}

export default withAuth(CustomBooking);

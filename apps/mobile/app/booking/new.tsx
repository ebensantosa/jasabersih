import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlertTriangle, ArrowLeft, Calendar, Camera, Check, ChevronLeft, Clock, MessageCircle, Minus, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image as RNImage, Linking, Modal as RNModal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { AddressPickerInline } from '../../src/components/AddressPicker';
import { Dropdown } from '../../src/components/Dropdown';
import { ScheduleModal } from '../../src/components/ScheduleModal';
import { Stepper } from '../../src/components/Stepper';
import { StepProgress } from '../../src/components/StepWizard';
import { compressImage, formatBytes } from '../../src/lib/imageCompress';
import { uploadWithSignedUrl } from '../../src/lib/signedUpload';
import {
  useDirtLevels,
  useLargeScaleBathroomRate,
  useLargeScaleMaxM2,
  useLargeScaleTargets,
  usePostRenoBathroomRate,
  usePostRenoKitchenFlat,
  usePostRenoLevels,
  usePostRenoMaxM2,
  usePostRenoTargets,
} from '../../src/lib/pricingConfig';
import {
  useBathroomSizes,
  useDirtCharacters,
  useFloorOptions,
  useFloorTypes,
  useFurnitureDensity,
  useLargeScalePropertyTypes,
  usePostRenoPropertyTypes,
  usePropertyTypes,
  useRoomFacilities,
  useSubscriptionDays,
} from '../../src/lib/formOptions';
import {
  ADDONS as LOCAL_ADDONS,
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_VISITS_BY_PKG,
  PACKAGES as LOCAL_PACKAGES,
  SERVICE_CATEGORIES,
  formatRupiah,
  type FurnitureDensity,
  type PropertyType,
} from '../../src/data/catalog';
import { useAddressesStore } from '../../src/stores/addresses';
import { useApiAddons, useApiPackagesForService, useApiSubscriptionTiers, useAppContent, useConfig } from '../../src/stores/appContent';
import { checkCoverage } from '../../src/lib/coverage';
import { useServices } from '../../src/hooks/useServices';
import { formatEndTime, quoteNightOvertime } from '../../src/lib/overtimePricing';
import { useBookingsStore } from '../../src/stores/bookings';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { applyCleanMode, useCleaningModeStore } from '../../src/stores/cleaningMode';
import { safeBack } from '../../src/lib/safeBack';

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
  const { category: categoryCode, package: packageId, reorder: reorderBookingId } = useLocalSearchParams<{
    category: string;
    package?: string;
    reorder?: string;
  }>();
  const create = useBookingsStore((s) => s.create);
  const allBookings = useBookingsStore((s) => s.list);
  const SERVICE_CATEGORIES_LIVE = useServices();

  const category = SERVICE_CATEGORIES_LIVE.find((c) => c.code === categoryCode) ?? SERVICE_CATEGORIES[0];

  // Full House / Paket Bundle pakai flow cart (customer pilih per-ruangan + add-ons).
  // Konsultasi langsung ke WA admin (gak ada flow booking standar).
  // Skala Besar tetap masuk booking flow biar customer bisa pilih "Per Ruangan".
  const shouldRedirect = categoryCode === 'full_house' || categoryCode === 'paket_bundle' || categoryCode === 'konsultasi';
  useEffect(() => {
    if (categoryCode === 'full_house' || categoryCode === 'paket_bundle') {
      router.replace('/booking/custom');
    } else if (categoryCode === 'konsultasi') {
      router.replace('/services/konsultasi');
    } else if (categoryCode) {
      // begin_checkout: user buka halaman booking = sinyal intent kuat untuk Google Ads
      void import('../../src/lib/analytics').then(({ Track }) => {
        Track.bookingStarted(categoryCode);
      });
    }
  }, [categoryCode, router]);

  // Pricing configs admin-controlled (fallback ke hardcoded catalog.ts).
  const POST_RENO_LEVELS = usePostRenoLevels();
  const POST_RENO_TARGETS = usePostRenoTargets();
  const POST_RENO_BATHROOM_RATE = usePostRenoBathroomRate();
  const POST_RENO_KITCHEN_FLAT = usePostRenoKitchenFlat();
  const POST_RENO_MAX_M2 = usePostRenoMaxM2();
  const LARGE_SCALE_TARGETS = useLargeScaleTargets();
  const LARGE_SCALE_BATHROOM_RATE = useLargeScaleBathroomRate();
  const LARGE_SCALE_MAX_M2 = useLargeScaleMaxM2();
  const DIRT_LEVELS = useDirtLevels();

  // Form options admin-controlled (fallback ke hardcoded catalog.ts).
  const PROPERTY_TYPES = usePropertyTypes();
  const LARGE_SCALE_PROPERTY_TYPES = useLargeScalePropertyTypes();
  const POST_RENO_PROPERTY_TYPES = usePostRenoPropertyTypes();
  const FLOOR_OPTIONS = useFloorOptions();
  const FLOOR_TYPES = useFloorTypes();
  const ROOM_FACILITIES = useRoomFacilities();
  const DIRT_CHARACTERS = useDirtCharacters();
  const FURNITURE_DENSITY = useFurnitureDensity();
  const SUBSCRIPTION_DAYS = useSubscriptionDays();
  const apiBathroomSizes = useBathroomSizes();

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
    // FALLBACK ke catalog lokal - kalau ini dipakai berarti API belum sync atau offline.
    if (__DEV__) console.warn('[booking/new] API packages empty - fallback to LOCAL_PACKAGES (offline?)');
    return LOCAL_PACKAGES.map((p) => ({ ...p, includes: [] as string[], note: undefined as string | undefined }));
  }, [apiPackages, category?.code]);

  // Merge API addons with local icons (icons stay hardcoded by code).
  const apiAddons = useApiAddons();
  const ADDONS = useMemo(() => {
    if (apiAddons.length === 0) {
      if (__DEV__) console.warn('[booking/new] API addons empty - fallback to LOCAL_ADDONS');
      return LOCAL_ADDONS;
    }
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
  // Initial pkg HARUS dari kategori yang sama. Jangan fallback ke PACKAGES[0] krn bikin pkg dari kategori lain "bocor"
  // (mis. subscription kosong → kebawa vacuum_lantai).
  const initialPackage =
    PACKAGES.find((p) => p.id === packageId && p.categoryCode === category?.code) ?? categoryPackages[0];

  const [walletBalance, setWalletBalance] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const [travelQuote, setTravelQuote] = useState<{ enabled: boolean; distanceKm: number; travelFee: number; freeKm: number; perKmIdr: number; nearestAreaName: string | null } | null>(null);
  const [travelErr, setTravelErr] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const { api } = await import('../../src/lib/api');
        const r = await api.get('/customer/wallet');
        setWalletBalance(Number((r.data?.data ?? r.data)?.balance ?? 0));
      } catch { /* ignore */ }
    })();
  }, []);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const [pickedPackageId, setPickedPackageId] = useState<string>(initialPackage?.id ?? '');
  const pkg = PACKAGES.find((p) => p.id === pickedPackageId);

  // Layanan satuan (per-ruangan) - sembunyikan Properti, Ruangan, Fasilitas Lain.
  // Tampil bullet list pekerjaan saja. Untuk full_house/paket_bundle/custom flow tetap full.
  const SIMPLE_SERVICE_CODES = ['kamar', 'kamar_km_dalam', 'kamar_mandi', 'dapur', 'ruang_tamu', 'pindah_kos', 'ruangan_kosong', 'garasi', 'pekarangan', 'vacuum_lantai'];
  const PER_METER_CODES = ['ruko', 'kantor', 'apartemen'];
  const isSimpleService = SIMPLE_SERVICE_CODES.includes(category?.code ?? '');
  const isPerMeter = PER_METER_CODES.includes(category?.code ?? '');
  const isVacuum = category?.code === 'vacuum_lantai';
  const isSubscription = category?.code === 'subscription';
  const [subscriptionDates, setSubscriptionDates] = useState<string[]>([]); // ISO YYYY-MM-DD list
  // Month offset untuk calendar nav (0 = bulan ini, 1 = bulan depan, dst). Max 5 (6 bulan ke depan).
  const [subscriptionMonthOffset, setSubscriptionMonthOffset] = useState<number>(0);
  // Tier subscription: basic/standard/premium/ultimate. Bedanya scope layanan
  // tiap kunjungan + multiplier harga.
  const [subscriptionTier, setSubscriptionTier] = useState<'basic' | 'standard' | 'premium' | 'ultimate'>('standard');
  // Pakai admin-controlled tiers dari API kalau ada. Fallback ke hardcoded
  // catalog.ts kalau API belum return data (offline / belum migrate).
  const apiSubscriptionTiers = useApiSubscriptionTiers();
  const effectiveSubscriptionTiers = apiSubscriptionTiers.length > 0 ? apiSubscriptionTiers : SUBSCRIPTION_TIERS;
  const subscriptionTierMultiplier = useMemo(() => {
    if (!isSubscription) return 1;
    return effectiveSubscriptionTiers.find((t) => t.code === subscriptionTier)?.multiplier ?? 1;
  }, [isSubscription, subscriptionTier, effectiveSubscriptionTiers]);
  const subscriptionVisits = useMemo(() => {
    if (!isSubscription || !pkg) return 0;
    const match = SUBSCRIPTION_VISITS_BY_PKG.find((r) => r.match.test(pkg.name));
    return match?.visits ?? 0;
  }, [isSubscription, pkg]);

  // Per-meter rates (config-driven)
  const rateRuko      = Number(useConfig('pricing.per_meter_ruko' as any, 6000 as any)) || 6000;
  const rateKantor    = Number(useConfig('pricing.per_meter_kantor' as any, 5500 as any)) || 5500;
  const rateApartemen = Number(useConfig('pricing.per_meter_apartemen' as any, 8000 as any)) || 8000;
  const perMeterMin   = Number(useConfig('pricing.per_meter_minimum' as any, 150000 as any)) || 150000;
  const perMeterRate =
    category?.code === 'ruko' ? rateRuko :
    category?.code === 'kantor' ? rateKantor :
    category?.code === 'apartemen' ? rateApartemen : 0;

  // Apartment type: studio | 1BR | 2BR | 3BR - preset m² (user bisa override)
  const APT_TYPES = [
    { code: 'studio', label: 'Studio',   m2: 25 },
    { code: '1br',    label: '1 Kamar',  m2: 36 },
    { code: '2br',    label: '2 Kamar',  m2: 54 },
    { code: '3br',    label: '3 Kamar',  m2: 80 },
  ];
  const [aptType, setAptType] = useState<string>('studio');

  // Kamar mandi: variasi ukuran (multiplier ke harga paket) - admin-controlled
  const BATHROOM_SIZES = apiBathroomSizes;
  const [bathroomSize, setBathroomSize] = useState<string>('kecil');
  const isBathroom = category?.code === 'kamar_mandi';
  const bathroomMult = isBathroom ? (BATHROOM_SIZES.find((s) => s.code === bathroomSize)?.mult ?? 1) : 1;

  // Auto-centang Deep Cleaning sekali aja saat first mount untuk simple service.
  // Kalau user uncheck, jangan auto-aktif lagi (useRef guard).
  // Subscription default GENERAL - kalau customer mau deep cleaning, centang manual
  // di section "Upgrade Deep Cleaning". Hindari surprise harga +40% otomatis.
  const deepDefaultedRef = useRef(false);
  useEffect(() => {
    if (isSimpleService && !isVacuum && !deepDefaultedRef.current) {
      setCleaningMode('deep');
      deepDefaultedRef.current = true;
    }
    if (isVacuum || isSubscription) setCleaningMode('general');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category?.code]);

  const cleanMode = useCleaningModeStore((s) => s.mode);
  const setCleaningMode = useCleaningModeStore((s) => s.setMode);
  const deepMultiplierRaw = useConfig('pricing.deep_clean_multiplier' as any, 1.45 as any);
  const deepMultiplier = Number(deepMultiplierRaw) || 1.45;

  const isLargeScale = category?.code === 'skala_besar';
  const isPostReno = category?.code === 'pasca_renovasi';
  const [propertyType, setPropertyType] = useState<PropertyType>(
    isLargeScale ? ('Mall' as any) : isPostReno ? ('Rumah' as any) : 'Rumah',
  );
  const [largeScaleTargets, setLargeScaleTargets] = useState<Set<string>>(new Set(['lantai']));
  const [postRenoTargets, setPostRenoTargets] = useState<Set<string>>(new Set(['debu_semen', 'kaca']));
  const [postRenoLevel, setPostRenoLevel] = useState<string>('renovasi_sedang');
  const [postRenoHasKitchen, setPostRenoHasKitchen] = useState(false);
  const [floor, setFloor] = useState<string>('1');
  const [hasLift, setHasLift] = useState(false);
  const [bedrooms, setBedrooms] = useState(1);
  const [workers, setWorkers] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [facilities, setFacilities] = useState<Set<string>>(new Set(['Dapur', 'Ruang Tamu']));
  const [areaM2, setAreaM2] = useState(60);

  const largeScaleOverLimit = isLargeScale && areaM2 > LARGE_SCALE_MAX_M2;
  const largeScaleTargetTotal = useMemo(() => {
    if (!isLargeScale) return 0;
    const sumRate = LARGE_SCALE_TARGETS.filter((t) => largeScaleTargets.has(t.code)).reduce((s, t) => s + t.ratePerM2, 0);
    return sumRate * areaM2 + bathrooms * LARGE_SCALE_BATHROOM_RATE;
  }, [isLargeScale, largeScaleTargets, areaM2, bathrooms]);

  const postRenoOverLimit = isPostReno && areaM2 > POST_RENO_MAX_M2;
  const postRenoTotal = useMemo(() => {
    if (!isPostReno) return 0;
    const lvl = POST_RENO_LEVELS.find((l) => l.code === postRenoLevel)?.multiplier ?? 1;
    const sumRate = POST_RENO_TARGETS.filter((t) => postRenoTargets.has(t.code)).reduce((s, t) => s + t.ratePerM2, 0);
    const targetBase = Math.round(sumRate * areaM2 * lvl);
    const bathroomTotal = bathrooms * POST_RENO_BATHROOM_RATE;
    const kitchenTotal = postRenoHasKitchen ? POST_RENO_KITCHEN_FLAT : 0;
    return targetBase + bathroomTotal + kitchenTotal;
  }, [isPostReno, postRenoTargets, postRenoLevel, areaM2, bathrooms, postRenoHasKitchen]);

  const [dirtLevel, setDirtLevel] = useState<1 | 2 | 3>(1);
  const [photos, setPhotos] = useState<{ uri: string; size: number; url?: string }[]>([]);
  const photoCount = photos.length;
  const MAX_PHOTOS = 3;
  const [photoUploading, setPhotoUploading] = useState(false);

  async function pickPhoto(source: 'camera' | 'library') {
    if (photos.length >= MAX_PHOTOS) {
      toast.warning(`Maksimal ${MAX_PHOTOS} foto`);
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const { launchImageLibraryAsync, launchCameraAsync, MediaTypeOptions,
        requestCameraPermissionsAsync, requestMediaLibraryPermissionsAsync } = ImagePicker;

      // Cek permission sesuai source
      if (source === 'camera') {
        const perm = await requestCameraPermissionsAsync();
        if (!perm.granted) { toast.warning('Izin kamera ditolak'); return; }
      } else {
        const perm = await requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { toast.warning('Izin galeri ditolak'); return; }
      }

      const opts = {
        mediaTypes: MediaTypeOptions.Images,
        quality: 0.9,
        allowsEditing: false,
        // iOS HEIC → auto-convert ke JPEG (key untuk Apple compatibility)
        // expo-image-picker default mengembalikan JPEG di iOS, eksplisit-kan:
      };
      const r = source === 'camera'
        ? await launchCameraAsync(opts)
        : await launchImageLibraryAsync({ ...opts, allowsMultipleSelection: false });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];

      // Validate format (handle iOS HEIC: mime kosong → trust extension)
      const mime = (asset.mimeType ?? '').toLowerCase();
      const ext = (asset.uri.split('.').pop() ?? '').toLowerCase();
      const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      const allowedExt = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
      const fmtOk = (!mime && allowedExt.includes(ext)) || allowedMime.includes(mime);
      if (!fmtOk) {
        toast.error('Format harus JPG / PNG / WEBP / HEIC');
        return;
      }

      setPhotoUploading(true);
      const c = await compressImage(asset.uri);
      if (c.oversize) {
        toast.error(`Foto >5MB setelah compress (${formatBytes(c.size)}). Pilih foto lain.`);
        return;
      }
      // Upload ke R2 (public)
      const { api } = await import('../../src/lib/api');
      const { publicUrl } = await uploadWithSignedUrl(
        async () => {
          const presign = await api.post('/bookings/condition-photo-upload-url', { contentType: 'image/jpeg' });
          return (presign.data?.data ?? presign.data) as { uploadUrl: string; publicUrl: string };
        },
        c.uri,
        'image/jpeg',
      );
      setPhotos([...photos, { uri: c.uri, size: c.size, url: publicUrl }]);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal upload foto');
    } finally {
      setPhotoUploading(false);
    }
  }

  function showPhotoPicker() {
    if (Platform.OS === 'web') {
      // Web: gak punya kamera akses bagus dari Expo, langsung galeri (file picker)
      void pickPhoto('library');
      return;
    }
    Alert.alert('Tambah Foto', 'Ambil dari:', [
      { text: 'Kamera', onPress: () => pickPhoto('camera') },
      { text: 'Galeri', onPress: () => pickPhoto('library') },
      { text: 'Batal', style: 'cancel' },
    ]);
  }

  function removePhoto(idx: number) {
    setPhotos(photos.filter((_, i) => i !== idx));
  }
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
  const addressesHydrated = useAddressesStore((s) => s.hydrated);
  const defaultAddress = addressList.find((a) => a.isDefault) ?? addressList[0] ?? null;

  // Kalau cleaner/customer hapus semua alamat tersimpan, redirect ke halaman
  // tambah alamat dulu. Tanpa ini user dipaksa input manual via map picker
  // padahal expectation-nya UI formal "tambah alamat".
  useEffect(() => {
    if (!addressesHydrated) return;
    if (addressList.length === 0) {
      router.replace({ pathname: '/addresses/edit', params: { returnTo: `/booking/new?category=${categoryCode ?? ''}` } });
    }
  }, [addressesHydrated, addressList.length, categoryCode, router]);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    defaultAddress?.id ?? null,
  );
  const selectedAddress = addressList.find((a) => a.id === selectedAddressId);

  const [scheduleAt, setScheduleAt] = useState<Date>(() => earliestAvailable());
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [schedModalOpen, setSchedModalOpen] = useState(false);
  const scheduleIso = scheduleAt.toISOString();
  const [address, setAddress] = useState(
    selectedAddress?.addressLine ?? savedLocation?.address ?? '',
  );

  // Prefill form dari pesanan sebelumnya (fitur "Pesan Lagi")
  useEffect(() => {
    if (!reorderBookingId) return;
    const prev = allBookings.find((b) => b.id === reorderBookingId);
    if (!prev?.formSnapshot) return;
    const s = prev.formSnapshot as Record<string, any>;
    if (s.propertyType) setPropertyType(s.propertyType);
    if (typeof s.bedrooms === 'number') setBedrooms(s.bedrooms);
    if (typeof s.bathrooms === 'number') setBathrooms(s.bathrooms);
    if (typeof s.areaM2 === 'number') setAreaM2(s.areaM2);
    if (s.dirtLevel) setDirtLevel(s.dirtLevel as 1 | 2 | 3);
    if (Array.isArray(s.dirtCharacters)) setDirtChars(new Set(s.dirtCharacters as string[]));
    if (s.floorType) setFloorType(s.floorType);
    if (s.furnitureDensity) setFurniture(s.furnitureDensity as FurnitureDensity);
    if (Array.isArray(s.facilities)) setFacilities(new Set(s.facilities as string[]));
    if (s.floor) setFloor(String(s.floor));
    if (typeof s.hasLift === 'boolean') setHasLift(s.hasLift);
    if (s.cleanMode) setCleaningMode(s.cleanMode as 'general' | 'deep');
    if (s.notes) setNotes(s.notes as string);
    if (s.bathroomSize) setBathroomSize(s.bathroomSize as string);
    if (Array.isArray(s.largeScaleTargets)) setLargeScaleTargets(new Set(s.largeScaleTargets as string[]));
    if (Array.isArray(s.postRenoTargets)) setPostRenoTargets(new Set(s.postRenoTargets as string[]));
    if (s.postRenoLevel) setPostRenoLevel(s.postRenoLevel as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reorderBookingId]);

  // Hitung travel fee - debounce 800ms + cache per koordinat (hindari spam API)
  useEffect(() => {
    const lat = selectedAddress?.lat ?? savedLocation?.lat;
    const lng = selectedAddress?.lng ?? savedLocation?.lng;
    if (!lat || !lng) { setTravelQuote(null); return; }
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    // skip kalau quote terakhir untuk koordinat yg sama
    if ((travelQuote as any)?._key === key) return;
    const t = setTimeout(async () => {
      try {
        const { api } = await import('../../src/lib/api');
        const r = await api.post('/bookings/travel-quote', { lat, lng });
        const q = r.data?.data ?? r.data;
        if (!q || typeof q !== 'object') { setTravelQuote(null); return; }
        const safe = {
          enabled: !!q.enabled,
          distanceKm: Number.isFinite(Number(q.distanceKm)) ? Number(q.distanceKm) : 0,
          travelFee: Number.isFinite(Number(q.travelFee)) ? Number(q.travelFee) : 0,
          freeKm: Number.isFinite(Number(q.freeKm)) ? Number(q.freeKm) : 0,
          perKmIdr: Number.isFinite(Number(q.perKmIdr)) ? Number(q.perKmIdr) : 0,
          nearestAreaName: typeof q.nearestAreaName === 'string' ? q.nearestAreaName : null,
        };
        setTravelQuote({ ...safe, _key: key } as any);
        setTravelErr(null);
      } catch (e: any) {
        const err = e?.response?.data?.error;
        setTravelErr(err?.message ?? 'Gagal hitung biaya transport');
        setTravelQuote(null);
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddress?.id, savedLocation?.lat, savedLocation?.lng]);
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

  // Admin-configurable multipliers (default fallback ke catalog hardcoded)
  const dirtMultipliersCfg = useConfig('pricing.dirt_multipliers' as any, null) as any;
  const floorSurchargesCfg = useConfig('pricing.floor_surcharges_idr' as any, null) as any;
  const furnitureMultipliersCfg = useConfig('pricing.furniture_multipliers' as any, null) as any;

  const dirtMultiplier = (() => {
    if (dirtMultipliersCfg && typeof dirtMultipliersCfg === 'object') {
      const v = Number(dirtMultipliersCfg[String(dirtLevel)] ?? dirtMultipliersCfg[dirtLevel]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return DIRT_LEVELS.find((d) => d.level === dirtLevel)?.multiplier ?? 1;
  })();

  const photoPenalty = 0;
  const rawPackagePrice = isPerMeter
    ? Math.max(perMeterMin, areaM2 * perMeterRate)
    : isBathroom
      ? Math.round(((pkg?.price ?? 0) * bathroomMult) / 1000) * 1000
      : (pkg?.price ?? 0);
  const basePrice = applyCleanMode(rawPackagePrice, cleanMode, deepMultiplier);
  const deepSurcharge = cleanMode === 'deep' ? basePrice - rawPackagePrice : 0;
  // Surcharge dihitung dari rawPackagePrice (BUKAN basePrice) supaya gak compound dengan Deep Clean multiplier.
  const dirtSurcharge = Math.round(rawPackagePrice * (dirtMultiplier - 1 + photoPenalty));

  // Penyesuaian luas: baseline 60 m², +5% per 20 m² ekstra, max +40% (8 step).
  // Per-meter & large scale gak kena (udah area-based di rawPackagePrice).
  const areaSteps = Math.min(8, Math.max(0, Math.floor((areaM2 - 60) / 20)));
  const sizePctExtra = (isPerMeter || isLargeScale) ? 0 : areaSteps * 0.05;
  const sizeSurcharge = Math.round(rawPackagePrice * sizePctExtra);

  // Lantai: pakai admin-configurable surcharges. Default: 1=0, 2=50k, 3=100k, >3=200k.
  const floorSurchargeFlat = (() => {
    if (floorSurchargesCfg && typeof floorSurchargesCfg === 'object') {
      const v = Number(floorSurchargesCfg[floor] ?? 0);
      if (Number.isFinite(v) && v >= 0) return v;
    }
    return floor === '1' ? 0 : floor === '2' ? 50000 : floor === '3' ? 100000 : 200000;
  })();
  const floorN = floor === '>3' ? 4 : Math.max(1, parseInt(floor, 10) || 1);
  const floorPct = 0; // sekarang surcharge flat, bukan persen
  // Furniture density multiplier
  const furnitureMultiplier = (() => {
    if (furnitureMultipliersCfg && typeof furnitureMultipliersCfg === 'object') {
      const v = Number(furnitureMultipliersCfg[furniture] ?? 1);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return furniture === 'Padat' ? 1.15 : 1;
  })();
  const noLiftPenalty = floorN >= 3 && !hasLift ? 0.05 : 0;
  // Floor surcharge: flat (dari admin config) + no-lift penalty (5% kalau lantai 3+ tanpa lift)
  const floorSurcharge = floorSurchargeFlat + Math.round(rawPackagePrice * noLiftPenalty);
  const furnitureSurcharge = Math.round(rawPackagePrice * (furnitureMultiplier - 1));

  // Ruangan ekstra: kamar tidur ke-2+ +10% per kamar (max 4), kamar mandi ke-2+ +5% per (max 3).
  // Total room surcharge di-cap di +40% biar gak meledak gabung sama surcharge lain.
  const extraBedrooms = Math.min(4, Math.max(0, bedrooms - 1));
  const extraBathrooms = Math.min(3, Math.max(0, bathrooms - 1));
  const roomPctExtra = Math.min(0.40, extraBedrooms * 0.10 + extraBathrooms * 0.05);
  const roomSurcharge = Math.round(rawPackagePrice * roomPctExtra);

  // Tipe properti modifier: komersial (Ruko/Kantor) paling tinggi krn area lebih kompleks,
  // Villa medium, Apartemen ringan.
  const propertyMultiplier =
    propertyType === 'Ruko' || propertyType === 'Kantor' ? 0.15 :
    propertyType === 'Villa' ? 0.10 :
    propertyType === 'Apartemen' ? 0.05 :
    0;
  const propertySurcharge = Math.round(rawPackagePrice * propertyMultiplier);

  // Hewan peliharaan: +Rp 15k flat (extra time + risiko alergi/cleaner takut)
  const petSurcharge = hasPet ? 15000 : 0;

  const addonTotal = useMemo(
    () => ADDONS.filter((a) => selectedAddons.has(a.code)).reduce((s, a) => s + a.price, 0),
    [ADDONS, selectedAddons],
  );
  const addonDurationMin = useMemo(
    () => ADDONS.filter((a) => selectedAddons.has(a.code)).reduce((s, a) => s + Number(a.durationMin ?? 0), 0),
    [ADDONS, selectedAddons],
  );
  const packageDurationMin = useMemo(() => {
    const rawDuration = Math.max(0, Number(pkg?.durationMin ?? 0));
    if (!rawDuration) return 0;
    if (isPerMeter || isLargeScale || isPostReno || isSubscription) return rawDuration;
    if (cleanMode === 'deep') return Math.ceil(rawDuration * deepMultiplier);
    return rawDuration;
  }, [pkg?.durationMin, isPerMeter, isLargeScale, isPostReno, isSubscription, cleanMode, deepMultiplier]);
  // basePrice sudah include deepSurcharge (via applyCleanMode). Surcharge lain = additive di atasnya.
  // Subscription: addon dikali jumlah kunjungan (paket bulanan = layanan tambahan per visit).
  const subscriptionAddonTotal = isSubscription && subscriptionVisits > 0 ? addonTotal * subscriptionVisits : addonTotal;
  const subtotal = isLargeScale
    ? largeScaleTargetTotal + addonTotal
    : isPostReno
      ? postRenoTotal + addonTotal
      : isSubscription
        ? Math.round(basePrice * subscriptionTierMultiplier) + subscriptionAddonTotal
        : basePrice + dirtSurcharge + sizeSurcharge + floorSurcharge + furnitureSurcharge + roomSurcharge + propertySurcharge + petSurcharge + addonTotal;
  const [voucher, setVoucher] = useState<{ code: string; discount: number; voucherId: string } | null>(null);
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherChecking, setVoucherChecking] = useState(false);
  const totalBeforeOvertime = subtotal - (voucher?.discount ?? 0);
  const estimatedDurationMin = packageDurationMin + addonDurationMin;
  const overtimeQuote = useMemo(() => quoteNightOvertime(scheduleAt, estimatedDurationMin), [scheduleAt, estimatedDurationMin]);
  const total = totalBeforeOvertime + overtimeQuote.surcharge;
  const shouldRecommendExtraWorker =
    !isLargeScale
    && !isPostReno
    && !isSubscription
    && (
      totalBeforeOvertime >= 800_000
      || estimatedDurationMin >= 270
      || areaM2 >= 180
      || extraBedrooms + extraBathrooms >= 5
      || ['Ruko', 'Kantor', 'Villa'].includes(propertyType)
    );
  const needsWaConsultation = ((areaM2 >= 200 && !isLargeScale && !isPostReno) || workers > 1 || largeScaleOverLimit || postRenoOverLimit) && step === 1;

  async function applyVoucher() {
    if (!voucherInput.trim()) return;
    setVoucherChecking(true);
    try {
      const { api } = await import('../../src/lib/api');
      const res = await api.post('/vouchers/validate', { code: voucherInput.trim().toUpperCase(), orderAmount: subtotal });
      const data = res.data?.data ?? res.data;
      setVoucher({ code: data.code, discount: data.discount, voucherId: data.voucherId });
      setVoucherInput('');
      toast.success(`Voucher ${data.code} dipakai - hemat ${formatRupiah(data.discount)}!`);
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
    if (step === 1 && !pkg && !isLargeScale && !isPostReno) {
      toast.error('Pilih paket dulu');
      return;
    }
    if (step === 1 && isLargeScale && areaM2 < 50) {
      toast.error('Masukin luas area minimal 50 m²');
      return;
    }
    if (step === 1 && isPostReno && areaM2 < 20) {
      toast.error('Masukin luas area minimal 20 m²');
      return;
    }
    if (step === 2 && isSubscription && subscriptionVisits > 0 && subscriptionDates.length !== subscriptionVisits) {
      toast.error(`Pilih tepat ${subscriptionVisits} tanggal kunjungan sesuai paket`);
      return;
    }
    // Skala Besar / Pasca Renovasi over-limit wajib WA quote.
    if (step === 1 && (largeScaleOverLimit || postRenoOverLimit)) {
      router.push({ pathname: '/booking/wa-survey', params: { category: categoryCode } });
      return;
    }
    if (step === 2 && !address.trim()) {
      toast.error('Isi alamat dulu sebelum lanjut');
      setAddressError('Alamat wajib diisi (pin di peta atau ketik manual)');
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
      safeBack();
    }
  }

  function submit() {
    if ((!pkg && !isLargeScale && !isPostReno) || !category) return;
    if (!address.trim()) {
      setAddressError('Alamat wajib diisi (pin di peta atau ketik manual)');
      toast.error('Alamat wajib diisi');
      return;
    }
    setAddressError(null);
    doSubmit();
  }

  async function doSubmit() {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    if ((!pkg && !isLargeScale && !isPostReno) || !category) {
      toast.error('Paket layanan belum tersedia. Coba pilih layanan lain atau hubungi customer service.');
      submitLockRef.current = false;
      setSubmitting(false);
      return;
    }
    const selectedPackage = pkg;
    if (largeScaleOverLimit || postRenoOverLimit) {
      router.replace({ pathname: '/booking/wa-survey', params: { category: categoryCode } });
      return;
    }
    let booking;
    try {
      booking = await create({
      pricingMode: 'package',
      categoryCode: category.code,
      categoryName: category.name,
      categoryImage: category.imageUrl,
      packageId: selectedPackage?.id,
      packageName: selectedPackage ? (cleanMode === 'deep' ? `${selectedPackage.name} (Deep Cleaning)` : selectedPackage.name) : category.name,
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
      customerNotes: notes.trim() || undefined,
      formSnapshot: {
        propertyType,
        floor,
        hasLift,
        bedrooms,
        bathrooms,
        facilities: Array.from(facilities),
        areaM2,
        largeScaleTargets: isLargeScale ? Array.from(largeScaleTargets) : undefined,
        postRenoTargets: isPostReno ? Array.from(postRenoTargets) : undefined,
        postRenoLevel: isPostReno ? postRenoLevel : undefined,
        postRenoHasKitchen: isPostReno ? postRenoHasKitchen : undefined,
        subscriptionDates: isSubscription ? subscriptionDates : undefined,
        subscriptionVisits: isSubscription ? subscriptionVisits : undefined,
        subscriptionTier: isSubscription ? subscriptionTier : undefined,
        subscriptionTierMultiplier: isSubscription ? subscriptionTierMultiplier : undefined,
        dirtLevel,
        dirtCharacters: Array.from(dirtChars),
        floorType,
        furnitureDensity: furniture,
        hasWater,
        hasElectricity,
        hasPet,
        petNote,
        notes,
        customerNotes: notes.trim() || undefined,
        photoCount,
        cleanMode,
        cleanModeMultiplier: cleanMode === 'deep' ? deepMultiplier : 1,
        voucherCode: voucher?.code,
        overtimeSurcharge: overtimeQuote.surcharge,
        overtimeHours: overtimeQuote.overtimeHours,
        estimatedEndAt: overtimeQuote.estimatedEnd.toISOString(),
        conditionPhotos: photos.map((p) => p.url).filter((url): url is string => Boolean(url)),
      },
      initialStatus: 'pending_payment',
      });
    } catch {
      // Error toast already shown by store; abort navigation.
      submitLockRef.current = false;
      setSubmitting(false);
      return;
    }
    toast.success('Pesanan dibuat - silakan bayar untuk mulai cari cleaner');
    try {
      const { storage } = await import('../../src/lib/storage');
      storage.set(`useCredit:${booking.id}`, useCredit ? '1' : '0');
    } catch {}
    try {
      const { Track } = await import('../../src/lib/analytics');
      Track.bookingCreated(booking.id, total, categoryCode ?? 'unknown');
    } catch {}
    router.replace({ pathname: '/booking/[id]', params: { id: booking.id } });
  }

  if (!category) return null;

  // Coverage gate - cek alamat booking yang dipilih dulu (paling akurat untuk lokasi job).
  // Kalau belum pilih alamat / alamat ga punya coords, fallback ke GPS user.
  // serviceAreas = [] (admin belum config any) treated as "covered" so we don't break onboarding.
  const userLoc = useLocationStore.getState().current;
  const areas = useAppContent.getState().content.serviceAreas;
  const checkLoc =
    selectedAddress && Number.isFinite(selectedAddress.lat) && Number.isFinite(selectedAddress.lng)
      ? { lat: selectedAddress.lat, lng: selectedAddress.lng }
      : userLoc
        ? { lat: userLoc.lat, lng: userLoc.lng }
        : null;
  const cov = checkCoverage(checkLoc, areas);
  if (!cov.covered) {
    const hasChosenLocation = Boolean(checkLoc);
    const title = hasChosenLocation ? 'Belum tersedia di area kamu' : 'Set lokasi dulu';
    const description = hasChosenLocation
      ? cov.nearestAreaName
        ? `Area terdekat yang kami layani: ${cov.nearestAreaName} (${Math.round((cov.distanceM ?? 0) / 1000)} km dari lokasi kamu).`
        : 'Area ini belum masuk jangkauan layanan kami saat ini.'
      : 'Kamu belum pilih lokasi. Set lokasi dulu dari Beranda supaya kami bisa cek coverage area dan tampilkan layanan yang tersedia.';
    return (
      <View className="flex-1 items-center justify-center bg-white p-8">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle color="#B45309" size={40} />
        </View>
        <Text className="font-bold mt-4 text-center text-lg text-ink-900">{title}</Text>
        <Text className="font-sans mt-2 text-center text-sm text-ink-600">
          {description}
        </Text>
        {hasChosenLocation ? (
          <>
            <Pressable
              onPress={() => router.replace({ pathname: '/city-request', params: { city: userLoc?.shortLabel ?? '' } })}
              className="mt-6 w-full max-w-xs rounded-2xl bg-brand-600 px-6 py-3 items-center"
            >
              <Text className="font-bold text-white">Request Kota Saya</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const waNumber = useAppContent.getState().content.config['contact.whatsapp'] || '6285124363374';
                const msg = encodeURIComponent(
                  `Halo admin JasaBersih, saya mau konsultasi booking di area ${userLoc?.shortLabel ?? 'lokasi saya'} (di luar coverage). Bisa tolong dibantu?`,
                );
                Linking.openURL(`https://wa.me/${waNumber}?text=${msg}`).catch(() => {});
              }}
              className="mt-3 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-success px-6 py-3"
            >
              <MessageCircle color="white" size={18} fill="white" strokeWidth={0} />
              <Text className="font-bold text-white">Hubungi Admin (WA)</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => router.replace('/')}
            className="mt-6 w-full max-w-xs rounded-2xl bg-brand-600 px-6 py-3 items-center"
          >
            <Text className="font-bold text-white">Set Lokasi di Beranda</Text>
          </Pressable>
        )}
        <Pressable onPress={() => safeBack()} className="mt-3">
          <Text className="font-semibold text-brand-600">Kembali</Text>
        </Pressable>
      </View>
    );
  }

  if (shouldRedirect) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center bg-ink-50" />
      </>
    );
  }

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
          contentContainerStyle={{ paddingBottom: 260 }}
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <>
              {isPerMeter && (
                <Section title={`${category?.name ?? ''} - per m²`}>
                  <View className="rounded-xl border border-brand-200 bg-brand-50 p-3">
                    <Text className="font-extrabold text-base text-brand-800">
                      Rp {perMeterRate.toLocaleString('id-ID')}/m²
                    </Text>
                    <Text className="font-medium mt-1 text-[11px] text-ink-700">
                      Estimasi total dihitung dari luas area. Minimum {formatRupiah(perMeterMin)}.
                    </Text>
                  </View>

                  {category?.code === 'apartemen' && (
                    <>
                      <Label className="mt-4">Tipe Unit</Label>
                      <View className="flex-row flex-wrap gap-2">
                        {APT_TYPES.map((t) => {
                          const active = aptType === t.code;
                          return (
                            <Pressable
                              key={t.code}
                              onPress={() => { setAptType(t.code); setAreaM2(t.m2); }}
                              className={`rounded-full border px-3 py-2 ${active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'}`}
                            >
                              <Text className={`font-bold text-xs ${active ? 'text-white' : 'text-ink-800'}`}>
                                {t.label} · {t.m2}m²
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  <Label className="mt-4">Luas Area (m²)</Label>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => setAreaM2(Math.max(10, areaM2 - 10))}
                      className="h-10 w-10 items-center justify-center rounded-full border border-ink-300 bg-white"
                    >
                      <Minus color="#1D4ED8" size={18} strokeWidth={2.4} />
                    </Pressable>
                    <View className="flex-1 items-center rounded-xl border border-ink-200 bg-white py-2">
                      <Text className="font-extrabold text-2xl text-ink-900">{areaM2} m²</Text>
                    </View>
                    <Pressable
                      onPress={() => setAreaM2(Math.min(2000, areaM2 + 10))}
                      className="h-10 w-10 items-center justify-center rounded-full border border-ink-300 bg-white"
                    >
                      <Plus color="#1D4ED8" size={18} strokeWidth={2.4} />
                    </Pressable>
                  </View>

                  <View className="mt-3 rounded-lg bg-emerald-50 p-3">
                    <Text className="font-medium text-[10px] uppercase tracking-wider text-emerald-700">Estimasi Awal</Text>
                    <Text className="font-extrabold mt-1 text-2xl text-emerald-900">
                      {formatRupiah(Math.max(perMeterMin, areaM2 * perMeterRate))}
                    </Text>
                    <Text className="font-medium mt-1 text-[10px] text-emerald-700">
                      {areaM2} m² × Rp {perMeterRate.toLocaleString('id-ID')} = {formatRupiah(areaM2 * perMeterRate)}
                      {areaM2 * perMeterRate < perMeterMin && ' (kena harga minimum)'}
                    </Text>
                  </View>

                  {/* Disclaimer charge tambahan */}
                  <View className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <Text className="font-bold text-[11px] text-amber-900">⚠ Charge Tambahan Mungkin Berlaku</Text>
                    <Text className="font-medium mt-1 text-[10px] leading-4 text-amber-800">
                      Harga di atas estimasi awal berdasarkan luas. Jika di lokasi kondisi kotor parah (kerak tebal, jamur berat, pasca renovasi) atau ada tambahan area yang harus dibersihkan, cleaner akan kirim permintaan charge tambahan via app sebelum lanjut kerja. Kamu bisa Setujui / Tolak.
                    </Text>
                  </View>
                </Section>
              )}

              {/* Detail Layanan untuk per-meter (Ruko/Kantor/Apartemen) */}
              {isPerMeter && pkg && (
                <Section title={`Detail Layanan · ${category?.name ?? ''}`}>
                  <Text className="font-medium text-[11px] leading-5 text-ink-600">
                    {(pkg as any).note || (typeof pkg.scope === 'string' ? pkg.scope : '') || 'Pembersihan area komersial sesuai standar layanan.'}
                  </Text>
                  {(((pkg as any).includes as string[] | undefined)?.length ?? 0) > 0 ? (
                    <View className="mt-3 gap-1.5">
                      {((pkg as any).includes as string[]).map((it, i) => (
                        <View key={i} className="flex-row items-start gap-2">
                          <View className="mt-0.5 h-4 w-4 items-center justify-center rounded-full bg-success/15">
                            <Check color="#10B981" size={11} strokeWidth={3} />
                          </View>
                          <Text className="font-medium flex-1 text-[12px] leading-5 text-ink-800">{it}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View className="mt-2 rounded-lg bg-amber-50 p-2">
                      <Text className="font-medium text-[10px] text-amber-800">
                        Detail layanan belum lengkap. Hubungi admin via chat untuk info detail.
                      </Text>
                    </View>
                  )}

                  <View className="mt-3 rounded-lg bg-brand-50 p-3">
                    <Text className="font-bold text-[11px] text-brand-900">💬 Butuh konsultasi area kompleks?</Text>
                    <Text className="font-medium mt-1 text-[10px] leading-4 text-brand-700">
                      Untuk area besar / kondisi khusus, chat admin via WhatsApp dari tombol di bawah agar dapat estimasi akurat sebelum booking.
                    </Text>
                  </View>
                </Section>
              )}

              {isSimpleService && !pkg && (
                <Section title={`Detail Layanan · ${category?.name ?? ''}`}>
                  <View className="items-center py-6">
                    <Text className="font-medium text-[12px] text-ink-500">Memuat detail layanan...</Text>
                  </View>
                </Section>
              )}
              {isSimpleService && pkg && (
                <>
                  {/* Kamar mandi: pilih ukuran (kalau ada) */}
                  {isBathroom && (
                    <Section title="Ukuran Kamar Mandi">
                      <View className="flex-row gap-2">
                        {BATHROOM_SIZES.map((s) => {
                          const active = bathroomSize === s.code;
                          return (
                            <Pressable
                              key={s.code}
                              onPress={() => setBathroomSize(s.code)}
                              className={`flex-1 items-center rounded-xl border py-3 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                            >
                              <Text className={`font-bold text-sm ${active ? 'text-brand-700' : 'text-ink-900'}`}>{s.label}</Text>
                              <Text className={`mt-0.5 text-[10px] ${active ? 'text-brand-600' : 'text-ink-500'}`}>{s.desc}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Section>
                  )}

                  {/* Detail Pekerjaan - selalu tampil (fallback ke generic kalau scope kosong) */}
                  <Section title={`Detail Layanan · ${pkg.name}`}>
                    <Text className="font-medium text-[11px] leading-5 text-ink-600">
                      {(pkg as any).note || (typeof pkg.scope === 'string' ? pkg.scope : '') || 'Pembersihan menyeluruh sesuai standar layanan.'}
                    </Text>
                    {(((pkg as any).includes as string[] | undefined)?.length ?? 0) > 0 ? (
                      <View className="mt-3 gap-1.5">
                        {((pkg as any).includes as string[]).map((it, i) => (
                          <View key={i} className="flex-row items-start gap-2">
                            <View className="mt-0.5 h-4 w-4 items-center justify-center rounded-full bg-success/15">
                              <Check color="#10B981" size={11} strokeWidth={3} />
                            </View>
                            <Text className="font-medium flex-1 text-[12px] leading-5 text-ink-800">{it}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View className="mt-2 rounded-lg bg-amber-50 p-2">
                        <Text className="font-medium text-[10px] text-amber-800">
                          Detail layanan belum lengkap. Hubungi admin via chat untuk info detail.
                        </Text>
                      </View>
                    )}
                  </Section>
                </>
              )}

              {isPostReno && (
                <Section title="Cakupan Layanan Bersih Pasca Renovasi">
                  <Text className="font-medium mb-2 text-[11px] text-ink-600">
                    Layanan basic yang kamu dapet (detail scope kamu pilih di step berikutnya):
                  </Text>
                  <View className="gap-1.5">
                    {[
                      'Sapu & buang debu konstruksi seluruh area',
                      'Lap kaca, jendela, kusen & frame pintu',
                      'Bersih sisa cat / plamir di lantai & permukaan',
                      'Pel + poles lantai sampai bersih',
                      'Lap saklar, stop kontak & AC outdoor',
                      'Bersih sarang laba-laba & plafon',
                      'Lap furniture, kabinet & rak built-in',
                      'Bawa alat & cairan khusus pasca renovasi',
                    ].map((it, i) => (
                      <View key={i} className="flex-row items-start gap-2">
                        <View className="mt-0.5 h-4 w-4 items-center justify-center rounded-full bg-success/15">
                          <Check color="#10B981" size={11} strokeWidth={3} />
                        </View>
                        <Text className="font-medium flex-1 text-[12px] leading-5 text-ink-800">{it}</Text>
                      </View>
                    ))}
                  </View>
                </Section>
              )}
              {(!isSimpleService && !isPerMeter && !isPostReno && categoryPackages.length === 0) && (
                <Section title={`Cakupan Layanan ${category?.name ?? ''}`}>
                  <View className="items-center py-6">
                    <Text className="font-medium text-[12px] text-ink-500">Paket layanan belum tersedia untuk layanan ini.</Text>
                  </View>
                </Section>
              )}
              {(!isSimpleService && !isPerMeter && !isPostReno && categoryPackages.length > 0) && (
                <Section title={categoryPackages.length === 1 ? `Cakupan Layanan ${category?.name ?? ''}` : 'Pilih Paket'}>
                  <View className="gap-2">
                    {categoryPackages.map((p) => {
                      const active = p.id === pickedPackageId;
                      const includes: string[] = (p as any).includes ?? [];
                      const note: string | undefined = (p as any).note;
                      const single = categoryPackages.length === 1;
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => setPickedPackageId(p.id)}
                          disabled={single}
                          className={`rounded-xl border p-3 ${
                            active || single ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                          }`}
                        >
                          <View className="flex-row items-center justify-between">
                            <Text className="font-semibold flex-1 text-sm text-ink-900">{single ? 'Cakupan Pekerjaan' : p.name}</Text>
                            <View className="items-end">
                              <Text className="font-bold text-sm text-brand-600">{formatRupiah(applyCleanMode(p.price, cleanMode, deepMultiplier))}</Text>
                              {cleanMode === 'deep' && (
                                <Text className="font-semibold text-[10px] text-amber-700">
                                  Deep +{Math.round((deepMultiplier - 1) * 100)}%
                                </Text>
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
                              <Text className="font-sans text-[10px] text-amber-800">ℹ {note}</Text>
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

              {!isSimpleService && !isPerMeter && !isSubscription && <Section title="Properti">
                <Label>Tipe Properti</Label>
                <Dropdown
                  options={(isLargeScale ? LARGE_SCALE_PROPERTY_TYPES : isPostReno ? POST_RENO_PROPERTY_TYPES : PROPERTY_TYPES) as readonly string[]}
                  value={propertyType}
                  onChange={(v) => setPropertyType(v as PropertyType)}
                  placeholder="Pilih tipe properti"
                />
                {isPostReno && (
                  <>
                    <Label className="mt-4">Tingkat Renovasi</Label>
                    <View className="gap-1.5">
                      {POST_RENO_LEVELS.map((lvl) => {
                        const active = postRenoLevel === lvl.code;
                        return (
                          <Pressable
                            key={lvl.code}
                            onPress={() => setPostRenoLevel(lvl.code)}
                            className={`rounded-xl border px-3 py-2.5 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                          >
                            <View className="flex-row items-center justify-between">
                              <Text className={`font-bold text-sm ${active ? 'text-brand-700' : 'text-ink-900'}`}>{lvl.label}</Text>
                              <Text className={`font-bold text-[11px] ${active ? 'text-brand-700' : 'text-ink-500'}`}>x{lvl.multiplier}</Text>
                            </View>
                            <Text className="font-medium mt-0.5 text-[11px] text-ink-500">{lvl.desc}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Label className="mt-4">Luas Area (m²)</Label>
                    <Text className="font-sans -mt-1 mb-2 text-[11px] text-ink-500">
                      Masukin luas total area yang dibersihin pasca renovasi.
                    </Text>
                    <View className="flex-row items-center rounded-xl border border-ink-200 bg-white">
                      <Pressable onPress={() => setAreaM2(Math.max(0, areaM2 - 10))} className="h-12 w-12 items-center justify-center">
                        <Minus color="#1D4ED8" size={20} strokeWidth={2.4} />
                      </Pressable>
                      <TextInput
                        value={String(areaM2)}
                        onChangeText={(v) => {
                          const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
                          setAreaM2(Number.isFinite(n) ? Math.min(10000, Math.max(0, n)) : 0);
                        }}
                        keyboardType="number-pad"
                        placeholder="100"
                        placeholderTextColor="#94A3B8"
                        className="font-bold flex-1 py-3 text-center text-base text-ink-900"
                      />
                      <Pressable onPress={() => setAreaM2(Math.min(10000, areaM2 + 10))} className="h-12 w-12 items-center justify-center">
                        <Plus color="#1D4ED8" size={20} strokeWidth={2.4} />
                      </Pressable>
                    </View>
                    <Text className="font-sans mt-1.5 text-[10px] text-ink-500">Satuan m² · tombol +/- ubah 10 m²</Text>
                    {postRenoOverLimit && (
                      <View className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                        <Text className="font-bold text-xs text-amber-900">Luas {'>'} 300 m² - perlu survei</Text>
                        <Text className="font-medium mt-1 text-[11px] text-amber-800">
                          Pasca renovasi area besar bervariasi tingkat puing-nya. Tim kami survei dulu.
                        </Text>
                      </View>
                    )}
                  </>
                )}
                {isLargeScale && (
                  <>
                    <Label className="mt-4">Luas Area (m²)</Label>
                    <Text className="font-sans -mt-1 mb-2 text-[11px] text-ink-500">
                      Masukin perkiraan luas total yang mau dibersihin. Tim kami akan konfirmasi ulang setelah survei.
                    </Text>
                    <View className="flex-row items-center rounded-xl border border-ink-200 bg-white">
                      <Pressable
                        onPress={() => setAreaM2(Math.max(0, areaM2 - 50))}
                        className="h-12 w-12 items-center justify-center"
                      >
                        <Minus color="#1D4ED8" size={20} strokeWidth={2.4} />
                      </Pressable>
                      <TextInput
                        value={String(areaM2)}
                        onChangeText={(v) => {
                          const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
                          setAreaM2(Number.isFinite(n) ? Math.min(50000, Math.max(0, n)) : 0);
                        }}
                        keyboardType="number-pad"
                        placeholder="1500"
                        placeholderTextColor="#94A3B8"
                        className="font-bold flex-1 py-3 text-center text-base text-ink-900"
                      />
                      <Pressable
                        onPress={() => setAreaM2(Math.min(50000, areaM2 + 50))}
                        className="h-12 w-12 items-center justify-center"
                      >
                        <Plus color="#1D4ED8" size={20} strokeWidth={2.4} />
                      </Pressable>
                    </View>
                    <Text className="font-sans mt-1.5 text-[10px] text-ink-500">Satuan m² · tombol +/- ubah 50 m²</Text>
                  </>
                )}
                {!isLargeScale && !isPostReno && (
                  <>
                    <Label className="mt-3">Lantai / Tingkat</Label>
                    <Chips options={FLOOR_OPTIONS as readonly string[]} value={floor} onChange={setFloor} />
                    {(propertyType === 'Apartemen' || floor !== '1') && (
                      <View className="mt-3">
                        <ToggleRow label="Akses Lift" value={hasLift} onChange={setHasLift} />
                      </View>
                    )}
                  </>
                )}
              </Section>}

              {!isSimpleService && !isPerMeter && !isLargeScale && !isPostReno && !isSubscription && <Section title="Ruangan">
                <View className="flex-row items-center justify-between">
                  <Label className="mb-0">Kamar Tidur</Label>
                  <Stepper value={bedrooms} onChange={setBedrooms} min={0} max={10} />
                </View>
                <View className="mt-3 flex-row items-center justify-between">
                  <Label className="mb-0">Kamar Mandi</Label>
                  <Stepper value={bathrooms} onChange={setBathrooms} min={0} max={10} />
                </View>
                <View className="mt-3 flex-row items-center justify-between">
                  <Label className="mb-0">Jumlah Petugas</Label>
                  <Stepper value={workers} onChange={setWorkers} min={1} max={10} />
                </View>
                {shouldRecommendExtraWorker && workers === 1 && (
                  <View className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                    <Text className="font-bold text-xs text-amber-900">
                      Disarankan 2 petugas
                    </Text>
                    <Text className="mt-1 text-[11px] leading-4 text-amber-900">
                      Estimasi pekerjaan cukup panjang atau area cukup besar. Dengan 2 petugas, pekerjaan bisa selesai lebih cepat dan lebih nyaman untuk jadwal malam.
                    </Text>
                    <Pressable
                      onPress={() => setWorkers(2)}
                      className="mt-2 self-start rounded-full bg-amber-500 px-3 py-1.5"
                    >
                      <Text className="font-bold text-[11px] text-white">Pakai 2 Petugas</Text>
                    </Pressable>
                  </View>
                )}
                {workers > 1 && (
                  <View className="mt-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                    <Text className="font-bold text-xs text-emerald-900">
                      {workers} petugas dipilih
                    </Text>
                    <Text className="mt-1 text-[11px] leading-4 text-emerald-900">
                      Tim customer service akan bantu finalisasi pembagian petugas dan penyesuaian jadwal melalui WhatsApp.
                    </Text>
                  </View>
                )}
                <Label className="mt-4">Fasilitas Lain (pilih beberapa)</Label>
                <View className="gap-1.5">
                  {ROOM_FACILITIES.map((f) => {
                    const active = facilities.has(f);
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setFacilities(toggleSet(facilities, f))}
                        className={`flex-row items-center gap-3 rounded-xl border px-3 py-2.5 ${
                          active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                        }`}
                      >
                        <View
                          className={`h-5 w-5 items-center justify-center rounded border-2 ${
                            active ? 'border-brand-600 bg-brand-600' : 'border-ink-300 bg-white'
                          }`}
                        >
                          {active && <Check color="white" size={13} strokeWidth={3} />}
                        </View>
                        <Text className={`font-semibold text-sm ${active ? 'text-brand-700' : 'text-ink-800'}`}>
                          {f}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>}

              {!isSimpleService && !isPerMeter && !isLargeScale && !isPostReno && !isSubscription && <Section title="Perkiraan Luas">
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
                {areaM2 >= 200 && (
                  <View className="mt-3 flex-row items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                    <AlertTriangle color="#047857" size={16} />
                    <Text className="flex-1 font-bold text-xs text-emerald-900">
                      Luas {'>'} 200 m² - perlu konsultasi. Pakai tombol "Chat WA" di bawah.
                    </Text>
                  </View>
                )}
              </Section>}
            </>
          )}

          {step === 2 && (
            <>
              {isPostReno && (
                <Section title="Scope Pasca Renovasi">
                  {postRenoOverLimit && (
                    <View className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                      <Text className="font-bold text-xs text-amber-900">Luas {'>'} 300 m² - perlu survei</Text>
                      <Text className="font-medium mt-1 text-[11px] text-amber-800">
                        Tombol "Lanjut" otomatis arahin ke Chat WA untuk Quote.
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center justify-between">
                    <Label className="mb-0">Jumlah Kamar Mandi</Label>
                    <Stepper value={bathrooms} onChange={setBathrooms} min={0} max={20} />
                  </View>
                  {!postRenoOverLimit && bathrooms > 0 && (
                    <Text className="font-medium mt-1 text-[10px] text-ink-500">
                      {bathrooms} x {formatRupiah(POST_RENO_BATHROOM_RATE)} = {formatRupiah(bathrooms * POST_RENO_BATHROOM_RATE)}
                    </Text>
                  )}
                  <View className="mt-4">
                    <ToggleRow label={`Bersih Dapur Pasca Renovasi (+${formatRupiah(POST_RENO_KITCHEN_FLAT)})`} value={postRenoHasKitchen} onChange={setPostRenoHasKitchen} />
                  </View>
                  <Label className="mt-4">Scope Pembersihan (pilih beberapa)</Label>
                  <Text className="font-medium -mt-1 mb-2 text-[11px] text-ink-500">
                    {postRenoOverLimit
                      ? 'Centang scope - harga final dari survei.'
                      : `Harga = rate x luas (${areaM2} m²) x multiplier tingkat renovasi.`}
                  </Text>
                  <View className="gap-1.5">
                    {POST_RENO_TARGETS.map((t) => {
                      const active = postRenoTargets.has(t.code);
                      const lvl = POST_RENO_LEVELS.find((l) => l.code === postRenoLevel)?.multiplier ?? 1;
                      const lineTotal = Math.round(t.ratePerM2 * areaM2 * lvl);
                      return (
                        <Pressable
                          key={t.code}
                          onPress={() => setPostRenoTargets(toggleSet(postRenoTargets, t.code))}
                          className={`rounded-xl border px-3 py-2.5 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                        >
                          <View className="flex-row items-center gap-3">
                            <View className={`h-5 w-5 items-center justify-center rounded border-2 ${active ? 'border-brand-600 bg-brand-600' : 'border-ink-300 bg-white'}`}>
                              {active && <Check color="white" size={13} strokeWidth={3} />}
                            </View>
                            <View className="flex-1">
                              <Text className={`font-semibold text-sm ${active ? 'text-brand-700' : 'text-ink-800'}`}>{t.label}</Text>
                              <Text className="font-sans mt-0.5 text-[10px] text-ink-500">{t.desc}</Text>
                            </View>
                            <View className="items-end">
                              <Text className={`font-bold text-[11px] ${active ? 'text-brand-700' : 'text-ink-700'}`}>{formatRupiah(t.ratePerM2)}/m²</Text>
                              {active && !postRenoOverLimit && (
                                <Text className="font-medium text-[10px] text-brand-600">{formatRupiah(lineTotal)}</Text>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>
              )}
              {/* Tier Selector subscription - 4 tier: Basic/Standard/Premium/Ultimate.
                  Disembunyikan karena duplikat dgn section 'Pilih Paket' di step 1.
                  Customer udah pilih paket di sana, jangan disuruh pilih lagi di step 2.
                  Set false supaya logic hitung price tetep jalan tapi gak render. */}
              {false && isSubscription && (
                <Section title="Pilih Tier Langganan">
                  <View className="gap-2">
                    {effectiveSubscriptionTiers.map((t) => {
                      const active = subscriptionTier === t.code;
                      const tierPrice = Math.round(basePrice * t.multiplier);
                      return (
                        <Pressable
                          key={t.code}
                          onPress={() => setSubscriptionTier(t.code)}
                          className={`rounded-2xl border p-3 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                        >
                          <View className="flex-row items-start justify-between">
                            <View className="flex-1">
                              <View className="flex-row items-center gap-1.5">
                                <Text className="font-extrabold text-sm text-ink-900">{t.label}</Text>
                                {t.code === 'standard' && (
                                  <View className="rounded-full bg-emerald-100 px-2 py-0.5">
                                    <Text className="font-bold text-[9px] uppercase tracking-wider text-emerald-700">Populer</Text>
                                  </View>
                                )}
                                {t.code === 'ultimate' && (
                                  <View className="rounded-full bg-amber-100 px-2 py-0.5">
                                    <Text className="font-bold text-[9px] uppercase tracking-wider text-amber-700">Best Value</Text>
                                  </View>
                                )}
                              </View>
                              <Text className="font-medium text-[11px] text-ink-500">{t.tagline}</Text>
                            </View>
                            <View className="items-end">
                              <Text className={`font-extrabold text-sm ${active ? 'text-brand-700' : 'text-ink-900'}`}>{formatRupiah(tierPrice)}</Text>
                              <Text className="font-medium text-[10px] text-ink-500">/ kunjungan</Text>
                            </View>
                          </View>
                          {/* Scope list - tampilkan 2 item terutama + "+N lain" kalau gak active */}
                          <View className="mt-2 gap-0.5">
                            {(active ? t.scope : t.scope.slice(0, 2)).map((s, i) => (
                              <View key={i} className="flex-row gap-1.5">
                                <Text className="font-bold text-[11px] text-emerald-600">✓</Text>
                                <Text className="font-sans flex-1 text-[11px] text-ink-700">{s}</Text>
                              </View>
                            ))}
                            {!active && t.scope.length > 2 && (
                              <Text className="font-medium mt-0.5 text-[10px] text-brand-600">+{t.scope.length - 2} layanan lain · tap untuk lihat</Text>
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>
              )}
              {isSubscription && (
                <Section title="Pilih Tanggal Kunjungan">
                  {subscriptionVisits > 0 ? (
                    <>
                      {/* Progress header */}
                      <View className="mb-3 flex-row items-center justify-between rounded-2xl bg-gradient-to-r from-brand-50 to-emerald-50 p-3" style={{ backgroundColor: '#EFF6FF' }}>
                        <View className="flex-1">
                          <Text className="font-bold text-[12px] text-brand-900">Paket {subscriptionVisits}x kunjungan / bulan</Text>
                          <Text className="font-medium mt-0.5 text-[10px] text-brand-700">
                            Tap tanggal · gunakan ‹ › untuk pilih bulan depan
                          </Text>
                        </View>
                        <View className={`items-center rounded-xl px-3 py-1.5 ${subscriptionDates.length === subscriptionVisits ? 'bg-emerald-600' : 'bg-brand-600'}`}>
                          <Text className="font-extrabold text-lg text-white">{subscriptionDates.length}<Text className="font-medium text-[11px] text-white/80">/{subscriptionVisits}</Text></Text>
                        </View>
                      </View>

                      {/* Progress bar */}
                      <View className="mb-4 h-1.5 overflow-hidden rounded-full bg-ink-100">
                        <View
                          style={{ width: `${Math.min(100, (subscriptionDates.length / subscriptionVisits) * 100)}%`, backgroundColor: subscriptionDates.length === subscriptionVisits ? '#059669' : '#1D4ED8' }}
                          className="h-full rounded-full"
                        />
                      </View>

                      {/* Month navigator: bisa scroll ke 6 bulan ke depan.
                          Semua tanggal langganan harus tetap dalam 1 bulan kalender yang sama. */}
                      {(() => {
                        const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        const view = new Date(today.getFullYear(), today.getMonth() + subscriptionMonthOffset, 1);
                        const firstOfMonth = new Date(view.getFullYear(), view.getMonth(), 1);
                        const lastOfMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0);
                        const startOffset = firstOfMonth.getDay();
                        const cells: (Date | null)[] = [];
                        for (let i = 0; i < startOffset; i++) cells.push(null);
                        for (let d = 1; d <= lastOfMonth.getDate(); d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));

                        const sorted = [...subscriptionDates].sort();
                        const firstPicked = sorted[0] ?? null;
                        const pickedMonthKey = firstPicked ? firstPicked.slice(0, 7) : null;
                        function isOutsidePickedMonth(iso: string): boolean {
                          if (!pickedMonthKey) return false;
                          return iso.slice(0, 7) !== pickedMonthKey;
                        }

                        return (
                          <View>
                            <View className="mb-3 flex-row items-center justify-between rounded-xl border border-brand-200 bg-brand-50 p-2">
                              <Pressable
                                onPress={() => setSubscriptionMonthOffset(Math.max(0, subscriptionMonthOffset - 1))}
                                disabled={subscriptionMonthOffset === 0}
                                style={{ opacity: subscriptionMonthOffset === 0 ? 0.3 : 1 }}
                                className="h-9 w-12 flex-row items-center justify-center gap-1 rounded-lg bg-white"
                              >
                                <Text className="font-extrabold text-base text-brand-700">‹</Text>
                                <Text className="font-bold text-[10px] text-brand-700">Prev</Text>
                              </Pressable>
                              <View className="items-center">
                                <Text className="font-extrabold text-sm text-brand-900">{months[view.getMonth()]} {view.getFullYear()}</Text>
                                {subscriptionMonthOffset > 0 && (
                                  <Text className="font-medium text-[10px] text-brand-600">
                                    {subscriptionMonthOffset === 1 ? 'Bulan Depan' : `${subscriptionMonthOffset} Bulan ke Depan`}
                                  </Text>
                                )}
                              </View>
                              <Pressable
                                onPress={() => setSubscriptionMonthOffset(Math.min(5, subscriptionMonthOffset + 1))}
                                disabled={subscriptionMonthOffset === 5}
                                style={{ opacity: subscriptionMonthOffset === 5 ? 0.3 : 1 }}
                                className="h-9 w-12 flex-row items-center justify-center gap-1 rounded-lg bg-white"
                              >
                                <Text className="font-bold text-[10px] text-brand-700">Next</Text>
                                <Text className="font-extrabold text-base text-brand-700">›</Text>
                              </Pressable>
                            </View>

                            {/* Day-of-week header */}
                            <View className="flex-row">
                              {days.map((dn) => (
                                <View key={dn} className="flex-1 items-center py-1.5">
                                  <Text className={`font-bold text-[10px] uppercase tracking-wider ${dn === 'Min' ? 'text-red-500' : 'text-ink-400'}`}>{dn}</Text>
                                </View>
                              ))}
                            </View>

                            {/* Date cells */}
                            <View className="flex-row flex-wrap">
                              {cells.map((d, i) => {
                                if (!d) return <View key={`empty-${i}`} style={{ width: `${100 / 7}%` }} className="p-0.5" />;
                                const dNorm = new Date(d); dNorm.setHours(0, 0, 0, 0);
                                const iso = dNorm.toISOString().slice(0, 10);
                                const isPast = dNorm.getTime() < today.getTime();
                                const active = subscriptionDates.includes(iso);
                                const reachedLimit = subscriptionDates.length >= subscriptionVisits && !active;
                                const outsidePickedMonth = !active && isOutsidePickedMonth(iso);
                                const disabled = isPast || reachedLimit || outsidePickedMonth;
                                const isSunday = d.getDay() === 0;
                                return (
                                  <View key={iso} style={{ width: `${100 / 7}%` }} className="p-0.5">
                                    <Pressable
                                      disabled={disabled}
                                      onPress={() => setSubscriptionDates(active
                                        ? subscriptionDates.filter((x) => x !== iso)
                                        : [...subscriptionDates, iso].sort())}
                                      style={disabled ? { opacity: isPast ? 0.2 : outsidePickedMonth ? 0.25 : 0.3 } : undefined}
                                      className={`aspect-square items-center justify-center rounded-xl ${active
                                        ? 'bg-brand-600'
                                        : disabled
                                          ? 'bg-ink-100'
                                          : 'bg-ink-50'}`}
                                    >
                                      <Text className={`font-extrabold text-sm ${active ? 'text-white' : isSunday ? 'text-red-500' : 'text-ink-900'}`}>
                                        {d.getDate()}
                                      </Text>
                                    </Pressable>
                                  </View>
                                );
                              })}
                            </View>

                            {firstPicked && (
                              <Text className="font-medium mt-2 text-[10px] text-ink-500">
                                Semua kunjungan harus berada dalam bulan yang sama. Sudah pilih {sorted.length > 1 ? `${sorted[0]} → ${sorted[sorted.length - 1]}` : sorted[0]}
                              </Text>
                            )}
                          </View>
                        );
                      })()}

                      {/* Status footer */}
                      <View className={`flex-row items-center gap-2 rounded-xl p-3 ${subscriptionDates.length === subscriptionVisits ? 'border border-emerald-300 bg-emerald-50' : 'border border-amber-300 bg-amber-50'}`}>
                        {subscriptionDates.length === subscriptionVisits ? (
                          <>
                            <Check color="#059669" size={16} strokeWidth={3} />
                            <Text className="font-bold flex-1 text-[12px] text-emerald-900">
                              Mantap! {subscriptionVisits} tanggal kunjungan terpilih
                            </Text>
                          </>
                        ) : (
                          <>
                            <AlertTriangle color="#B45309" size={16} />
                            <Text className="font-bold flex-1 text-[12px] text-amber-900">
                              Pilih {subscriptionVisits - subscriptionDates.length} tanggal lagi untuk lanjut
                            </Text>
                          </>
                        )}
                      </View>
                    </>
                  ) : (
                    <View className="items-center rounded-xl border border-dashed border-ink-300 bg-ink-50 py-8">
                      <Text className="font-medium text-[12px] text-ink-500">Pilih paket dulu di step sebelumnya</Text>
                    </View>
                  )}
                  <View className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <Text className="font-bold text-[11px] text-blue-900">ℹ Scope di luar paket = layanan tambahan</Text>
                    <Text className="font-medium mt-1 text-[11px] leading-4 text-blue-900">
                      Kalau ada permintaan di luar batasan paket (area lebih luas, deep clean kerak, cuci kasur/sofa, dll), cleaner kirim charge tambahan via app sebelum kerja. Kamu bisa Setujui / Tolak.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push({ pathname: '/booking/wa-survey', params: { category: categoryCode } })}
                    className="mt-2 flex-row items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3"
                  >
                    <MessageCircle color="#047857" size={14} strokeWidth={2.4} />
                    <Text className="font-bold text-[11px] text-emerald-800">
                      Butuh lebih dari 10x / bulan? Chat WA Admin
                    </Text>
                  </Pressable>
                </Section>
              )}
              {!isPostReno && !isSubscription && (
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
                <Label className="mt-4">Foto Kondisi (opsional, max {MAX_PHOTOS})</Label>
                <View className="flex-row flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <View key={i} className="relative h-20 w-20">
                      <RNImage source={{ uri: p.uri }} style={{ width: 80, height: 80, borderRadius: 12 }} />
                      <Pressable
                        onPress={() => removePhoto(i)}
                        className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-red-600"
                      >
                        <Text className="font-bold text-[10px] text-white">×</Text>
                      </Pressable>
                    </View>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <Pressable
                      onPress={showPhotoPicker}
                      disabled={photoUploading}
                      className="h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-brand-300 bg-brand-50"
                    >
                      <Camera color="#1D4ED8" size={20} strokeWidth={2.2} />
                      <Text className="font-medium mt-1 text-[10px] text-brand-700">
                        {photoUploading ? '...' : '+ Tambah'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Text className="font-sans mt-2 text-[10px] text-ink-500">
                  JPG / PNG / WEBP · auto compress {`<5MB`}
                </Text>

                {!isVacuum && <Label className="mt-4">Jenis Kotoran (pilih beberapa)</Label>}
                {!isVacuum && <Text className="font-medium -mt-1 mb-2 text-[11px] text-ink-500">
                  Pilih semua yang sesuai biar cleaner siap bawa alat & cairan yang tepat.
                </Text>}
                {!isVacuum && <View className="gap-1.5">
                  {DIRT_CHARACTERS.map((c) => {
                    const active = dirtChars.has(c);
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setDirtChars(toggleSet(dirtChars, c))}
                        className={`flex-row items-center gap-3 rounded-xl border px-3 py-2.5 ${
                          active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                        }`}
                      >
                        <View
                          className={`h-5 w-5 items-center justify-center rounded border-2 ${
                            active ? 'border-brand-600 bg-brand-600' : 'border-ink-300 bg-white'
                          }`}
                        >
                          {active && <Check color="white" size={13} strokeWidth={3} />}
                        </View>
                        <Text className={`font-semibold text-sm ${active ? 'text-brand-700' : 'text-ink-800'}`}>
                          {c}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>}
              </Section>
              )}

              {isLargeScale && (
                <Section title="Detail Skala Besar">
                  {largeScaleOverLimit && (
                    <View className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                      <Text className="font-bold text-xs text-amber-900">Luas {'>'} 500 m² - perlu survei langsung</Text>
                      <Text className="font-medium mt-1 text-[11px] text-amber-800">
                        Estimasi otomatis di-skip. Tombol "Lanjut" otomatis arahin ke Chat WA untuk Quote - tim kami hitung berdasarkan survei.
                      </Text>
                      <Pressable
                        onPress={() => router.push({ pathname: '/booking/wa-survey', params: { category: categoryCode } })}
                        className="mt-3 self-start rounded-full bg-amber-600 px-4 py-2"
                      >
                        <Text className="font-bold text-xs text-white">Chat WA Sekarang</Text>
                      </Pressable>
                    </View>
                  )}
                  <View className="flex-row items-center justify-between">
                    <Label className="mb-0">Jumlah Kamar Mandi / Toilet</Label>
                    <Stepper value={bathrooms} onChange={setBathrooms} min={0} max={50} />
                  </View>
                  {!largeScaleOverLimit && bathrooms > 0 && (
                    <Text className="font-medium mt-1 text-[10px] text-ink-500">
                      {bathrooms} x {formatRupiah(LARGE_SCALE_BATHROOM_RATE)} = {formatRupiah(bathrooms * LARGE_SCALE_BATHROOM_RATE)}
                    </Text>
                  )}
                  <Label className="mt-4">Apa Yang Mau Dibersihin (pilih beberapa)</Label>
                  <Text className="font-medium -mt-1 mb-2 text-[11px] text-ink-500">
                    {largeScaleOverLimit
                      ? 'Centang scope - harga final dari hasil survei.'
                      : `Centang area yg masuk scope. Harga = rate per m² x luas (${areaM2} m²).`}
                  </Text>
                  <View className="gap-1.5">
                    {LARGE_SCALE_TARGETS.map((t) => {
                      const active = largeScaleTargets.has(t.code);
                      const lineTotal = t.ratePerM2 * areaM2;
                      return (
                        <Pressable
                          key={t.code}
                          onPress={() => setLargeScaleTargets(toggleSet(largeScaleTargets, t.code))}
                          className={`rounded-xl border px-3 py-2.5 ${
                            active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                          }`}
                        >
                          <View className="flex-row items-center gap-3">
                            <View
                              className={`h-5 w-5 items-center justify-center rounded border-2 ${
                                active ? 'border-brand-600 bg-brand-600' : 'border-ink-300 bg-white'
                              }`}
                            >
                              {active && <Check color="white" size={13} strokeWidth={3} />}
                            </View>
                            <View className="flex-1">
                              <Text className={`font-semibold text-sm ${active ? 'text-brand-700' : 'text-ink-800'}`}>
                                {t.label}
                              </Text>
                              <Text className="font-sans mt-0.5 text-[10px] text-ink-500">{t.desc}</Text>
                            </View>
                            <View className="items-end">
                              <Text className={`font-bold text-[11px] ${active ? 'text-brand-700' : 'text-ink-700'}`}>
                                {formatRupiah(t.ratePerM2)}/m²
                              </Text>
                              {active && !largeScaleOverLimit && (
                                <Text className="font-medium text-[10px] text-brand-600">{formatRupiah(lineTotal)}</Text>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </Section>
              )}

              {!isLargeScale && !isPerMeter && !isPostReno && !isVacuum && !isSubscription && <Section title="Kondisi Ruangan">
                <Label>Jenis Lantai</Label>
                <Dropdown
                  options={FLOOR_TYPES as readonly string[]}
                  value={floorType}
                  onChange={setFloorType}
                  placeholder="Pilih jenis lantai"
                />

                <Label className="mt-4">Kepadatan Barang</Label>
                <Text className="font-medium -mt-1 mb-2 text-[11px] text-ink-500">
                  Seberapa penuh ruangan dengan furniture & barang?
                </Text>
                <View className="flex-row gap-2">
                  {(FURNITURE_DENSITY as readonly string[]).map((opt) => {
                    const active = furniture === opt;
                    const desc = opt === 'Sedikit' ? 'Lega, mudah dibersihkan'
                      : opt === 'Sedang' ? 'Normal, ada beberapa furniture'
                      : 'Penuh, banyak barang';
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setFurniture(opt as FurnitureDensity)}
                        className={`flex-1 items-center rounded-xl border py-2.5 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                      >
                        <Text className={`font-bold text-xs ${active ? 'text-brand-700' : 'text-ink-900'}`}>{opt}</Text>
                        <Text className={`mt-0.5 text-center text-[9px] leading-3 ${active ? 'text-brand-600' : 'text-ink-500'}`} numberOfLines={2}>
                          {desc}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Label className="mt-5">Fasilitas Tersedia di Lokasi</Label>
                <View className="mt-1 gap-2">
                  <ToggleRow
                    label="Ada keran air"
                    value={hasWater}
                    onChange={setHasWater}
                  />
                  <ToggleRow
                    label="Ada colokan listrik (untuk vacuum)"
                    value={hasElectricity}
                    onChange={setHasElectricity}
                  />
                  <ToggleRow
                    label="Ada hewan peliharaan di rumah"
                    value={hasPet}
                    onChange={setHasPet}
                  />
                </View>
                {hasPet && (
                  <TextInput
                    value={petNote}
                    onChangeText={setPetNote}
                    placeholder="Tipe & jumlah (contoh: 2 kucing, 1 anjing kecil)"
                    placeholderTextColor="#94A3B8"
                    className="font-sans mt-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm"
                  />
                )}
              </Section>}

              <Section title="Add-on (Opsional)">
                {isSubscription && subscriptionVisits > 0 && (
                  <View className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <Text className="font-bold text-[11px] text-blue-900">ℹ Add-on dihitung per kunjungan</Text>
                    <Text className="font-medium mt-1 text-[11px] leading-4 text-blue-900">
                      Harga add-on otomatis dikali {subscriptionVisits}x sesuai paket (1 add-on jalan di tiap kunjungan).
                    </Text>
                  </View>
                )}
                <View className="gap-2">
                  {ADDONS.map((a) => {
                    const active = selectedAddons.has(a.code);
                    const lineTotal = isSubscription && subscriptionVisits > 0 ? a.price * subscriptionVisits : a.price;
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
                            {isSubscription && subscriptionVisits > 0 && (
                              <Text className="font-bold text-[10px] text-ink-500"> x {subscriptionVisits} = {formatRupiah(lineTotal)}</Text>
                            )}
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
                <Pressable
                  onPress={() => setSchedModalOpen(true)}
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
                    <Pressable onPress={() => { setUseNewLocation(true); setCoords(null); }} className="mt-3 self-start">
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
                        onPress={() => {
                          setUseNewLocation(false);
                          if (selectedAddress) {
                            setAddress(selectedAddress.addressLine);
                            setCoords({ lat: selectedAddress.lat, lng: selectedAddress.lng });
                            setAddressError(null);
                          }
                        }}
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

              {!isSimpleService && <Section title="Upgrade Deep Cleaning (Opsional)">
                <Pressable
                  onPress={() => setCleaningMode(cleanMode === 'deep' ? 'general' : 'deep')}
                  className={`flex-row items-start gap-3 rounded-xl border p-3 ${
                    cleanMode === 'deep' ? 'border-emerald-600 bg-emerald-50' : 'border-ink-200 bg-white'
                  }`}
                >
                  <View
                    className={`mt-0.5 h-5 w-5 items-center justify-center rounded border-2 ${
                      cleanMode === 'deep' ? 'border-emerald-600 bg-emerald-600' : 'border-ink-300 bg-white'
                    }`}
                  >
                    {cleanMode === 'deep' && <Check color="white" size={14} strokeWidth={3} />}
                  </View>
                  <View className="flex-1">
                    <Text className={`font-bold text-sm ${cleanMode === 'deep' ? 'text-emerald-700' : 'text-ink-900'}`}>
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
              </Section>}

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
                  {overtimeQuote.surcharge > 0 && (
                    <Row label={`Biaya lembur malam (${overtimeQuote.overtimeHours} jam)`} value={formatRupiah(overtimeQuote.surcharge)} />
                  )}
                  {travelQuote && travelQuote.enabled && (
                    <Row
                      label={`Transport (${travelQuote.distanceKm.toFixed(1)} km${travelQuote.distanceKm <= travelQuote.freeKm ? ' · gratis' : ''})`}
                      value={travelQuote.travelFee > 0 ? formatRupiah(travelQuote.travelFee) : 'Gratis'}
                    />
                  )}
                  {travelErr && (
                    <Text className="font-medium mt-1 text-[10px] text-amber-700">{travelErr}</Text>
                  )}
                  <View className="mt-2 border-t border-ink-100 pt-2">
                    <Row label="Total" value={formatRupiah(total + (travelQuote?.travelFee ?? 0))} bold />
                  </View>
                </View>
                {overtimeQuote.surcharge > 0 && (
                  <View className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <Text className="font-medium text-[10px] text-amber-800">
                      Estimasi selesai {formatEndTime(overtimeQuote.estimatedEnd)}. Waktu lewat 21:00 dikenakan biaya lembur Rp 50.000 per jam.
                    </Text>
                  </View>
                )}
                {walletBalance > 0 && (() => {
                  const creditUsed = useCredit ? Math.min(walletBalance, total) : 0;
                  const afterCredit = total - creditUsed;
                  return (
                    <View className="mt-3">
                      <Pressable
                        onPress={() => setUseCredit(!useCredit)}
                        className={`flex-row items-center gap-3 rounded-xl border p-3 ${useCredit ? 'border-emerald-400 bg-emerald-50' : 'border-ink-200 bg-white'}`}
                      >
                        <View className={`h-5 w-5 items-center justify-center rounded-md border-2 ${useCredit ? 'border-emerald-600 bg-emerald-600' : 'border-ink-300 bg-white'}`}>
                          {useCredit && <Text className="font-bold text-white text-[10px]">✓</Text>}
                        </View>
                        <View className="flex-1">
                          <Text className="font-bold text-xs text-ink-900">Pakai Saldo ({formatRupiah(walletBalance)})</Text>
                          <Text className="text-[10px] text-ink-500 mt-0.5">
                            {useCredit ? `Potong saldo ${formatRupiah(creditUsed)}, sisanya ${formatRupiah(afterCredit)} bayar via bank/QRIS` : 'Tap untuk pakai saldo sebagai potongan'}
                          </Text>
                        </View>
                      </Pressable>
                      {useCredit && (
                        <View className="mt-2 rounded-xl bg-ink-50 px-3 py-2">
                          <View className="flex-row justify-between">
                            <Text className="text-[11px] text-ink-600">Potongan saldo</Text>
                            <Text className="text-[11px] font-semibold text-emerald-600">−{formatRupiah(creditUsed)}</Text>
                          </View>
                          <View className="flex-row justify-between border-t border-ink-200 pt-1 mt-1">
                            <Text className="text-[11px] font-bold text-ink-900">Bayar via bank/QRIS</Text>
                            <Text className="text-sm font-bold text-brand-700">{formatRupiah(afterCredit)}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            </>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white" style={{ elevation: 8 }}>
          <SafeAreaView edges={['bottom']}>
            {isSimpleService && (
              <Pressable
                onPress={() => setCleaningMode(cleanMode === 'deep' ? 'general' : 'deep')}
                className={`border-b border-ink-100 px-4 py-3 ${
                  cleanMode === 'deep' ? 'bg-emerald-50' : ''
                }`}
              >
                {/* Row 1: checkbox + judul + badge + harga */}
                <View className="flex-row items-center gap-3">
                  <View
                    className={`h-5 w-5 items-center justify-center rounded border-2 ${
                      cleanMode === 'deep' ? 'border-emerald-600 bg-emerald-600' : 'border-ink-300 bg-white'
                    }`}
                  >
                    {cleanMode === 'deep' && <Check color="white" size={14} strokeWidth={3} />}
                  </View>
                  <Text className={`font-extrabold text-[13px] ${cleanMode === 'deep' ? 'text-emerald-800' : 'text-ink-900'}`}>
                    Deep Cleaning
                  </Text>
                  <View className="rounded bg-amber-200 px-1.5 py-0.5">
                    <Text className="font-extrabold text-[8px] text-amber-900">RECOMMENDED</Text>
                  </View>
                  {pkg && (
                    <Text className="font-bold ml-auto text-[12px] text-amber-800">
                      +{formatRupiah(Math.round((pkg.price * (deepMultiplier - 1)) / 1000) * 1000)}
                    </Text>
                  )}
                </View>
                {/* Row 2: deskripsi full width, gak kepotong */}
                <Text className="font-medium mt-1.5 text-[11px] leading-[16px] text-ink-600">
                  Bersih sampai detail: kerak kamar mandi, jamur nat, noda membandel, sela furnitur, bekas renovasi. Pakai cairan khusus.
                </Text>
              </Pressable>
            )}
            {(pkg || isLargeScale || isPostReno) && !needsWaConsultation && (() => {
              const grand = total + (travelQuote?.travelFee ?? 0);
              const creditUsed = useCredit ? Math.min(walletBalance, grand) : 0;
              const payable = grand - creditUsed;
              return (
              <View className="flex-row items-center justify-between border-b border-ink-100 px-4 py-3">
                <View className="flex-1 pr-2">
                  <Text className="font-sans text-[10px] uppercase tracking-wider text-ink-500">
                    {step === TOTAL_STEPS ? (useCredit && creditUsed > 0 ? 'Bayar via bank/QRIS' : 'Total Bayar') : 'Estimasi Total'}
                  </Text>
                  <Text className="font-extrabold mt-0.5 text-lg text-brand-700">{formatRupiah(payable)}</Text>
                  {useCredit && creditUsed > 0 ? (
                    <Text className="font-medium mt-0.5 text-[10px] text-emerald-700">
                      Saldo dipakai −{formatRupiah(creditUsed)} dari {formatRupiah(grand)}
                    </Text>
                  ) : null}
                </View>
                {step !== TOTAL_STEPS && (
                  <Text className="font-medium max-w-[40%] text-right text-[9px] text-ink-400">
                    Bisa berubah saat tambah pilihan
                  </Text>
                )}
              </View>
              );
            })()}
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
              {needsWaConsultation ? (
                <Pressable
                  onPress={() => router.push({
                    pathname: '/booking/wa-survey',
                    params: {
                      category: categoryCode,
                      workers: String(workers),
                      areaM2: String(areaM2),
                      propertyType,
                      bedrooms: String(bedrooms),
                      bathrooms: String(bathrooms),
                    },
                  })}
                  className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-success"
                >
                  <MessageCircle color="white" size={18} fill="white" strokeWidth={0} />
                  <Text className="font-bold text-sm text-white" numberOfLines={1}>
                    Chat WA untuk Quote
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={next}
                  disabled={(step === 1 && !pkg && !isLargeScale && !isPostReno) || submitting}
                  className={`h-12 flex-1 items-center justify-center rounded-2xl ${(step === 1 && !pkg && !isLargeScale && !isPostReno) || submitting ? 'bg-ink-300' : 'bg-brand-600'}`}
                >
                  <Text className="font-bold text-sm text-white" numberOfLines={1}>
                    {submitting
                      ? 'Memproses…'
                      : (step === 1 && !pkg && !isLargeScale && !isPostReno)
                        ? 'Memuat...'
                        : step === TOTAL_STEPS
                          ? `Buat Pesanan · ${formatRupiah(Math.max(0, total + (travelQuote?.travelFee ?? 0) - (useCredit ? Math.min(walletBalance, total + (travelQuote?.travelFee ?? 0)) : 0)))}`
                          : 'Lanjut'}
                  </Text>
                </Pressable>
              )}
            </View>
          </SafeAreaView>
        </View>

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


// Web-only schedule picker - uses native HTML <input type="date|time"> via
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
    // @ts-expect-error - host elements work in react-native-web
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

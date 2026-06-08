import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Bath, Bed, Camera, ChefHat, Minus, Plus, Sofa, Trees, UtensilsCrossed, Warehouse, Wind, Square, Droplets, Layers, Brush } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image as RNImage, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressField } from '../../src/components/AddressField';
import { AddressPickerInline } from '../../src/components/AddressPicker';
import { ScheduleModal } from '../../src/components/ScheduleModal';
import { useAddressesStore } from '../../src/stores/addresses';
import { useApiAddons, useApiServices, useAppContent } from '../../src/stores/appContent';
import { useBookingsStore } from '../../src/stores/bookings';
import { useLocationStore } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { formatRupiah } from '../../src/data/catalog';
import { safeBack } from '../../src/lib/safeBack';

type Item = { key: string; label: string; price: number; icon: any; durationMin: number; unit?: string };

// Fallback icon resolver - pick icon by code substring.
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

  // Skip services yang tabrakan / kombo (kamar+toilet = kombo dari kamar & toilet)
  // dan service per-meter (ruko/kantor/apartemen) - itu butuh flow sendiri.
  const EXCLUDED_SERVICE_CODES = new Set([
    'kamar_km_dalam',  // kombo, sudah ada Kamar Tidur + Toilet terpisah
    'ruko', 'kantor', 'apartemen', // per-meter, gak fit qty-based selector
    'full_house', 'paket_bundle', 'subscription', 'general_cleaning', 'deep_cleaning',
    'kos', 'konsultasi', 'pasca_renovasi',
  ]);

  // ROOMS = services atomic (per ruangan), bukan kombo & bukan per-meter.
  const ROOMS: Item[] = useMemo(() => services
    .filter((s: any) => !EXCLUDED_SERVICE_CODES.has(String(s.code ?? '')))
    .map((s: any) => {
      const pkg = allPackages.find((p: any) => p.serviceId === s.id);
      // Skip kalau package per-meter
      if (pkg?.scope && typeof pkg.scope === 'object' && (pkg.scope as any).perMeter) return null;
      return {
        key: s.code ?? s.id,
        label: s.name,
        price: Number(pkg?.price ?? 0),
        icon: iconFor(String(s.code ?? '')),
        durationMin: Number(pkg?.durationMin ?? 60),
      };
    })
    .filter((r): r is Item => r !== null && r.price > 0), [services, allPackages]);

  // Add-ons yang punya unit khusus (per m², per panel, per lubang, dll) gak masuk EXTRAS
  // karena rancu kalau dikalikan qty bulat (user gak bisa pilih "0.5 m²").
  // Add-on per-pcs / per-unit / per-dudukan tetap masuk.
  const isSpecialUnit = (desc: string | null | undefined) => {
    const d = (desc ?? '').toLowerCase();
    return d.includes('per m²') || d.includes('/m²') || d.includes('per panel') || d.includes('per lubang') || d.includes('per daun');
  };
  const EXTRAS: Item[] = useMemo(() => apiAddons
    .filter((a: any) => !isSpecialUnit(a.description))
    .map((a: any) => ({
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
  // "Sekarang" mode = pakai jam tercepat exact (sekarang+1h dengan menit asli)
  const [useNowTime, setUseNowTime] = useState(false);

  // Modal handle validasi jam operasional + bump otomatis.
  const [notes, setNotes] = useState('');
  const [emptyHouse, setEmptyHouse] = useState(false);
  const [schedModalOpen, setSchedModalOpen] = useState(false);
  const [photos, setPhotos] = useState<{ uri: string; url: string }[]>([]); // foto before (full house)
  const [photoUploading, setPhotoUploading] = useState(false);

  function showPhotoPicker() {
    if (Platform.OS === 'web') { void pickPhoto('library'); return; }
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
      const { launchImageLibraryAsync, launchCameraAsync, MediaTypeOptions,
        requestCameraPermissionsAsync, requestMediaLibraryPermissionsAsync } = ImagePicker;
      if (source === 'camera') {
        const perm = await requestCameraPermissionsAsync();
        if (!perm.granted) { toast.warning('Izin kamera ditolak'); return; }
      } else {
        const perm = await requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { toast.warning('Izin galeri ditolak'); return; }
      }
      const r = source === 'camera'
        ? await launchCameraAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.9 })
        : await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.9 });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      setPhotoUploading(true);
      const { compressImage } = await import('../../src/lib/imageCompress');
      const c = await compressImage(asset.uri);
      const { api } = await import('../../src/lib/api');
      const presign = await api.post('/bookings/condition-photo-upload-url', { contentType: 'image/jpeg' });
      const { uploadUrl, publicUrl } = presign.data?.data ?? presign.data;
      const blob = await (await fetch(c.uri)).blob();
      const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!up.ok) throw new Error('Upload gagal');
      setPhotos((p) => [...p, { uri: c.uri, url: publicUrl }]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal upload foto');
    } finally {
      setPhotoUploading(false);
    }
  }
  const [submitting, setSubmitting] = useState(false);

  const EMPTY_HOUSE_DISC = 0.20;

  const scheduleAt = useMemo(() => {
    if (useNowTime && dateIdx === 0) {
      // Exact earliest: sekarang + 1 jam, tapi clamp ke jam operasional 07:00-20:00
      const nowPlus1h = new Date(Date.now() + 60 * 60 * 1000);
      if (nowPlus1h.getHours() < 7) { nowPlus1h.setHours(7, 0, 0, 0); }
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

    // Coverage gate — cek alamat booking dalam area layanan
    const { checkCoverage } = await import('../../src/lib/coverage');
    const { useLocationStore } = await import('../../src/stores/location');
    const { useAppContent } = await import('../../src/stores/appContent');
    const selectedAddress = addressList.find((a) => a.id === selectedAddressId);
    const userLoc = useLocationStore.getState().current;
    const areas = useAppContent.getState().content.serviceAreas;
    const checkLoc =
      selectedAddress && Number.isFinite(selectedAddress.lat) && Number.isFinite(selectedAddress.lng)
        ? { lat: selectedAddress.lat, lng: selectedAddress.lng }
        : userLoc ? { lat: userLoc.lat, lng: userLoc.lng } : null;
    const cov = checkCoverage(checkLoc, areas);
    if (!cov.covered) {
      router.push({
        pathname: '/city-request',
        params: { city: userLoc?.shortLabel ?? cov.nearestAreaName ?? '' },
      });
      return;
    }

    setSubmitting(true);
    const items = allItems.filter((r) => (counts[r.key] ?? 0) > 0).map((r) => ({
      key: r.key, label: r.label, qty: counts[r.key]!, pricePerUnit: r.price, subtotal: counts[r.key]! * r.price,
    }));
    const labelSummary = items.map((i) => `${i.qty}× ${i.label}`).join(', ');
    try {
      // Pakai home.cta_image_url (config admin) sebagai icon Layanan Custom
      const ctaImage = useAppContent.getState().content.config['home.cta_image_url' as keyof typeof useAppContent.prototype.content.config] as unknown as string | undefined;
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
        formSnapshot: { mode: 'custom', items, totalMin, notes, emptyHouse, emptyHouseDiscount: discount, beforePhotos: photos.map((p) => p.url) },
        initialStatus: 'pending_payment',
      } as any);
      toast.success('Pesanan custom dibuat - silakan bayar');
      try {
        const { Track } = await import('../../src/lib/analytics');
        Track.bookingCreated(booking.id, total, 'custom');
      } catch {}
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

          {/* Foto Before - kondisi awal full house */}
          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-semibold mb-2 text-[11px] uppercase tracking-wider text-ink-500">
              Foto Kondisi (Opsional, max 3)
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {photos.map((p, i) => (
                <View key={i} className="relative h-20 w-20">
                  <RNImage source={{ uri: p.uri }} style={{ width: 80, height: 80, borderRadius: 12 }} />
                  <Pressable
                    onPress={() => setPhotos((arr) => arr.filter((_, idx) => idx !== i))}
                    className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-red-600"
                  >
                    <Text className="font-bold text-[10px] text-white">×</Text>
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
                  <Text className="font-medium mt-1 text-[10px] text-brand-700">
                    {photoUploading ? '...' : '+ Tambah'}
                  </Text>
                </Pressable>
              )}
            </View>
            <Text className="font-sans mt-2 text-[10px] text-ink-500">
              JPG / PNG / WEBP · auto compress {`<5MB`}
            </Text>
          </View>

          {/* Tap card → buka modal Pilih Jadwal */}
          <Pressable
            onPress={() => setSchedModalOpen(true)}
            className="mx-4 mt-3 flex-row items-center justify-between rounded-2xl bg-white p-4"
          >
            <View>
              <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">Pilih Tanggal & Jam</Text>
              <Text className="font-bold mt-0.5 text-sm text-ink-900">
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

      <ScheduleModal
        visible={schedModalOpen}
        value={scheduleAt}
        onChange={(d) => {
          setUseNowTime(false);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const dd = new Date(d); dd.setHours(0, 0, 0, 0);
          setDateIdx(Math.max(0, Math.min(13, Math.round((dd.getTime() - today.getTime()) / 86400000))));
          setTimeSlot(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
          setSchedModalOpen(false);
        }}
        onClose={() => setSchedModalOpen(false)}
      />
    </>
  );
}

export default withAuth(CustomBooking);

import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Briefcase, Calendar, ChevronRight, MapPin, RefreshCw, Settings } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICE_CATEGORIES, formatRupiah } from '../../src/data/catalog';
import { useBookingsStore } from '../../src/stores/bookings';
import { useCleanerStore } from '../../src/stores/cleaner';
import { calculateCleanerShare, calculateCleanerEarning } from '../../src/stores/cleanerWallet';
import { toast } from '../../src/stores/ui';

export default function Jobs() {
  const router = useRouter();
  const list = useBookingsStore((s) => s.list);
  const create = useBookingsStore((s) => s.create);
  const areas = useCleanerStore((s) => s.serviceAreas);
  const cleanerName = useCleanerStore((s) => s.name);
  const bringsTools = useCleanerStore((s) => s.bringsTools);
  const setBringsTools = useCleanerStore((s) => s.setBringsTools);

  const available = list.filter((b) => {
    if (b.status !== 'searching') return false;
    if (areas.length === 0) return true;
    return areas.some((a) => b.addressLine.toLowerCase().includes(a.toLowerCase()));
  });

  // Job aktif yang sudah di-accept cleaner ini & belum selesai
  const activeJobs = list.filter(
    (b) =>
      b.cleanerName === cleanerName &&
      (b.status === 'matched' || b.status === 'on_the_way' || b.status === 'in_progress'),
  );

  // Bookings yang searching tapi gak match area cleaner — buat info "ada job di area lain"
  const searchingOutOfArea = list.filter(
    (b) =>
      b.status === 'searching' &&
      areas.length > 0 &&
      !areas.some((a) => b.addressLine.toLowerCase().includes(a.toLowerCase())),
  ).length;

  function injectSampleJob() {
    const cat = SERVICE_CATEGORIES[Math.floor(Math.random() * SERVICE_CATEGORIES.length)];
    if (!cat) return;
    const sampleAreas = areas.length > 0 ? areas : ['Yogyakarta'];
    const targetArea = sampleAreas[Math.floor(Math.random() * sampleAreas.length)] ?? 'Yogyakarta';
    const sampleAddrs = [
      `Jl. Malioboro No. 12, ${targetArea}`,
      `Jl. Kaliurang Km 5, ${targetArea}`,
      `Apartemen Sahid Tower lt. 8, ${targetArea}`,
      `Komplek Cluster Permata B-15, ${targetArea}`,
    ];
    const addr = sampleAddrs[Math.floor(Math.random() * sampleAddrs.length)] ?? sampleAddrs[0]!;
    create({
      pricingMode: 'package',
      categoryCode: cat.code,
      categoryName: cat.name,
      categoryImage: cat.imageUrl,
      packageName: 'Sample Job',
      addressLine: addr,
      scheduledAt: 'Hari ini 14:00',
      addOns: [],
      basePrice: cat.startingPrice || 150_000,
      dirtSurcharge: 0,
      totalPrice: cat.startingPrice || 150_000,
      initialStatus: 'searching',
    });
    toast.success('Sample job dibuat');
  }

  function accept(id: string) {
    useBookingsStore.setState({
      list: useBookingsStore.getState().list.map((b) =>
        b.id === id ? { ...b, cleanerName, status: 'matched' as const } : b,
      ),
    });
    toast.success('Job berhasil diambil! Cek tab Order.');
    router.push({ pathname: '/booking/[id]', params: { id } });
  }

  return (
    <View className="flex-1 bg-ink-50">
      <SafeAreaView edges={['top']} className="bg-white">
        <View className="border-b border-ink-100 px-4 pb-3 pt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-bold text-xl text-ink-900">Job Board</Text>
              <Text className="font-sans mt-0.5 text-xs text-ink-500">
                {available.length} job tersedia
                {areas.length > 0 ? ` di ${areas.length} area` : ' (semua area)'}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/cleaner/areas')}
              className="flex-row items-center gap-1 rounded-full bg-brand-50 px-3 py-2"
            >
              <Settings color="#1D4ED8" size={14} strokeWidth={2.4} />
              <Text className="font-semibold text-xs text-brand-700">Area</Text>
            </Pressable>
          </View>

          {/* Bawa Alat toggle */}
          <Pressable
            onPress={() => {
              setBringsTools(!bringsTools);
              toast.success(
                bringsTools
                  ? 'Mode Tanpa Alat (komisi 40%)'
                  : 'Mode Bawa Alat (komisi 50–60% tergantung order)',
              );
            }}
            className={`mt-3 flex-row items-center gap-2 rounded-xl border p-2.5 ${
              bringsTools ? 'border-success bg-emerald-50' : 'border-ink-200 bg-white'
            }`}
          >
            <View
              className={`h-9 w-9 items-center justify-center rounded-xl ${
                bringsTools ? 'bg-success' : 'bg-ink-200'
              }`}
            >
              <Briefcase color="white" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-xs text-ink-900">
                {bringsTools ? 'Bawa Alat Sendiri' : 'Tanpa Alat'}
              </Text>
              <Text className="font-medium text-[10px] text-ink-500">
                {bringsTools
                  ? 'Komisi: <300K=60% · 300-600K=55% · >600K=50%'
                  : 'Komisi flat 40% — tap untuk aktifkan Bawa Alat'}
              </Text>
            </View>
            <View
              className={`h-6 w-11 rounded-full p-0.5 ${
                bringsTools ? 'bg-success' : 'bg-ink-300'
              }`}
            >
              <View
                className={`h-5 w-5 rounded-full bg-white ${
                  bringsTools ? 'self-end' : 'self-start'
                }`}
              />
            </View>
          </Pressable>
        </View>
      </SafeAreaView>

      {areas.length === 0 && (
        <View className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <Text className="font-semibold text-xs text-amber-900">
            ⚠️ Kamu belum set area layanan
          </Text>
          <Text className="font-sans mt-1 text-[11px] text-amber-900">
            Set area dulu agar hanya dapat job di kota yang kamu sanggup. Sementara semua job ditampilkan.
          </Text>
          <Pressable
            onPress={() => router.push('/cleaner/areas')}
            className="mt-2 self-start rounded-lg bg-amber-600 px-3 py-1.5"
          >
            <Text className="font-semibold text-[11px] text-white">Set Area Sekarang</Text>
          </Pressable>
        </View>
      )}

      {/* Active jobs cleaner ini */}
      {activeJobs.length > 0 && (
        <View className="mx-4 mt-3 rounded-2xl bg-success/10 p-3" style={{ backgroundColor: '#D1FAE5' }}>
          <Text className="font-semibold text-[11px] uppercase tracking-wider" style={{ color: '#047857' }}>
            🔥 Job Aktif Kamu ({activeJobs.length})
          </Text>
          <View className="mt-2 gap-2">
            {activeJobs.map((j) => (
              <Pressable
                key={j.id}
                onPress={() => router.push({ pathname: '/booking/[id]', params: { id: j.id } })}
                className="flex-row items-center gap-2 rounded-xl bg-white p-2.5"
              >
                <View className="h-9 w-9 overflow-hidden rounded-lg bg-ink-100">
                  <Image
                    source={j.categoryImage}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-xs text-ink-900">{j.categoryName}</Text>
                  <Text className="font-medium text-[10px]" style={{ color: '#047857' }}>
                    {j.status === 'matched'
                      ? 'Dijadwalkan'
                      : j.status === 'on_the_way'
                        ? 'Otw lokasi'
                        : 'Sedang dikerjakan'}
                  </Text>
                </View>
                <ChevronRight color="#94A3B8" size={14} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {searchingOutOfArea > 0 && (
        <View className="mx-4 mt-3 rounded-xl bg-ink-100 p-3">
          <Text className="font-medium text-[11px] text-ink-600">
            ℹ️ Ada {searchingOutOfArea} job di kota lain (di luar area kamu).{' '}
            <Text
              className="font-bold text-brand-700"
              onPress={() => router.push('/cleaner/areas')}
            >
              Tambah area?
            </Text>
          </Text>
        </View>
      )}

      {available.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
        >
          <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            <Briefcase color="#1D4ED8" size={36} strokeWidth={2} />
          </View>
          <Text className="font-bold mt-4 text-lg text-ink-900">Belum ada job</Text>
          <Text className="font-sans mt-1 text-center text-sm text-ink-500">
            {areas.length > 0
              ? `Belum ada order di ${areas.join(', ')}. Akan otomatis muncul kalau ada customer pesan.`
              : 'Belum ada customer pesan. Cek kembali nanti.'}
          </Text>

          <View className="mt-6 w-full rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <Text className="font-semibold text-[11px] text-amber-900">DEV — Test data</Text>
            <Text className="font-sans mt-1 text-[11px] text-amber-900">
              Generate sample job untuk test flow accept order.
            </Text>
            <Pressable
              onPress={injectSampleJob}
              className="mt-2 flex-row items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-2"
            >
              <RefreshCw color="white" size={12} strokeWidth={2.4} />
              <Text className="font-bold text-[11px] text-white">Generate Sample Job</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {available.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
              className="rounded-2xl bg-white p-3"
              style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 }}
            >
              <View className="flex-row gap-3">
                <View className="h-16 w-16 overflow-hidden rounded-xl bg-ink-100">
                  <Image
                    source={b.categoryImage}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-semibold text-sm text-ink-900">{b.categoryName}</Text>
                    <Text className="font-bold text-sm text-success">
                      {formatRupiah(b.totalPrice)}
                    </Text>
                  </View>
                  <Text className="font-medium text-[11px] text-brand-600">
                    {b.pricingMode === 'package'
                      ? b.packageName
                      : b.pricingMode === 'hourly'
                        ? `${b.hourlyTierName} · ${b.hours}j`
                        : 'WA Survey'}
                  </Text>
                  <View className="mt-1 flex-row items-center gap-1">
                    <Calendar color="#94A3B8" size={11} />
                    <Text className="font-sans text-[11px] text-ink-500">{b.scheduledAt}</Text>
                  </View>
                  <View className="mt-0.5 flex-row items-start gap-1">
                    <MapPin color="#94A3B8" size={11} style={{ marginTop: 2 }} />
                    <Text
                      className="font-sans flex-1 text-[11px] text-ink-500"
                      numberOfLines={2}
                    >
                      {b.addressLine}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mt-3 flex-row gap-2 border-t border-ink-100 pt-3">
                <View className="flex-1">
                  <Text className="font-sans text-[10px] text-ink-500">Kamu dapat (final)</Text>
                  <View className="flex-row items-baseline gap-1">
                    <Text className="font-bold text-base text-success">
                      {formatRupiah(calculateCleanerEarning(b.totalPrice, bringsTools))}
                    </Text>
                    <Text className="font-medium text-[10px] text-ink-500">
                      ({Math.round(calculateCleanerShare(b.totalPrice, bringsTools) * 100)}%
                      {bringsTools ? ' · bawa alat' : ' · tanpa alat'})
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    accept(b.id);
                  }}
                  className="flex-row items-center gap-1 rounded-xl bg-brand-600 px-4 py-2"
                >
                  <Text className="font-bold text-xs text-white">Ambil Job</Text>
                  <ChevronRight color="white" size={14} strokeWidth={2.4} />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

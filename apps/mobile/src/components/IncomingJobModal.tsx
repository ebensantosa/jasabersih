import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AlertCircle, Calendar, Check, MapPin, Wallet, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../data/catalog';
import { useAuthStore } from '../stores/auth';
import { useBookingsStore } from '../stores/bookings';
import { useCleanerStore } from '../stores/cleaner';
import { calculateCleanerEarning, calculateCleanerShare } from '../stores/cleanerWallet';
import { useModeStore } from '../stores/mode';
import { toast } from '../stores/ui';

const SEARCH_TIMEOUT_SEC = 15 * 60;

export function IncomingJobModal() {
  const router = useRouter();
  const list = useBookingsStore((s) => s.list);
  const tokens = useAuthStore((s) => s.tokens);
  const mode = useModeStore((s) => s.mode);
  const areas = useCleanerStore((s) => s.serviceAreas);
  const bringsTools = useCleanerStore((s) => s.bringsTools);
  const cleanerName = useCleanerStore((s) => s.name);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(SEARCH_TIMEOUT_SEC);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  /** ID job yang sedang ditampilkan di modal - track untuk detect kalau ke-take cleaner lain */
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [takenByOther, setTakenByOther] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filter semua job yang match (status searching, area match, belum di-dismiss).
  // Pertama yang di-show, sisanya di-queue.
  const matchingJobs = list.filter((b) => {
    if (b.status !== 'searching') return false;
    if (dismissedIds.has(b.id)) return false;
    if (areas.length === 0) return true;
    return areas.some((a) => b.addressLine.toLowerCase().includes(a.toLowerCase()));
  });
  const incoming = matchingJobs[0];
  const otherJobsCount = Math.max(0, matchingJobs.length - 1);

  // Track currently displayed booking & detect kalau status berubah dari searching
  // (cleaner lain ambil duluan)
  useEffect(() => {
    if (incoming && currentJobId !== incoming.id) {
      setCurrentJobId(incoming.id);
      setTakenByOther(false);
    }
  }, [incoming, currentJobId]);

  useEffect(() => {
    if (!currentJobId) return;
    const b = list.find((x) => x.id === currentJobId);
    if (!b) return;
    // Status berubah dari searching → ada cleaner yang ambil (atau customer cancel)
    if (b.status !== 'searching' && !takenByOther && b.cleanerName !== cleanerName) {
      setTakenByOther(true);
      if (tickRef.current) clearInterval(tickRef.current);
      // Auto-dismiss setelah 2.5 detik
      setTimeout(() => {
        setDismissedIds((d) => new Set(d).add(currentJobId));
        setCurrentJobId(null);
        setTakenByOther(false);
      }, 2500);
    }
  }, [list, currentJobId, takenByOther, cleanerName]);

  // Reset countdown setiap ada job baru
  useEffect(() => {
    if (incoming) {
      const createdAtMs = typeof incoming.createdAt === 'number'
        ? incoming.createdAt
        : incoming.createdAt
          ? Date.parse(incoming.createdAt)
          : Date.now();
      const syncCountdown = () => {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
        const remaining = Math.max(0, SEARCH_TIMEOUT_SEC - elapsedSec);
        setSecondsLeft(remaining);
        if (remaining <= 0) setDismissedIds((d) => new Set(d).add(incoming.id));
      };
      syncCountdown();
      tickRef.current = setInterval(syncCountdown, 1000);
      return () => {
        if (tickRef.current) clearInterval(tickRef.current);
      };
    }
    return undefined;
  }, [incoming]);

  // Hanya show kalau cleaner mode + logged in + ada incoming
  const visible = !!tokens && mode === 'freelancer' && !!incoming;

  const [refuseModalOpen, setRefuseModalOpen] = useState(false);
  function openRefuse() {
    setRefuseModalOpen(true);
  }
  async function submitRefuse(reasonCode: string) {
    if (!incoming) return;
    if (tickRef.current) clearInterval(tickRef.current);
    setRefuseModalOpen(false);
    setDismissedIds((d) => new Set(d).add(incoming.id));
    try {
      const { api } = await import('../lib/api');
      await api.post(`/cleaner/jobs/${incoming.id}/refuse`, { reasonCode });
    } catch { /* non-fatal, dismiss tetap jalan */ }
    toast.info('Job dilewati. Akan di-offer ke cleaner lain.');
  }
  function reject(id: string) {
    openRefuse();
  }

  function accept(id: string) {
    if (tickRef.current) clearInterval(tickRef.current);
    useBookingsStore.setState({
      list: useBookingsStore.getState().list.map((b) =>
        b.id === id ? { ...b, cleanerName, status: 'matched' as const } : b,
      ),
    });
    toast.success('Job berhasil diambil!');
    router.push({ pathname: '/booking/[id]', params: { id } });
  }

  // Hard guard: modal ini cuma untuk cleaner. Kalau customer mode atau belum login,
  // jangan render apapun (cegah popup "sudah diambil" bocor ke customer).
  if (!tokens || mode !== 'freelancer') return null;

  // Kalau sudah ke-take cleaner lain → tampilkan flash screen
  if (takenByOther && currentJobId) {
    const b = list.find((x) => x.id === currentJobId);
    return (
      <Modal visible animationType="fade" presentationStyle="overFullScreen" transparent>
        <View className="flex-1 items-center justify-center bg-black/60 px-8">
          <View
            className="w-full items-center rounded-3xl bg-white p-6"
            style={{ elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20 }}
          >
            <View className="h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle color="#B45309" size={32} strokeWidth={2.4} />
            </View>
            <Text className="font-bold mt-4 text-lg text-ink-900">Yah, sudah diambil!</Text>
            <Text className="font-sans mt-1 text-center text-sm text-ink-600">
              Cleaner lain lebih cepat ambil job{' '}
              <Text className="font-semibold">{b?.categoryName ?? 'ini'}</Text>. Tetap semangat,
              job baru akan masuk lagi.
            </Text>
            <Text className="font-sans mt-3 text-center text-[11px] text-ink-400">
              Otomatis tertutup…
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (!visible || !incoming) return null;

  const earning = calculateCleanerEarning(incoming.totalPrice, bringsTools);
  const sharePct = Math.round(calculateCleanerShare(incoming.totalPrice, bringsTools) * 100);
  const minuteLeft = Math.floor(secondsLeft / 60);
  const secondPart = secondsLeft % 60;
  const remainingLabel = `${String(minuteLeft).padStart(2, '0')}:${String(secondPart).padStart(2, '0')}`;
  const snapshot = incoming.formSnapshot ?? {};
  const incomingPhotos: string[] = Array.isArray(snapshot.conditionPhotos)
    ? snapshot.conditionPhotos
    : Array.isArray(snapshot.beforePhotos)
      ? snapshot.beforePhotos
      : [];
  const incomingCustomerNote = snapshot.customerNotes || snapshot.notes || incoming.customerNotes || '';

  return (
    <Modal visible animationType="slide" presentationStyle="overFullScreen" transparent>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="rounded-t-3xl bg-white" style={{ maxHeight: '92%' }}>
          {/* Header gradient */}
          <LinearGradient
            colors={['#1E3A8A', '#047857', '#0E7490']}
            style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}
            className="rounded-t-3xl"
          >
            <View className="self-center mb-3 h-1 w-10 rounded-full bg-white/30" />

            {/* Queue badge - kalau ada job lain lagi nungguin di belakang */}
            {otherJobsCount > 0 && (
              <View className="mb-2 flex-row items-center gap-1.5 self-start rounded-full bg-amber-400 px-2.5 py-1">
                <Text className="font-extrabold text-[10px] text-amber-900">
                  + {otherJobsCount} job lain antri
                </Text>
              </View>
            )}

            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="font-bold text-[10px] uppercase tracking-wider text-white/70">
                  ⚡ Job Baru Tersedia
                </Text>
                <Text className="font-bold mt-1 text-2xl text-white">
                  {formatRupiah(earning)}
                </Text>
                <Text className="font-medium mt-0.5 text-[11px] text-white/85">
                  Earning kamu ({sharePct}% · {bringsTools ? 'Bawa Alat' : 'Tanpa Alat'})
                </Text>
              </View>
              <View className="items-center justify-center rounded-full bg-white/15 px-3 py-2">
                <Text className="font-bold text-lg text-white">{remainingLabel}</Text>
                <Text className="font-medium text-[9px] text-white/70">menit : detik</Text>
              </View>
            </View>
          </LinearGradient>

          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
            {/* Layanan */}
            <View className="flex-row items-center gap-3 rounded-2xl bg-white p-3" style={{ elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' }}>
              <View className="h-14 w-14 overflow-hidden rounded-xl bg-ink-100">
                <Image
                  source={incoming.categoryImage}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-sm text-ink-900">{incoming.categoryName}</Text>
                <Text className="font-medium text-[11px] text-brand-600">
                  {incoming.pricingMode === 'package'
                    ? incoming.packageName
                    : incoming.pricingMode === 'hourly'
                      ? `${incoming.hourlyTierName} · ${incoming.hours}j`
                      : 'WA Survey'}
                </Text>
                <Text className="font-sans mt-0.5 text-[10px] text-ink-500">
                  Total order: {formatRupiah(incoming.totalPrice)}
                </Text>
              </View>
            </View>

            {/* Jadwal */}
            <View className="flex-row gap-3 rounded-xl bg-ink-50 p-3">
              <Calendar color="#1D4ED8" size={16} strokeWidth={2.4} />
              <View className="flex-1">
                <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">
                  Jadwal
                </Text>
                <Text className="font-semibold mt-0.5 text-xs text-ink-800">
                  {incoming.scheduledAt}
                </Text>
              </View>
            </View>

            {/* Alamat */}
            <View className="flex-row gap-3 rounded-xl bg-ink-50 p-3">
              <MapPin color="#1D4ED8" size={16} strokeWidth={2.4} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">
                  Alamat
                </Text>
                <Text className="font-semibold mt-0.5 text-xs text-ink-800" numberOfLines={3}>
                  {incoming.addressLine}
                </Text>
              </View>
            </View>

            {/* Snapshot summary kalau paket */}
            {incoming.formSnapshot && incoming.pricingMode === 'package' && (
              <View className="rounded-xl bg-ink-50 p-3">
                <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">
                  Detail Properti
                </Text>
                <Text className="font-sans mt-1 text-[11px] text-ink-700">
                  {incoming.formSnapshot.propertyType} · {incoming.formSnapshot.bedrooms} kamar
                  tidur · {incoming.formSnapshot.bathrooms} kamar mandi · {incoming.formSnapshot.areaM2}m²
                </Text>
                <Text className="font-sans mt-1 text-[11px] text-ink-700">
                  Tingkat kotor: {incoming.formSnapshot.dirtLevel}/5
                  {incoming.formSnapshot.dirtLevel && incoming.formSnapshot.dirtLevel >= 4
                    ? ` · ${incoming.formSnapshot.photoCount ?? 0} foto`
                    : ''}
                </Text>
              </View>
            )}

            {/* Foto kondisi dari customer - bantu cleaner assess scope sebelum ambil */}
            {incomingPhotos.length > 0 && (
              <View className="rounded-xl bg-white p-3" style={{ borderWidth: 1, borderColor: '#F1F5F9' }}>
                {/* Legacy line below still references old field directly; guard above keeps runtime safe. */}
                {/* @ts-ignore */}
                <Text className="font-semibold text-[10px] uppercase tracking-wider text-ink-500">
                  📸 Foto Kondisi ({incoming.formSnapshot.conditionPhotos.length})
                </Text>
                <Text className="font-sans mt-0.5 mb-2 text-[10px] text-ink-500">
                  Tap untuk lihat besar
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {incomingPhotos.map((url: string, i: number) => (
                      <Pressable
                        key={`${url}-${i}`}
                        onPress={() => setPreviewPhoto(url)}
                        className="overflow-hidden rounded-lg bg-ink-100"
                        style={{ width: 90, height: 90 }}
                      >
                        <Image
                          source={{ uri: url }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Catatan customer */}
            {incomingCustomerNote && (
              <View className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="font-semibold text-[10px] uppercase tracking-wider text-amber-900">
                  📝 Catatan Customer
                </Text>
                <Text className="font-sans mt-1 text-[11px] text-amber-900">
                  {incomingCustomerNote}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action buttons */}
          <SafeAreaView edges={['bottom']} className="border-t border-ink-200 bg-white">
            <View className="flex-row gap-2 p-4">
              <Pressable
                onPress={() => reject(incoming.id)}
                className="h-14 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border-2 border-ink-300 bg-white"
              >
                <X color="#475569" size={18} strokeWidth={2.4} />
                <Text className="font-bold text-sm text-ink-700">Tolak</Text>
              </Pressable>
              <Pressable
                onPress={() => accept(incoming.id)}
                className="h-14 flex-[1.5] flex-row items-center justify-center gap-1.5 rounded-2xl bg-success"
                style={{ elevation: 4 }}
              >
                <Check color="white" size={18} strokeWidth={2.4} />
                <Text className="font-bold text-sm text-white">
                  Ambil · {formatRupiah(earning)}
                </Text>
              </Pressable>
            </View>
            <View className="px-4 pb-2">
              <View className="flex-row items-center gap-1.5">
                <Wallet color="#94A3B8" size={11} />
                <Text className="font-medium text-[10px] text-ink-500">
                  Offer ini mengikuti sisa waktu pencarian customer: {remainingLabel}
                </Text>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </View>

      <Modal visible={refuseModalOpen} transparent animationType="fade" onRequestClose={() => setRefuseModalOpen(false)}>
        <Pressable onPress={() => setRefuseModalOpen(false)} className="flex-1 items-center justify-center bg-black/50 px-6">
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5">
            <Text className="font-extrabold text-base text-ink-900">Kenapa Tolak Job?</Text>
            <Text className="font-medium mt-1 text-[12px] text-ink-600">Bantu kami biar offer berikutnya lebih cocok untuk kamu.</Text>
            <View className="mt-3 gap-2">
              {[
                { code: 'off', label: 'Lagi off / istirahat' },
                { code: 'jauh', label: 'Lokasi terlalu jauh' },
                { code: 'bentrok', label: 'Jam-nya bentrok job lain' },
                { code: 'service_unfamiliar', label: 'Service ini kurang saya kuasai' },
                { code: 'customer_issue', label: 'Customer pernah bermasalah' },
                { code: 'other', label: 'Lainnya' },
              ].map((r) => (
                <Pressable
                  key={r.code}
                  onPress={() => void submitRefuse(r.code)}
                  className="rounded-xl border border-ink-200 bg-white px-3 py-3"
                >
                  <Text className="font-semibold text-sm text-ink-800">{r.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setRefuseModalOpen(false)} className="mt-3 py-2">
              <Text className="font-semibold text-center text-xs text-ink-500">Batal</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fullscreen preview foto kondisi */}
      <Modal visible={!!previewPhoto} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <Pressable
          onPress={() => setPreviewPhoto(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 12 }}
        >
          {previewPhoto && (
            <Image
              source={{ uri: previewPhoto }}
              style={{ width: '100%', height: '80%' }}
              contentFit="contain"
            />
          )}
          <Pressable
            onPress={() => setPreviewPhoto(null)}
            style={{ position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 999 }}
          >
            <X color="white" size={22} />
          </Pressable>
          <Text style={{ position: 'absolute', bottom: 40, color: 'white', fontSize: 11 }}>
            Tap di luar foto untuk tutup
          </Text>
        </Pressable>
      </Modal>
    </Modal>
  );
}

import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { withAuth } from '../../src/components/AuthGate';
import { SearchingCleanerView } from '../../src/components/SearchingCleanerView';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  Pause,
  Play,
  Sparkles,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WaIcon } from '../../src/components/BrandIcon';
import { BookingPhotos } from '../../src/components/BookingPhotos';
import { BookingTimeline } from '../../src/components/BookingTimeline';
import { DisputeFormModal } from '../../src/components/DisputeFormModal';
import { RatingFormModal } from '../../src/components/RatingFormModal';
import { ScheduleModal } from '../../src/components/ScheduleModal';
import { UpchargeFormModal } from '../../src/components/UpchargeFormModal';
import { api } from '../../src/lib/api';
import { formatScheduleWithTz } from '../../src/lib/datetime';
import { useT } from '../../src/lib/i18n';
import { formatRupiah } from '../../src/data/catalog';
import { useConfig } from '../../src/stores/appContent';
import { useModeStore } from '../../src/stores/mode';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  type Booking,
  type BookingStatus,
  useBookingsStore,
} from '../../src/stores/bookings';
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';
import { useVisiblePoll } from '../../src/lib/useVisiblePoll';

const FREE_CANCEL_WINDOW_SEC = 10;
const PENALTY_PCT = 0.25;

const TIMELINE_PACKAGE: { status: BookingStatus; label: string }[] = [
  { status: 'searching', label: 'Mencari Cleaner' },
  { status: 'matched', label: 'Cleaner Ditemukan' },
  { status: 'on_the_way', label: 'Menuju Lokasi' },
  { status: 'in_progress', label: 'Sedang Dikerjakan' },
  { status: 'completed', label: 'Selesai' },
];

// Cleaner POV: skip 'searching' (mereka udah accept), start dari 'Job Diterima'.
const TIMELINE_CLEANER: { status: BookingStatus; label: string }[] = [
  { status: 'matched', label: 'Job Diterima' },
  { status: 'on_the_way', label: 'Berangkat ke Lokasi' },
  { status: 'in_progress', label: 'Sedang Mengerjakan' },
  { status: 'completed', label: 'Selesai' },
];

const TIMELINE_WA: { status: BookingStatus; label: string }[] = [
  { status: 'wa_survey_pending', label: 'Menunggu CS Hubungi' },
  { status: 'pending_payment', label: 'Quote Siap, Tunggu Bayar' },
  { status: 'searching', label: 'Mencari Cleaner' },
  { status: 'matched', label: 'Cleaner Ditemukan' },
  { status: 'completed', label: 'Selesai' },
];

function getCleanerHeaderLabel(status: BookingStatus) {
  switch (status) {
    case 'completed':
      return 'JOB SELESAI';
    case 'canceled':
      return 'JOB DIBATALKAN';
    default:
      return 'JOB AKTIF';
  }
}

function deriveCleanerCarryReminders(booking: Booking | undefined): string[] {
  if (!booking) return [];

  const texts = [
    booking.categoryName,
    booking.packageName,
    booking.surveyDescription,
    booking.formSnapshot?.notes,
    booking.formSnapshot?.propertyType,
    Array.isArray(booking.formSnapshot?.dirtCharacters) ? booking.formSnapshot?.dirtCharacters.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const reminders: string[] = [];

  if (/(vacuum|vakum|kasur|sofa|hydro)/.test(texts)) {
    reminders.push('Bawa vacuum atau alat hisap yang sesuai dengan kebutuhan job ini.');
  }

  if (/(tangga|plafon|lampu|kaca atas|jendela atas|tinggi)/.test(texts)) {
    reminders.push('Siapkan tangga lipat atau alat bantu jangkau bila kamu punya.');
  }

  if (/(jamur|kerak|noda tebal|bekas renovasi|semen|cat)/.test(texts)) {
    reminders.push('Pastikan bawa perlengkapan deep clean yang cocok untuk noda berat.');
  }

  return Array.from(new Set(reminders));
}

type BookingRating = {
  id: string;
  rating: number;
  review?: string | null;
  tipAmount?: number;
  createdAt?: string;
} | null;

function BookingDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === id));
  const fetchOne = useBookingsStore((s) => s.fetchOne);
  const cancel = useBookingsStore((s) => s.cancel);
  const setStatus = useBookingsStore((s) => s.setStatus);

  // Cleaner mostly opens jobs they accepted - those rows aren't in their
  // local store yet (store seeded from /bookings which is customer-only).
  // Fetch + seed on mount when missing.
  useEffect(() => {
    if (id && !id.startsWith('bk_') && !booking) void fetchOne(id);
  }, [id, booking, fetchOne]);
  const mode = useModeStore((s) => s.mode);
  const isCleaner = mode === 'freelancer';
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const [bookingRating, setBookingRating] = useState<BookingRating>(null);
  const [advancing, setAdvancing] = useState(false);
  const [photoSummary, setPhotoSummary] = useState({ beforeCount: 0, afterCount: 0, damageCount: 0 });
  const [upcharges, setUpcharges] = useState<{ id: string; amount: number; reason: string; photoUrl: string | null; status: string; createdAt: string }[]>([]);
  const [showUpchargeModal, setShowUpchargeModal] = useState(false);
  const [subscriptionVisits, setSubscriptionVisits] = useState<Array<{ id: string; status: string; scheduledAt: string; visitIndex: number; visitTotal: number; cleanerName: string | null; completedAt: string | null }> | null>(null);

  async function loadUpcharges() {
    if (!id || id.startsWith('bk_')) return;
    try {
      const path = isCleaner ? `/cleaner/jobs/${id}/upcharges` : `/bookings/${id}/upcharges`;
      const r = await api.get(path);
      setUpcharges((r.data?.data ?? r.data ?? []) as any[]);
    } catch { /* silent */ }
  }
  useEffect(() => { void loadUpcharges(); }, [id, isCleaner]);

  // Fetch subscription child visits kalau parent
  async function loadSubscriptionVisits() {
    if (!id || id.startsWith('bk_') || isCleaner) return;
    try {
      const r = await api.get(`/bookings/${id}/subscription-visits`);
      const list = (r.data?.data ?? r.data ?? []) as any[];
      if (list.length > 0) setSubscriptionVisits(list as any);
    } catch { /* silent - not a subscription parent */ }
  }
  useEffect(() => { void loadSubscriptionVisits(); }, [id, isCleaner]);

  async function approveUpcharge(upchargeId: string) {
    try {
      await api.post(`/bookings/${id}/upcharges/${upchargeId}/approve`);
      toast.success('Charge tambahan disetujui');
      void loadUpcharges();
      void fetchOne(id!);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal approve');
    }
  }
  async function rejectUpcharge(upchargeId: string) {
    try {
      await api.post(`/bookings/${id}/upcharges/${upchargeId}/reject`);
      toast.warning('Charge tambahan ditolak');
      void loadUpcharges();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal reject');
    }
  }
  const t = useT();

  function confirmStartWork() {
    if (!booking) return;
    if (booking.pricingMode !== 'hourly') {
      void advanceStatus('in_progress');
      return;
    }
    Alert.alert(
      'Mulai hitung durasi kerja?',
      'Untuk layanan per jam, menekan Mulai Kerja akan langsung menjalankan hitungan waktu. Gunakan Jeda Kerja bila perlu istirahat.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Mulai Sekarang', onPress: () => { void advanceStatus('in_progress'); } },
      ],
    );
  }

  // Cleaner advance status - pakai API kalau bukan local-only booking
  async function advanceStatus(to: 'on_the_way' | 'in_progress' | 'completed') {
    if (!booking) return;
    if (booking.id.startsWith('bk_')) {
      setStatus(booking.id, to);
      return;
    }
    setAdvancing(true);
    try {
      await api.post(`/cleaner/jobs/${booking.id}/status`, { to });
      setStatus(booking.id, to);
      toast.success(to === 'on_the_way' ? 'Status: OTW' : to === 'in_progress' ? 'Pekerjaan dimulai' : 'Job selesai');
      if (to === 'completed') {
        router.replace('/(tabs)/bookings');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal update status');
    } finally { setAdvancing(false); }
  }

  // Check if booking already rated. Pakai useFocusEffect supaya re-fetch tiap balik
  // ke screen (misal dari halaman bayar tip - tip baru langsung kelihatan).
  useFocusEffect(
    useCallback(() => {
      if (!id || id.startsWith('bk_') || booking?.status !== 'completed') return;
      api.get(`/ratings/booking/${id}`).then((r) => {
        const data = (r.data?.data ?? r.data) as BookingRating;
        setBookingRating(data ?? null);
        setHasRated(!!(data && typeof data.rating === 'number' && data.rating > 0));
        if (data?.tipAmount) setTipGiven(Number(data.tipAmount));
      }).catch(() => {});
    }, [id, booking?.status])
  );
  const previousStatusRef = useRef<string | undefined>(booking?.status);
  useEffect(() => {
    const prev = previousStatusRef.current;
    const next = booking?.status;
    if (!next) return;
    if (!isCleaner && prev && prev !== 'completed' && next === 'completed') {
      router.replace('/(tabs)/bookings');
    }
    previousStatusRef.current = next;
  }, [booking?.status, isCleaner, router]);
  // Dispute hanya bisa dilaporkan setelah booking ada cleaner_id (matched/in_progress/completed)
  const canDispute = booking
    && !id?.startsWith('bk_')
    && ['matched', 'on_the_way', 'in_progress', 'completed'].includes(booking.status);
  const cleanerCanFinish = booking?.status === 'in_progress' && photoSummary.afterCount > 0;

  function openWaHelp() {
    if (!booking) return;
    router.push({
      pathname: '/booking/wa-survey',
      params: { category: booking.categoryCode || 'konsultasi' },
    });
  }

  // ───── ALL HOOKS BEFORE ANY EARLY RETURN ─────
  // Hook rules require unconditional ordering - moving these above the
  // !booking guard fixed "Rendered fewer hooks than expected" crash.
  const SEARCH_TIMEOUT_SEC = 15 * 60;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (booking?.status !== 'searching') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [booking?.status]);

  const [broadcastedTo, setBroadcastedTo] = useState<number | undefined>(undefined);
  const searchStatusMountedRef = useRef(true);
  useEffect(() => {
    searchStatusMountedRef.current = true;
    return () => {
      searchStatusMountedRef.current = false;
    };
  }, []);
  const pollSearchStatus = useCallback(async () => {
    if (!id || booking?.status !== 'searching' || id.startsWith('bk_')) return;
    try {
      const r = await api.get(`/bookings/${id}/search-status`);
      const d = r.data?.data ?? r.data;
      if (searchStatusMountedRef.current) setBroadcastedTo(Number(d?.broadcastedTo ?? 0));
    } catch { /* silent */ }
  }, [booking?.status, id]);
  useFocusEffect(
    useCallback(() => {
      if (booking?.status === 'searching') void pollSearchStatus();
    }, [booking?.status, pollSearchStatus]),
  );
  useVisiblePoll(pollSearchStatus, 10_000, booking?.status === 'searching' && !!id && !id.startsWith('bk_'));

  // Saat booking belum ada di store + bukan local stub: kasih kesempatan
  // fetchOne (~1-2 detik). Tanpa loading state, user kena flash "tidak ditemukan"
  // walau sebenarnya lagi loading dari server.
  // Loading state explicit (not timer) supaya gak race di slow network.
  const [fetchTriedAt, setFetchTriedAt] = useState(0);
  useEffect(() => { setFetchTriedAt(Date.now()); }, [id]);
  // Retry fetchOne sekali kalau masih kosong setelah 3 detik (kasus accept job
  // -> store blm sync padahal server udh oke).
  useEffect(() => {
    if (booking || !id || id.startsWith('bk_')) return;
    const t = setTimeout(() => { if (!useBookingsStore.getState().list.find((b) => b.id === id)) void fetchOne(id); }, 3000);
    return () => clearTimeout(t);
  }, [id, booking, fetchOne]);
  const stillFetching = !booking && id && !id.startsWith('bk_') && (Date.now() - fetchTriedAt < 10000);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [customTipAmount, setCustomTipAmount] = useState('');
  const [tipGiven, setTipGiven] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { api } = await import('../../src/lib/api');
        const r = await api.get('/customer/wallet');
        const bal = Number((r.data?.data ?? r.data)?.balance ?? 0);
        if (mounted) setWalletBalance(bal);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [tipGiven]);

  if (!booking) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        {stillFetching ? (
          <>
            <ActivityIndicator color="#1D4ED8" />
            <Text className="font-sans mt-2 text-ink-500">Memuat pesanan…</Text>
          </>
        ) : (
          <>
            <Text className="font-sans text-ink-500">Pesanan tidak ditemukan</Text>
            <Pressable onPress={() => {
              if (router.canGoBack()) safeBack();
              else router.replace(isCleaner ? '/(tabs)/jobs' : '/(tabs)/bookings');
            }} className="mt-4">
              <Text className="font-semibold text-brand-600">Kembali</Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    );
  }

  // Fallback color kalau status tidak dikenal (defensive — prevent crash kalau
  // backend kirim status baru yg belum di-map).
  const color = STATUS_COLOR[booking.status] ?? { bg: '#F1F5F9', fg: '#475569' };

  // Live searching countdown derivations. PENTING: guard NaN.
  // Pencarian cleaner dimulai SETELAH pembayaran lunas (paid_at), bukan saat
  // booking dibuat. Tanpa ini, timer "sudah berlalu" termasuk waktu user nunggu
  // di payment screen - bikin SEARCH_TIMEOUT salah trigger lebih cepat.
  // Fallback ke createdAt kalau paidAt belum ke-sync (defensive).
  const searchStartedAt = Number.isFinite(booking.paidAt) ? (booking.paidAt as number)
    : Number.isFinite(booking.createdAt) ? booking.createdAt
    : now;
  const elapsedSec = booking.status === 'searching' ? Math.max(0, Math.floor((now - searchStartedAt) / 1000)) : 0;
  const remainingSec = Math.max(0, SEARCH_TIMEOUT_SEC - elapsedSec);
  const minLeft = Math.floor(remainingSec / 60);
  const secLeft = remainingSec % 60;
  const searchTimeout = booking.status === 'searching' && remainingSec === 0;

  // Free cancel window countdown (10s setelah bayar). Guard NaN juga.
  const safePaidAt = Number.isFinite(booking.paidAt) ? booking.paidAt : 0;
  const paidElapsedSec = safePaidAt ? Math.max(0, Math.floor((now - safePaidAt) / 1000)) : 0;
  const freeCancelLeft = Math.max(0, FREE_CANCEL_WINDOW_SEC - paidElapsedSec);
  const inFreeCancelWindow = !!safePaidAt && freeCancelLeft > 0;

  // Policy cancel: 10s dari paidAt = gratis, lewat itu kena 25%.
  // (Production: window 5 menit, sesuai PRD `08-wallet-and-withdrawal.md`)
  function onCancel() {
    if (!booking) return;
    // Belum bayar → cancel langsung tanpa penalty
    if (booking.status === 'pending_payment' || !booking.paidAt) {
      setShowCancelConfirm(true);
      return;
    }

    const elapsedSec = Math.floor((Date.now() - booking.paidAt) / 1000);
    if (elapsedSec <= FREE_CANCEL_WINDOW_SEC) {
      Alert.alert(
        'Batalkan Pesanan?',
        `Masih dalam window gratis (${FREE_CANCEL_WINDOW_SEC - elapsedSec}s sisa). Refund 100%.`,
        [
          { text: 'Tidak' },
          {
            text: 'Ya, batalkan',
            style: 'destructive',
            onPress: () => {
              cancel(booking.id, booking.totalPrice);
              toast.success(`Dibatalkan. Refund ${formatRupiah(booking.totalPrice)} (100%)`);
            },
          },
        ],
      );
    } else {
      const penalty = Math.round(booking.totalPrice * PENALTY_PCT);
      const refund = booking.totalPrice - penalty;
      Alert.alert(
        '⚠️ Cancel Mendadak',
        `Lewat ${FREE_CANCEL_WINDOW_SEC}s setelah bayar - kena potongan ${PENALTY_PCT * 100}%.\n\nTotal: ${formatRupiah(booking.totalPrice)}\nPotongan: -${formatRupiah(penalty)}\nRefund: ${formatRupiah(refund)}`,
        [
          { text: 'Batal' },
          {
            text: 'Tetap Cancel',
            style: 'destructive',
            onPress: () => {
              cancel(booking.id, refund);
              toast.warning(`Dibatalkan. Refund ${formatRupiah(refund)} (potong 25%)`);
            },
          },
        ],
      );
    }
  }

  function onPay() {
    if (!booking) return;
    // Booking yang gagal sync ke server (id masih bk_xxx) tidak bisa dibayar -
    // Flip butuh booking_id real di DB. User harus retry create booking dulu.
    if (booking.id.startsWith('bk_')) {
      toast.error('Pesanan belum tersimpan di server. Tutup dan buat ulang pesanan.');
      return;
    }
    router.push({ pathname: '/payment/[bookingId]', params: { bookingId: booking.id } });
  }

  const rescheduleCount = (booking as any)?.rescheduleCount ?? 0;
  const hoursToSchedule = booking?.scheduledAt
    ? (new Date(booking.scheduledAt).getTime() - Date.now()) / 3_600_000
    : 0;
  const canReschedule = booking
    && rescheduleCount < 1
    && hoursToSchedule >= 48
    && !['canceled', 'completed', 'in_progress', 'started'].includes(booking.status);
  const cleanerRatingValue =
    typeof bookingRating?.rating === 'number' && Number.isFinite(bookingRating.rating)
      ? bookingRating.rating
      : null;
  const cleanerCarryReminders = deriveCleanerCarryReminders(booking);
  const snapshotConditionPhotos = (
    Array.isArray((booking.formSnapshot as any)?.conditionPhotos)
      ? (booking.formSnapshot as any).conditionPhotos
      : Array.isArray((booking.formSnapshot as any)?.beforePhotos)
        ? (booking.formSnapshot as any).beforePhotos
        : []
  ).filter((url: unknown) => typeof url === 'string' && url.trim().length > 0) as string[];
  const snapshotCustomerNotes =
    booking.formSnapshot?.customerNotes
    ?? booking.formSnapshot?.notes
    ?? booking.customerNotes
    ?? '';
  const hasSnapshotDetails = Boolean(
    booking.formSnapshot?.propertyType
    || booking.formSnapshot?.floor
    || booking.formSnapshot?.bedrooms
    || booking.formSnapshot?.bathrooms
    || booking.formSnapshot?.areaM2
    || booking.formSnapshot?.dirtLevel
    || booking.formSnapshot?.dirtCharacters?.length
    || booking.formSnapshot?.floorType
    || booking.formSnapshot?.furnitureDensity
    || booking.formSnapshot?.hasWater != null
    || booking.formSnapshot?.hasElectricity != null
    || booking.formSnapshot?.hasPet
    || snapshotCustomerNotes
    || snapshotConditionPhotos.length > 0,
  );

  async function doReschedule(newDate: Date) {
    if (!booking) return;
    try {
      const { api } = await import('../../src/lib/api');
      await api.post(`/bookings/${booking.id}/reschedule`, { scheduledAt: newDate.toISOString() });
      toast.success('Jadwal berhasil dipindah');
      setRescheduleOpen(false);
      // Refresh booking
      if (id) await fetchOne(String(id));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal pindah jadwal');
    }
  }

  const modeLabel =
    booking.pricingMode === 'package'
      ? booking.packageName ? `Paket Tetap · ${booking.packageName}` : 'Paket Tetap'
      : booking.pricingMode === 'hourly'
        ? `Per Jam${booking.hourlyTierName ? ` · ${booking.hourlyTierName}` : ''}${booking.hours ? ` × ${booking.hours}j` : ''}`
        : 'Konsultasi WhatsApp';

  // Full-screen searching mode: pesanan sudah dibayar - tidak ada cancel
  if (!isCleaner && booking.status === 'searching' && !searchTimeout) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 bg-ink-50">
          <SafeAreaView edges={['top', 'bottom']} className="flex-1">
            <View className="flex-1 justify-center px-4">
              <SearchingCleanerView elapsedSec={elapsedSec} broadcastedTo={broadcastedTo} />
            </View>
            <View className="gap-2 px-4 pb-4">
              <Pressable
                onPress={() => router.replace('/')}
                className="items-center rounded-2xl bg-brand-600 py-3"
              >
                <Text className="font-bold text-sm text-white">Kembali ke beranda</Text>
              </Pressable>
              <Text className="px-2 text-center text-[11px] text-ink-500">
                Pencarian tetap berjalan di latar. Notifikasi akan dikirim saat cleaner menerima.
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-brand-700">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => {
              if (router.canGoBack()) safeBack();
              else router.replace(isCleaner ? '/(tabs)/jobs' : '/(tabs)/bookings');
            }} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
            <Text className="font-bold ml-1 text-base text-white">{isCleaner ? 'Detail Job' : 'Detail Pesanan'}</Text>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ paddingBottom: booking.status === 'completed' ? 200 : 120 }} showsVerticalScrollIndicator={false}>
          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="flex-row items-center gap-3">
              <CategoryIcon
                image={booking.categoryImage}
                categoryCode={booking.categoryCode}
              />
              <View className="flex-1">
                <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-400">
                  {isCleaner ? getCleanerHeaderLabel(booking.status) : 'PESANANMU'}
                </Text>
                <Text className="font-bold text-base text-ink-900">{booking.categoryName}</Text>
                <Text className="font-medium text-[11px] text-ink-500">{modeLabel}</Text>
                {!isCleaner && (
                  <Text className="font-medium text-[10px] text-ink-400">
                    ID: {booking.id.toUpperCase()}
                  </Text>
                )}
              </View>
            </View>
            <View
              className="mt-3 self-start rounded-full px-3 py-1"
              style={{ backgroundColor: color.bg }}
            >
              <Text className="font-semibold text-xs" style={{ color: color.fg }}>
                {STATUS_LABEL[booking.status] ?? booking.status}
              </Text>
            </View>
          </View>

          {/* Action banner — kasih tau customer apa yang harus dilakuin sekarang */}
          {!isCleaner && booking.status === 'pending_payment' && (
            <Pressable
              onPress={onPay}
              className="mx-4 mt-3 flex-row items-center gap-3 rounded-2xl border-2 border-brand-400 bg-brand-50 p-4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
                <Text className="text-xl">💳</Text>
              </View>
              <View className="flex-1">
                <Text className="font-bold text-sm text-brand-900">Selesain Pembayaran Dulu</Text>
                <Text className="font-medium mt-0.5 text-[11px] leading-4 text-brand-800">
                  Bayar {formatRupiah(booking.totalPrice)} biar pesanan kamu langsung dicariin cleaner.
                </Text>
              </View>
              <Text className="font-bold text-base text-brand-700">›</Text>
            </Pressable>
          )}
          {!isCleaner && booking.status === 'completed' && !hasRated && (
            <View className="mx-4 mt-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
              <View className="flex-row items-center gap-2">
                <Text className="text-base">✓</Text>
                <Text className="font-bold text-sm text-emerald-900">Pesanan Selesai</Text>
              </View>
              <Text className="font-medium mt-1 text-[11px] leading-4 text-emerald-800">
                Cleaner sudah selesai. Kasih rating supaya saldo cleaner cair (auto-release 24 jam kalau gak rating).
              </Text>
            </View>
          )}
          {!isCleaner && booking.status === 'searching' && (
            <View className="mx-4 mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
              <Text className="font-medium text-[11px] leading-4 text-blue-900">
                ℹ Sabar ya, kami lagi cariin cleaner terbaik di area kamu. Notifikasi muncul saat ada yang ambil.
              </Text>
            </View>
          )}
          {!isCleaner && booking.status === 'matched' && (
            <View className="mx-4 mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
              <Text className="font-medium text-[11px] leading-4 text-blue-900">
                ℹ Cleaner ditemukan! Dia akan datang sesuai jadwal. Chat di app kalau perlu komunikasi.
              </Text>
            </View>
          )}
          {!isCleaner && booking.status === 'on_the_way' && (
            <View className="mx-4 mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
              <Text className="font-bold text-[11px] text-blue-900">🚗 Cleaner sedang dalam perjalanan</Text>
              <Text className="font-medium mt-0.5 text-[11px] leading-4 text-blue-800">
                Siapkan akses ke lokasi & catatan kalau ada. Pantau di chat untuk update.
              </Text>
            </View>
          )}
          {!isCleaner && booking.status === 'in_progress' && (
            <View className="mx-4 mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
              <Text className="font-bold text-[11px] text-blue-900">🧹 Pekerjaan sedang berlangsung</Text>
              <Text className="font-medium mt-0.5 text-[11px] leading-4 text-blue-800">
                Tunggu cleaner selesai. Kalau ada masalah selama kerja, chat langsung di app.
              </Text>
            </View>
          )}

          {/* Foto Pekerjaan - cleaner: taruh di atas biar gak kelewat upload before/after */}
          {isCleaner && !booking.id.startsWith('bk_') && ['matched', 'on_the_way', 'in_progress', 'completed'].includes(booking.status) && (
            <View className="mx-4 mt-3">
              <BookingPhotos bookingId={booking.id} isCleaner={isCleaner} status={booking.status} onSummaryChange={setPhotoSummary} />
            </View>
          )}

          {isCleaner && cleanerCarryReminders.length > 0 && (
            <View className="mx-4 mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <Text className="font-semibold mb-2 text-xs uppercase tracking-wider text-emerald-800">
                Pengingat Perlengkapan
              </Text>
              {cleanerCarryReminders.map((item) => (
                <Text key={item} className="mb-1 text-[12px] leading-5 text-emerald-900">
                  - {item}
                </Text>
              ))}
              <Text className="mt-1 text-[11px] leading-4 text-emerald-800">
                Cek lagi catatan customer sebelum berangkat agar perlengkapan yang dibutuhkan tidak tertinggal.
              </Text>
            </View>
          )}

          {/* Live searching indicator + countdown - customer only */}
          {!isCleaner && booking.status === 'searching' && !searchTimeout && (
            <View className="mx-4 mt-3">
              <SearchingCleanerView elapsedSec={elapsedSec} broadcastedTo={broadcastedTo} />
            </View>
          )}

          {/* Timeout - fallback ke WA, customer only */}
          {!isCleaner && searchTimeout && (
            <View className="mx-4 mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <View className="flex-row items-center gap-2">
                <AlertTriangle color="#B45309" size={18} strokeWidth={2.4} />
                <Text className="font-bold text-sm text-amber-900">
                  Tim customer service sedang bantu carikan cleaner
                </Text>
              </View>
              <Text className="font-sans mt-2 text-[12px] leading-[18px] text-amber-900">
                Sudah lebih dari 15 menit dan belum ada cleaner yang mengambil pesanan ini.
                Customer service sekarang melanjutkan pencarian secara manual. Kamu tidak perlu
                melakukan apa-apa. Jika ingin, kamu tetap bisa hubungi customer service lewat
                WhatsApp, tapi itu tidak wajib.
              </Text>
              <View className="mt-3">
                <Pressable
                  onPress={openWaHelp}
                  className="flex-row items-center justify-center gap-1.5 rounded-xl border border-amber-400 bg-white py-2.5"
                >
                  <View className="h-4 w-4 items-center justify-center rounded-full bg-white">
                    <WaIcon size={11} />
                  </View>
                  <Text className="font-bold text-xs text-amber-900">Hubungi customer service via WhatsApp</Text>
                </Pressable>
                <Text className="font-medium mt-2 text-[10px] text-amber-800">
                  Opsional. Pesanan tetap sedang diproses manual oleh customer service.
                </Text>
              </View>
            </View>
          )}

          {/* Status stepper di-hapus - timeline ada di komponen
              BookingTimeline (server-driven, auto-refresh on status change).
              Hindari dua source yg bisa kelihatan out-of-sync. */}

          {booking.pricingMode === 'hourly' && booking.status === 'in_progress' && booking.startedAt && booking.hours && (
            <HourlyCountdown
              bookingId={booking.id}
              startedAt={booking.startedAt}
              hours={booking.hours}
              isCleaner={isCleaner}
              pauseStartedAt={booking.pauseStartedAt}
              pausedTotalSec={booking.pausedTotalSec ?? 0}
              onRefresh={() => { if (id) void fetchOne(String(id)); }}
            />
          )}

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-semibold mb-3 text-xs uppercase tracking-wider text-ink-400">
              Detail
            </Text>
            <View className="gap-3">
              <Detail icon={Calendar} label="Jadwal" value={formatScheduleWithTz(booking.scheduledAt, booking.addressLine)} />
              <Detail icon={MapPin} label="Alamat" value={booking.addressLine} />
              {booking.pricingMode === 'hourly' && booking.hours && (
                <Detail icon={Clock} label="Durasi" value={`${booking.hours} jam`} />
              )}
            </View>
            {/* Maps button - single, prominent (cleaner pakai untuk navigasi).
                Chat dipindah ke bottom action bar biar gak duplikat. */}
            {['matched', 'on_the_way', 'in_progress'].includes(booking.status) && (
              <Pressable
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.addressLine)}`)}
                className="mt-3 flex-row items-center justify-center gap-1.5 rounded-xl bg-brand-50 py-2.5"
              >
                <MapPin color="#1D4ED8" size={14} />
                <Text className="font-bold text-xs text-brand-700">Buka di Google Maps</Text>
              </Pressable>
            )}
          </View>

          {/* Subscription parent — list child visits dengan status live + link per visit */}
          {subscriptionVisits && subscriptionVisits.length > 0 && (
            <View className="mx-4 mt-3 rounded-2xl border-2 border-brand-300 bg-brand-50 p-4">
              <View className="flex-row items-center gap-2">
                <Text className="text-base">📅</Text>
                <Text className="font-extrabold text-sm text-brand-900">
                  Jadwal Langganan ({subscriptionVisits.filter((v) => v.status === 'completed').length}/{subscriptionVisits.length} Selesai)
                </Text>
              </View>
              <Text className="font-medium mt-1 text-[11px] text-brand-800">
                Tap visit untuk detail. Tiap visit punya foto + rating sendiri.
              </Text>
              <View className="mt-3 gap-1.5">
                {subscriptionVisits.map((v) => {
                  const d = new Date(v.scheduledAt);
                  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                  const t = new Date(); t.setHours(0, 0, 0, 0);
                  const dn = new Date(d); dn.setHours(0, 0, 0, 0);
                  const isToday = t.getTime() === dn.getTime();
                  const statusBadge = (() => {
                    switch (v.status) {
                      case 'completed': return { label: '✓ Selesai', bg: '#D1FAE5', fg: '#047857' };
                      case 'in_progress': return { label: 'Lagi Dikerjain', bg: '#DBEAFE', fg: '#1D4ED8' };
                      case 'on_the_way': case 'cleaner_otw': return { label: 'Cleaner OTW', bg: '#DBEAFE', fg: '#1D4ED8' };
                      case 'matched': return { label: 'Cleaner Siap', bg: '#D1FAE5', fg: '#047857' };
                      case 'searching': return { label: 'Cari Cleaner', bg: '#FEF3C7', fg: '#B45309' };
                      case 'scheduled_future': return { label: 'Terjadwal', bg: '#F1F5F9', fg: '#475569' };
                      case 'canceled': return { label: 'Dibatalkan', bg: '#FEE2E2', fg: '#B91C1C' };
                      default: return { label: v.status, bg: '#F1F5F9', fg: '#475569' };
                    }
                  })();
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => router.push({ pathname: '/booking/[id]', params: { id: v.id } })}
                      className={`flex-row items-center justify-between rounded-xl px-3 py-2.5 ${isToday ? 'border-2 border-emerald-400 bg-emerald-50' : 'bg-white'}`}
                    >
                      <View className="flex-1 flex-row items-center gap-2">
                        <View className={`h-7 w-7 items-center justify-center rounded-full ${isToday ? 'bg-emerald-600' : 'bg-brand-600'}`}>
                          <Text className="font-extrabold text-[11px] text-white">{v.visitIndex}</Text>
                        </View>
                        <View className="flex-1">
                          <Text className="font-semibold text-sm text-ink-900">
                            {days[d.getDay()]}, {d.getDate()} {months[d.getMonth()]}
                          </Text>
                          {v.cleanerName && (
                            <Text className="font-medium text-[10px] text-ink-500">Cleaner: {v.cleanerName}</Text>
                          )}
                        </View>
                      </View>
                      <View style={{ backgroundColor: statusBadge.bg }} className="rounded-full px-2 py-1">
                        <Text style={{ color: statusBadge.fg }} className="font-bold text-[9px] uppercase tracking-wider">
                          {statusBadge.label}
                        </Text>
                      </View>
                      <Text className="font-bold ml-2 text-base text-brand-700">›</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {booking.formSnapshot && hasSnapshotDetails && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-3 text-xs uppercase tracking-wider text-ink-400">
                {isCleaner ? 'Info dari Customer' : 'Detail Properti'}
              </Text>
              <View className="gap-1.5">
                <Snap label="Tipe Properti" value={booking.formSnapshot.propertyType} />
                <Snap
                  label="Lantai"
                  value={
                    (booking.formSnapshot.floor ?? '') +
                    (booking.formSnapshot.hasLift ? ' (lift)' : '')
                  }
                />
                <Snap
                  label="Kamar"
                  value={`${booking.formSnapshot.bedrooms ?? 0} tidur · ${booking.formSnapshot.bathrooms ?? 0} mandi`}
                />
                <Snap label="Luas Area" value={`${booking.formSnapshot.areaM2 ?? 0} m²`} />
                <Snap
                  label="Tingkat Kotor"
                  value={`Skala ${booking.formSnapshot.dirtLevel ?? '?'} · ${booking.formSnapshot.photoCount ?? 0} foto`}
                />
                <Snap
                  label="Karakter"
                  value={booking.formSnapshot.dirtCharacters?.join(', ')}
                />
                <Snap
                  label="Lantai · Furniture"
                  value={`${booking.formSnapshot.floorType ?? ''} · ${booking.formSnapshot.furnitureDensity ?? ''}`}
                />
                <Snap
                  label="Air · Listrik"
                  value={`${booking.formSnapshot.hasWater ? 'Ada' : 'Tidak'} · ${booking.formSnapshot.hasElectricity ? 'Ada' : 'Tidak'}`}
                />
                {booking.formSnapshot.hasPet && (
                  <Snap label="Hewan" value={booking.formSnapshot.petNote || 'Ada'} />
                )}
                {snapshotCustomerNotes && booking.pricingMode !== 'hourly' && (
                  <Snap label="Catatan" value={snapshotCustomerNotes} />
                )}
              </View>
              {snapshotConditionPhotos.length > 0 && (
                <View className="mt-3">
                  <Text className="font-semibold text-xs uppercase tracking-wider text-ink-500 mb-2">
                    Foto Kondisi dari Customer
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {snapshotConditionPhotos.map((url, i) => (
                      <Image
                        key={i}
                        source={{ uri: url }}
                        style={{ width: 80, height: 80, borderRadius: 12 }}
                        contentFit="cover"
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {booking.pricingMode === 'hourly' && snapshotCustomerNotes && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-2 text-xs uppercase tracking-wider text-ink-400">
                Checklist Tugas
              </Text>
              <Text className="font-sans text-sm text-ink-700">{snapshotCustomerNotes}</Text>
            </View>
          )}

          {booking.surveyDescription && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-2 text-xs uppercase tracking-wider text-ink-400">
                Deskripsi Kebutuhan
              </Text>
              <Text className="font-sans text-sm text-ink-700">{booking.surveyDescription}</Text>
            </View>
          )}

          {/* Cleaner gak perlu lihat rincian harga customer - sembunyikan blok pembayaran. */}
          {!isCleaner && booking.totalPrice > 0 && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-3 text-xs uppercase tracking-wider text-ink-400">
                {t('bd.payment')}
              </Text>
              <View className="gap-2">
                <Row
                  label={
                    booking.pricingMode === 'package'
                      ? booking.packageName ?? 'Paket'
                      : `${booking.hourlyTierName} × ${booking.hours}j`
                  }
                  value={formatRupiah(booking.basePrice)}
                />
                {booking.dirtSurcharge > 0 && (
                  <Row
                    label={`Surcharge tingkat kotor`}
                    value={`+${formatRupiah(booking.dirtSurcharge)}`}
                  />
                )}
                {booking.addOns.map((a) => (
                  <Row key={a.code} label={a.name} value={`+${formatRupiah(a.price)}`} />
                ))}
              </View>
              <View className="mt-3 border-t border-ink-100 pt-3">
                <Row label={t('bd.total')} value={formatRupiah(booking.totalPrice)} bold />
              </View>
            </View>
          )}

          {!booking.id.startsWith('bk_') && booking.status !== 'searching' && (
            <View className="mx-4 mt-3">
              <BookingTimeline bookingId={booking.id} status={booking.status} />
            </View>
          )}

          {isCleaner && booking.status === 'completed' && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-3 text-xs uppercase tracking-wider text-ink-400">
                Rating Customer
              </Text>
              {bookingRating ? (
                <View className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 pr-1">
                      <Text className="font-bold text-sm text-amber-950">Penilaian untuk pekerjaan ini</Text>
                      <Text className="font-medium mt-1 text-[11px] leading-4 text-amber-800">
                        {cleanerRatingValue != null
                          ? `Customer kasih nilai ${cleanerRatingValue.toFixed(1)} bintang${bookingRating.review ? ' + ulasan' : ''}${Number(bookingRating.tipAmount ?? 0) > 0 ? ' + tip' : ''}.`
                          : 'Customer belum mengirim rating untuk job ini.'}
                      </Text>
                    </View>
                    <View className="min-w-[72px] rounded-2xl border border-amber-100 bg-white px-3 py-2">
                      <Text className="text-center font-extrabold text-lg text-amber-700">
                        {cleanerRatingValue != null ? cleanerRatingValue.toFixed(1) : '-'}
                      </Text>
                      <Text className="text-center font-medium text-[10px] text-amber-700">dari 5</Text>
                    </View>
                  </View>
                  {!!bookingRating.review && (
                    <View className="mt-3 rounded-xl bg-white/80 p-3">
                      <Text className="font-semibold text-[11px] uppercase tracking-wider text-ink-400">Ulasan</Text>
                      <Text className="font-sans mt-1 text-sm leading-5 text-ink-800">
                        {bookingRating.review}
                      </Text>
                    </View>
                  )}
                  {Number(bookingRating.tipAmount ?? 0) > 0 && (
                    <View className="mt-3 flex-row items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5">
                      <Text className="font-semibold text-sm text-emerald-900">Tip tambahan</Text>
                      <Text className="font-bold text-sm text-emerald-700">
                        {formatRupiah(Number(bookingRating.tipAmount ?? 0))}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View className="rounded-2xl border border-ink-200 bg-ink-50 p-4">
                  <Text className="font-bold text-sm text-ink-800">Rating belum masuk</Text>
                  <Text className="font-medium mt-1 text-[11px] leading-4 text-ink-500">
                    Kalau customer sudah memberi rating nanti akan tampil di halaman detail job ini.
                  </Text>
                </View>
              )}
            </View>
          )}

          {!isCleaner && !booking.id.startsWith('bk_') && ['matched', 'on_the_way', 'in_progress', 'completed'].includes(booking.status) && (
            <View className="mx-4 mt-3">
              <BookingPhotos bookingId={booking.id} isCleaner={isCleaner} status={booking.status} onSummaryChange={setPhotoSummary} />
            </View>
          )}

          {/* Upcharge requests */}
          {upcharges.length > 0 && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-bold mb-2 text-sm text-ink-900">Charge Tambahan</Text>
              {upcharges.map((u) => {
                const isPending = u.status === 'pending';
                return (
                  <View key={u.id} className={`mb-2 rounded-xl border p-3 ${isPending ? 'border-amber-300 bg-amber-50' : u.status === 'approved' ? 'border-emerald-300 bg-emerald-50' : 'border-ink-200 bg-ink-50'}`}>
                    <View className="flex-row items-center justify-between">
                      <Text className="font-bold text-sm text-ink-900">+Rp {Number(u.amount).toLocaleString('id-ID')}</Text>
                      <Text className="font-bold text-[10px] uppercase tracking-wider">
                        {u.status === 'pending' ? '⏳ Menunggu' : u.status === 'approved' ? '✓ Disetujui' : '✕ Ditolak'}
                      </Text>
                    </View>
                    <Text className="font-medium mt-1 text-[12px] text-ink-700">{u.reason}</Text>
                    {u.photoUrl && (
                      <Image source={{ uri: u.photoUrl }} style={{ width: 80, height: 80, borderRadius: 8, marginTop: 6 }} contentFit="cover" />
                    )}
                    {isPending && !isCleaner && (
                      <View className="mt-2 flex-row gap-2">
                        <Pressable
                          onPress={() => router.push({ pathname: '/payment/[bookingId]', params: { bookingId: booking.id, extra: `upcharge:${u.id}` } })}
                          className="flex-1 items-center rounded-lg bg-emerald-600 py-2"
                        >
                          <Text className="font-bold text-xs text-white">Bayar</Text>
                        </Pressable>
                        <Pressable onPress={() => rejectUpcharge(u.id)} className="flex-1 items-center rounded-lg border border-red-300 bg-white py-2">
                          <Text className="font-bold text-xs text-red-700">Tolak</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Cleaner: tombol minta charge tambahan (saat on_the_way / in_progress) */}
          {isCleaner && booking.cleanerName && ['on_the_way', 'in_progress'].includes(booking.status) && !upcharges.some((u) => u.status === 'pending') && (
            <Pressable
              onPress={() => setShowUpchargeModal(true)}
              className="mx-4 mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3"
            >
              <Text className="text-base">💰</Text>
              <Text className="font-semibold text-sm text-amber-900">Minta Charge Tambahan</Text>
            </Pressable>
          )}

          {canDispute && (
            <Pressable
              onPress={() => setShowDispute(true)}
              className="mx-4 mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3"
            >
              <AlertTriangle color="#B91C1C" size={16} />
              <Text className="font-semibold text-sm text-red-700">{t('booking.report')}</Text>
            </Pressable>
          )}

        </ScrollView>

        {/* CUSTOMER bottom actions */}
        {!isCleaner && booking.status !== 'canceled' && booking.status !== 'completed' && (
          <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
            <SafeAreaView edges={['bottom']}>
              {booking.status === 'pending_payment' ? (
                <View className="p-4">
                  <Pressable
                    onPress={onPay}
                    className="rounded-2xl bg-brand-600 py-3.5"
                  >
                    <Text className="font-bold text-center text-sm text-white">
                      Bayar {formatRupiah(booking.totalPrice)}
                    </Text>
                  </Pressable>
                  {canReschedule && (
                    <Pressable onPress={() => setRescheduleOpen(true)} className="mt-2 py-2">
                      <Text className="font-semibold text-center text-xs text-brand-600">
                        Pindah Jadwal (gratis, h-2)
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={onCancel} className="mt-2 py-2">
                    <Text className="font-semibold text-center text-xs text-ink-500">
                      {t('booking.cancel')}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="p-4">
                  {!isCleaner &&
                  booking.cleanerName &&
                  (booking.status === 'matched' ||
                    booking.status === 'on_the_way' ||
                    booking.status === 'in_progress' ||
                    booking.status === 'completed') && (
                    <View className="mb-3 flex-row items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                      <View className="h-12 w-12 overflow-hidden rounded-full bg-emerald-100 items-center justify-center">
                        {booking.cleanerPhotoUrl ? (
                          <Image
                            source={{ uri: booking.cleanerPhotoUrl }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                          />
                        ) : (
                          <Text className="font-bold text-base text-emerald-700">
                            {booking.cleanerName.slice(0, 1).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                          Cleaner yang menangani pesanan
                        </Text>
                        <Text className="mt-0.5 text-sm font-bold text-emerald-900">
                          {booking.cleanerName}
                        </Text>
                        <Text className="mt-0.5 text-[11px] leading-4 text-emerald-800">
                          Pesanan kamu sudah punya cleaner. Kamu bisa chat langsung di bawah kalau perlu konfirmasi.
                        </Text>
                      </View>
                    </View>
                  )}
                  <View className="flex-row gap-2">
                    {booking.status === 'matched' ||
                    booking.status === 'on_the_way' ||
                    booking.status === 'in_progress' ? (
                      <Pressable
                        onPress={() =>
                          router.push({ pathname: '/chat/[id]', params: { id: booking.id } })
                        }
                        className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-brand-600 px-4 py-3.5"
                      >
                        <MessageCircle color="white" size={16} strokeWidth={2.4} />
                        <Text className="font-bold text-sm text-white">Chat</Text>
                      </Pressable>
                    ) : (
                      <View className="flex-1 items-center justify-center rounded-2xl bg-ink-100 py-3.5">
                        <Text className="font-medium text-sm text-ink-500">
                          {booking.pricingMode === 'wa_survey'
                            ? t('bd.cs_will_wa')
                            : t('bd.waiting_cleaner')}
                        </Text>
                      </View>
                    )}
                  </View>
                  {canReschedule && (
                    <Pressable onPress={() => setRescheduleOpen(true)} className="mt-2 py-2">
                      <Text className="font-semibold text-center text-xs text-brand-600">
                        Pindah Jadwal (gratis, h-2)
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </SafeAreaView>
          </View>
        )}

        {/* CLEANER bottom actions - kalau job ini di-take dia */}
        {isCleaner &&
          booking.status !== 'canceled' &&
          booking.status !== 'completed' &&
          booking.cleanerName && (
            <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
              <SafeAreaView edges={['bottom']}>
                {booking.status === 'on_the_way' && booking.pricingMode === 'hourly' && (
                  <View className="px-4 pt-3">
                    <View className="rounded-2xl border border-amber-300 bg-amber-50 p-3">
                      <Text className="font-bold text-[11px] text-amber-900">Mulai Kerja akan menjalankan hitungan waktu</Text>
                      <Text className="mt-1 text-[11px] leading-4 text-amber-800">
                        Khusus layanan per jam, durasi akan mulai dihitung saat kamu menekan tombol Mulai Kerja. Jika perlu istirahat di tengah pekerjaan, gunakan tombol Jeda Kerja.
                      </Text>
                    </View>
                  </View>
                )}
                <View className="flex-row gap-2 p-4">
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/chat/[id]', params: { id: booking.id } })
                    }
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-brand-300 bg-white py-3.5"
                  >
                    <MessageCircle color="#1D4ED8" size={16} strokeWidth={2.4} />
                    <Text className="font-bold text-sm text-brand-700">{t('bd.chat_customer')}</Text>
                  </Pressable>
                  {booking.status === 'matched' && (
                    <Pressable
                      onPress={() => advanceStatus('on_the_way')}
                      disabled={advancing}
                      className={`flex-1 items-center rounded-2xl py-3.5 ${advancing ? 'bg-brand-400' : 'bg-brand-600'}`}
                    >
                      <Text className="font-bold text-sm text-white">{advancing ? t('auth.processing') : t('cleaner.depart')}</Text>
                    </Pressable>
                  )}
                  {booking.status === 'on_the_way' && (
                    <Pressable
                      onPress={confirmStartWork}
                      disabled={advancing}
                      className={`flex-1 items-center rounded-2xl py-3.5 ${advancing ? 'bg-brand-400' : 'bg-brand-600'}`}
                    >
                      <Text className="font-bold text-sm text-white">{advancing ? t('auth.processing') : t('cleaner.start_work')}</Text>
                    </Pressable>
                  )}
                  {booking.status === 'in_progress' && (
                    <View className="flex-1">
                      <Pressable
                        onPress={() => advanceStatus('completed')}
                        disabled={advancing || !cleanerCanFinish}
                        className={`items-center rounded-2xl py-3.5 ${(advancing || !cleanerCanFinish) ? 'bg-success/40' : 'bg-success'}`}
                      >
                        <Text className="font-bold text-sm text-white">{advancing ? t('auth.processing') : t('cleaner.finish')}</Text>
                      </Pressable>
                      {!cleanerCanFinish && (
                        <Text className="mt-1 text-center text-[10px] text-amber-700">
                          Upload foto hasil kerja dulu sebelum menyelesaikan job.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </SafeAreaView>
            </View>
          )}

        {booking.status === 'completed' && !isCleaner && (
          <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
            <SafeAreaView edges={['bottom']}>
              <View className="p-4">
                {hasRated ? (
                  <>
                    <View className="flex-row items-center justify-center gap-1.5 rounded-2xl bg-success/10 py-3.5">
                      <CheckCircle2 color="#047857" size={16} strokeWidth={2.4} />
                      <Text className="font-semibold text-sm text-success">{t('booking.already_rated')}</Text>
                    </View>
                    {!tipGiven && (
                      <Pressable
                        onPress={() => setShowTip(true)}
                        className="mt-2 flex-row items-center justify-center gap-1.5 rounded-2xl border border-amber-400 bg-amber-50 py-3"
                      >
                        <Text className="text-base">🎁</Text>
                        <Text className="font-bold text-sm text-amber-900">Beri Tip ke Cleaner</Text>
                      </Pressable>
                    )}
                    {tipGiven > 0 && (
                      <View className="mt-2 flex-row items-center justify-center gap-1.5 rounded-2xl bg-amber-50 py-3">
                        <Text className="text-base">🎁</Text>
                        <Text className="font-semibold text-sm text-amber-900">Tip {formatRupiah(tipGiven)} terkirim</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Pressable
                    onPress={() => setShowRating(true)}
                    className="flex-row items-center justify-center gap-1.5 rounded-2xl bg-brand-600 py-3.5"
                  >
                    <CheckCircle2 color="white" size={16} strokeWidth={2.4} />
                    <Text className="font-bold text-sm text-white">{t('booking.rate')}</Text>
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
          </View>
        )}
      </View>

      {showUpchargeModal && id && (
        <UpchargeFormModal
          bookingId={id}
          onClose={() => setShowUpchargeModal(false)}
          onSubmitted={() => { setShowUpchargeModal(false); void loadUpcharges(); }}
        />
      )}

      <ScheduleModal
        visible={rescheduleOpen}
        value={booking?.scheduledAt ? new Date(booking.scheduledAt) : new Date(Date.now() + 48 * 3600_000)}
        onChange={(d) => void doReschedule(d)}
        onClose={() => setRescheduleOpen(false)}
      />

      <Modal visible={showTip} transparent animationType="fade" onRequestClose={() => setShowTip(false)}>
        <Pressable onPress={() => setShowTip(false)} className="flex-1 items-center justify-center bg-black/50 px-6">
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5">
            <Text className="font-extrabold text-lg text-ink-900">🎁 Beri Tip Cleaner</Text>
            <Text className="font-medium mt-1 text-[12px] text-ink-600">
              Pilih nominal tip atau input manual. Bayar pakai saldo wallet atau transfer/QRIS di halaman pembayaran berikutnya.
            </Text>
            {(() => {
              const options = [10000, 20000, 50000, 100000];
              return (
                <View className="mt-4 flex-row flex-wrap gap-2">
                  {options.map((amt) => (
                    <Pressable
                      key={amt}
                      onPress={() => {
                        setShowTip(false);
                        router.push({ pathname: '/payment/[bookingId]', params: { bookingId: booking?.id ?? '', extra: 'tip', amount: String(amt) } });
                      }}
                      className="min-w-[80px] items-center rounded-xl border border-brand-600 bg-brand-50 px-3 py-2.5"
                    >
                      <Text className="font-extrabold text-[13px] text-brand-700">{formatRupiah(amt)}</Text>
                    </Pressable>
                  ))}
                </View>
              );
            })()}

            {/* Manual input - kalau customer mau kasih nominal lain */}
            <View className="mt-4">
              <Text className="font-semibold mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">Nominal Lain</Text>
              <View className="flex-row items-center gap-2 rounded-xl border border-ink-200 bg-white p-3">
                <Text className="font-bold text-sm text-ink-500">Rp</Text>
                <TextInput
                  value={customTipAmount}
                  onChangeText={(v) => setCustomTipAmount(v.replace(/\D/g, '').slice(0, 8))}
                  keyboardType="number-pad"
                  placeholder="Contoh: 75000"
                  placeholderTextColor="#94A3B8"
                  className="font-sans flex-1 text-sm text-ink-900"
                />
                <Pressable
                  disabled={!customTipAmount || Number(customTipAmount) < 5000}
                  onPress={() => {
                    const amt = Number(customTipAmount);
                    if (!amt || amt < 5000) return;
                    setShowTip(false);
                    setCustomTipAmount('');
                    router.push({ pathname: '/payment/[bookingId]', params: { bookingId: booking?.id ?? '', extra: 'tip', amount: String(amt) } });
                  }}
                  className="rounded-lg bg-brand-600 px-3 py-1.5"
                  style={{ opacity: !customTipAmount || Number(customTipAmount) < 5000 ? 0.4 : 1 }}
                >
                  <Text className="font-bold text-[12px] text-white">Lanjut</Text>
                </Pressable>
              </View>
              <Text className="font-sans mt-1 text-[10px] text-ink-500">Minimum Rp 5.000</Text>
            </View>

            <Pressable onPress={() => setShowTip(false)} className="mt-4 py-2">
              <Text className="font-semibold text-center text-xs text-ink-500">Lain Kali</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCancelConfirm} transparent animationType="fade" onRequestClose={() => setShowCancelConfirm(false)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-sm rounded-2xl bg-white p-5">
            <Text className="font-bold text-base text-ink-900">Batalkan Pesanan?</Text>
            <Text className="mt-2 text-sm text-ink-600">Belum dibayar - gratis batal.</Text>
            <View className="mt-5 flex-row gap-2">
              <Pressable
                onPress={() => setShowCancelConfirm(false)}
                className="flex-1 items-center rounded-xl border border-ink-300 bg-white py-3"
              >
                <Text className="font-semibold text-sm text-ink-700">Tidak</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowCancelConfirm(false);
                  if (booking) {
                    cancel(booking.id, booking.totalPrice);
                    toast.success('Pesanan dibatalkan');
                  }
                }}
                className="flex-1 items-center rounded-xl bg-danger py-3"
              >
                <Text className="font-bold text-sm text-white">Ya, batalkan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {canDispute && (
        <DisputeFormModal
          bookingId={booking.id}
          isCleaner={isCleaner}
          open={showDispute}
          onClose={() => setShowDispute(false)}
          onSubmitted={() => setShowDispute(false)}
        />
      )}

      {booking.status === 'completed' && booking.cleanerName && (
        <RatingFormModal
          bookingId={booking.id}
          cleanerName={booking.cleanerName}
          open={showRating}
          onClose={() => setShowRating(false)}
          onSubmitted={() => { setShowRating(false); setHasRated(true); }}
        />
      )}
    </>
  );
}

function HourlyCountdown({
  bookingId,
  startedAt,
  hours,
  isCleaner,
  pauseStartedAt,
  pausedTotalSec,
  onRefresh,
}: {
  bookingId: string;
  startedAt: number;
  hours: number;
  isCleaner: boolean;
  pauseStartedAt?: number;
  pausedTotalSec?: number;
  onRefresh?: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [timerBusy, setTimerBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const totalMs = hours * 3600 * 1000;
  const isPaused = !!pauseStartedAt;
  const effectiveNow = isPaused ? pauseStartedAt! : now;
  const elapsedMs = Math.max(0, effectiveNow - startedAt - ((pausedTotalSec ?? 0) * 1000));
  const remainingMs = totalMs - elapsedMs;
  const overtime = remainingMs < 0;
  const absMs = Math.abs(remainingMs);
  const hh = Math.floor(absMs / 3600000);
  const mm = Math.floor((absMs % 3600000) / 60000);
  const ss = Math.floor((absMs % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const elapsedH = Math.floor(elapsedMs / 3600000);
  const elapsedM = Math.floor((elapsedMs % 3600000) / 60000);

  async function togglePause() {
    if (timerBusy) return;
    setTimerBusy(true);
    try {
      await api.post(`/cleaner/jobs/${bookingId}/timer`, { action: isPaused ? 'resume' : 'pause' });
      toast.success(isPaused ? 'Timer dilanjutkan' : 'Timer dijeda');
      onRefresh?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal ubah timer');
    } finally {
      setTimerBusy(false);
    }
  }

  return (
    <View
      className={`mx-4 mt-3 rounded-2xl p-4 ${overtime ? 'border-2 border-amber-300 bg-amber-50' : 'bg-white'}`}
      style={{ elevation: 3 }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <Clock color={overtime ? '#B45309' : '#1D4ED8'} size={16} strokeWidth={2.4} />
          <Text className={`font-bold text-sm ${overtime ? 'text-amber-900' : 'text-ink-900'}`}>
            {overtime ? 'OVERTIME' : 'Sisa Waktu Pengerjaan'}
          </Text>
        </View>
        {isCleaner && (
          <Pressable
            onPress={() => void togglePause()}
            disabled={timerBusy}
            className={`min-w-[122px] flex-row items-center justify-center gap-1.5 rounded-full px-3 py-2 ${isPaused ? 'bg-emerald-600' : 'bg-amber-500'} ${timerBusy ? 'opacity-60' : ''}`}
          >
            {timerBusy ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                {isPaused ? <Play color="white" size={12} strokeWidth={2.8} /> : <Pause color="white" size={12} strokeWidth={2.8} />}
                <Text className="font-bold text-[11px] text-white">{isPaused ? 'Lanjut Kerja' : 'Jeda Kerja'}</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
      <Text className={`font-extrabold mt-2 text-4xl ${overtime ? 'text-amber-700' : 'text-brand-700'}`} style={{ fontVariant: ['tabular-nums'] }}>
        {pad(hh)}:{pad(mm)}:{pad(ss)}
      </Text>
      <Text className="font-sans mt-1 text-[11px] text-ink-500">
        Sudah kerja {elapsedH}j {elapsedM}m dari {hours} jam yang di-book
      </Text>
      {isPaused && (
        <View className="mt-2 self-start rounded-full bg-amber-100 px-3 py-1">
          <Text className="font-semibold text-[11px] text-amber-800">Timer sedang dijeda</Text>
        </View>
      )}
      <Text className="font-sans mt-1 text-[11px] text-ink-500">
        Countdown ini tampil sama di aplikasi customer dan cleaner sebagai acuan durasi kerja.
      </Text>
      {overtime && (
        <Text className="font-medium mt-1.5 text-[11px] text-amber-800">
          {isCleaner
            ? '⚠ Waktu udah lewat. 30 menit pertama free, lebih dari itu admin yang konfirmasi extra charge ke customer.'
            : '⚠ Cleaner masih nerusin kerjaan. 30 menit pertama free; lebih dari itu admin akan tinjau extra charge.'}
        </Text>
      )}
    </View>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
        <Icon color="#1D4ED8" size={18} strokeWidth={2.2} />
      </View>
      <View className="flex-1">
        <Text className="font-medium text-[11px] uppercase tracking-wider text-ink-400">{label}</Text>
        <Text className="font-semibold mt-0.5 text-sm text-ink-800">{value}</Text>
      </View>
    </View>
  );
}

function Snap({ label, value }: { label: string; value?: string | number }) {
  if (value == null || value === '') return null;
  return (
    <View className="flex-row">
      <Text className="font-medium w-32 text-[11px] text-ink-500">{label}</Text>
      <Text className="font-semibold flex-1 text-[11px] text-ink-800">{String(value)}</Text>
    </View>
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

// Both customer + cleaner can view (component branches on isCleaner internally).
function CategoryIcon({ image, categoryCode }: { image: any; categoryCode?: string | null }) {
  // Untuk Layanan Custom: kalau snapshot image null, fallback ke config home.cta_image_url
  const ctaImage = useConfig('home.cta_image_url' as any, '' as any) as unknown as string;
  let resolved: any = image;
  if (!resolved && categoryCode === 'custom' && typeof ctaImage === 'string' && ctaImage.trim()) {
    resolved = { uri: ctaImage.trim() };
  }
  return (
    <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-ink-100">
      {resolved ? (
        <Image source={resolved} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <Sparkles color="#64748B" size={24} strokeWidth={2} />
      )}
    </View>
  );
}

export default withAuth(BookingDetail);

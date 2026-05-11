import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
  XCircle,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WaIcon } from '../../src/components/BrandIcon';
import { BookingPhotos } from '../../src/components/BookingPhotos';
import { BookingTimeline } from '../../src/components/BookingTimeline';
import { DisputeFormModal } from '../../src/components/DisputeFormModal';
import { RatingFormModal } from '../../src/components/RatingFormModal';
import { api } from '../../src/lib/api';
import { useT } from '../../src/lib/i18n';
import { formatRupiah } from '../../src/data/catalog';
import { useModeStore } from '../../src/stores/mode';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  type BookingStatus,
  useBookingsStore,
} from '../../src/stores/bookings';
import { toast } from '../../src/stores/ui';

const FREE_CANCEL_WINDOW_SEC = 10;
const PENALTY_PCT = 0.25;

const TIMELINE_PACKAGE: { status: BookingStatus; label: string }[] = [
  { status: 'searching', label: 'Mencari Cleaner' },
  { status: 'matched', label: 'Cleaner Ditemukan' },
  { status: 'on_the_way', label: 'Menuju Lokasi' },
  { status: 'in_progress', label: 'Sedang Dikerjakan' },
  { status: 'completed', label: 'Selesai' },
];

const TIMELINE_WA: { status: BookingStatus; label: string }[] = [
  { status: 'wa_survey_pending', label: 'Menunggu CS Hubungi' },
  { status: 'pending_payment', label: 'Quote Siap, Tunggu Bayar' },
  { status: 'searching', label: 'Mencari Cleaner' },
  { status: 'matched', label: 'Cleaner Ditemukan' },
  { status: 'completed', label: 'Selesai' },
];

function BookingDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === id));
  const cancel = useBookingsStore((s) => s.cancel);
  const setStatus = useBookingsStore((s) => s.setStatus);
  const markPaid = useBookingsStore((s) => s.markPaid);
  const mode = useModeStore((s) => s.mode);
  const isCleaner = mode === 'freelancer';
  const [showDispute, setShowDispute] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const t = useT();

  // Cleaner advance status — pakai API kalau bukan local-only booking
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
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal update status');
    } finally { setAdvancing(false); }
  }

  // Check if booking already rated
  useEffect(() => {
    if (!id || id.startsWith('bk_') || booking?.status !== 'completed') return;
    api.get(`/ratings/booking/${id}`).then((r) => {
      if (r.data?.data) setHasRated(true);
    }).catch(() => {});
  }, [id, booking?.status]);
  // Dispute hanya bisa dilaporkan setelah booking ada cleaner_id (matched/in_progress/completed)
  const canDispute = booking
    && !id?.startsWith('bk_')
    && ['matched', 'on_the_way', 'in_progress', 'completed'].includes(booking.status);

  if (!booking) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans text-ink-500">Pesanan tidak ditemukan</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="font-semibold text-brand-600">Kembali</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const color = STATUS_COLOR[booking.status];
  const timeline = booking.pricingMode === 'wa_survey' ? TIMELINE_WA : TIMELINE_PACKAGE;
  const currentIdx = timeline.findIndex((t) => t.status === booking.status);

  // Live elapsed time saat status searching → countdown 15 menit untuk fallback ke WA
  const SEARCH_TIMEOUT_SEC = 15 * 60;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (booking.status !== 'searching') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [booking.status]);
  const elapsedSec = booking.status === 'searching' ? Math.floor((now - booking.createdAt) / 1000) : 0;
  const remainingSec = Math.max(0, SEARCH_TIMEOUT_SEC - elapsedSec);
  const minLeft = Math.floor(remainingSec / 60);
  const secLeft = remainingSec % 60;
  const searchTimeout = booking.status === 'searching' && remainingSec === 0;

  // Poll backend untuk live broadcastedTo + canonical timeout (server source of truth)
  const [broadcastedTo, setBroadcastedTo] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!id || booking?.status !== 'searching' || id.startsWith('bk_')) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await api.get(`/bookings/${id}/search-status`);
        const d = r.data?.data ?? r.data;
        if (!cancelled) setBroadcastedTo(Number(d?.broadcastedTo ?? 0));
      } catch { /* silent */ }
    }
    void poll();
    const t = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id, booking?.status]);

  // Free cancel window countdown (10s setelah bayar)
  const paidElapsedSec = booking.paidAt ? Math.floor((now - booking.paidAt) / 1000) : 0;
  const freeCancelLeft = Math.max(0, FREE_CANCEL_WINDOW_SEC - paidElapsedSec);
  const inFreeCancelWindow = booking.paidAt && freeCancelLeft > 0;

  // Policy cancel: 10s dari paidAt = gratis, lewat itu kena 25%.
  // (Production: window 5 menit, sesuai PRD `08-wallet-and-withdrawal.md`)
  function onCancel() {
    if (!booking) return;
    // Belum bayar → cancel langsung tanpa penalty
    if (booking.status === 'pending_payment' || !booking.paidAt) {
      Alert.alert('Batalkan Pesanan?', 'Belum dibayar — gratis batal.', [
        { text: 'Tidak' },
        {
          text: 'Ya, batalkan',
          style: 'destructive',
          onPress: () => cancel(booking.id, booking.totalPrice),
        },
      ]);
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
        `Lewat ${FREE_CANCEL_WINDOW_SEC}s setelah bayar — kena potongan ${PENALTY_PCT * 100}%.\n\nTotal: ${formatRupiah(booking.totalPrice)}\nPotongan: -${formatRupiah(penalty)}\nRefund: ${formatRupiah(refund)}`,
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
    // Local-only booking (belum sync ke server) → fall back ke mock pay
    if (booking.id.startsWith('bk_')) {
      markPaid(booking.id);
      toast.success('Pembayaran berhasil (offline mode) — mencari cleaner…');
      return;
    }
    router.push({ pathname: '/payment/[bookingId]', params: { bookingId: booking.id } });
  }

  const modeLabel =
    booking.pricingMode === 'package'
      ? booking.packageName ? `Paket Tetap · ${booking.packageName}` : 'Paket Tetap'
      : booking.pricingMode === 'hourly'
        ? `Per Jam${booking.hourlyTierName ? ` · ${booking.hourlyTierName}` : ''}${booking.hours ? ` × ${booking.hours}j` : ''}`
        : 'Konsultasi WhatsApp';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-brand-700">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
            <Text className="font-bold ml-1 text-base text-white">Detail Pesanan</Text>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <View className="flex-row items-center gap-3">
              <View className="h-14 w-14 overflow-hidden rounded-xl bg-ink-100">
                <Image
                  source={booking.categoryImage}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-base text-ink-900">{booking.categoryName}</Text>
                <Text className="font-medium text-[11px] text-ink-500">{modeLabel}</Text>
                <Text className="font-medium text-[10px] text-ink-400">
                  ID: {booking.id.toUpperCase()}
                </Text>
              </View>
            </View>
            <View
              className="mt-3 self-start rounded-full px-3 py-1"
              style={{ backgroundColor: color.bg }}
            >
              <Text className="font-semibold text-xs" style={{ color: color.fg }}>
                {STATUS_LABEL[booking.status]}
              </Text>
            </View>
          </View>

          {/* Live searching indicator + countdown — customer only */}
          {!isCleaner && booking.status === 'searching' && !searchTimeout && (
            <View className="mx-4 mt-3">
              <SearchingCleanerView elapsedSec={elapsedSec} broadcastedTo={broadcastedTo} />
            </View>
          )}

          {/* Timeout — fallback ke WA, customer only */}
          {!isCleaner && searchTimeout && (
            <View className="mx-4 mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <View className="flex-row items-center gap-2">
                <AlertTriangle color="#B45309" size={18} strokeWidth={2.4} />
                <Text className="font-bold text-sm text-amber-900">
                  Belum ada cleaner ambil order
                </Text>
              </View>
              <Text className="font-sans mt-2 text-[12px] leading-[18px] text-amber-900">
                Sudah lebih dari 15 menit dan belum ada cleaner yang ambil. Bisa karena jam sibuk
                atau kurang cleaner di area kamu. Yuk lanjut konsultasi via WhatsApp — CS akan
                bantu cariin cleaner.
              </Text>
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  onPress={() => booking && cancel(booking.id)}
                  className="flex-1 items-center rounded-xl border border-ink-300 bg-white py-2.5"
                >
                  <Text className="font-semibold text-xs text-ink-700">Batalkan Order</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/booking/wa-survey')}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-success py-2.5"
                >
                  <View className="h-4 w-4 items-center justify-center rounded-full bg-white">
                    <WaIcon size={11} />
                  </View>
                  <Text className="font-bold text-xs text-white">Chat ke WA</Text>
                </Pressable>
              </View>
            </View>
          )}

          {booking.status !== 'canceled' && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-3 text-xs uppercase tracking-wider text-ink-400">
                Status Pesanan
              </Text>
              {timeline.map((t, i) => {
                const done = i <= currentIdx;
                const active = i === currentIdx;
                return (
                  <View key={t.status} className="flex-row gap-3">
                    <View className="items-center">
                      <View
                        className={`h-7 w-7 items-center justify-center rounded-full ${
                          done ? 'bg-brand-600' : 'bg-ink-200'
                        }`}
                      >
                        {done ? (
                          <Check color="white" size={14} strokeWidth={3} />
                        ) : (
                          <View className="h-2 w-2 rounded-full bg-ink-400" />
                        )}
                      </View>
                      {i < timeline.length - 1 && (
                        <View className={`my-1 h-6 w-0.5 ${done ? 'bg-brand-600' : 'bg-ink-200'}`} />
                      )}
                    </View>
                    <Text
                      className={`pt-1 ${
                        active
                          ? 'font-bold text-sm text-brand-700'
                          : done
                            ? 'font-semibold text-sm text-ink-800'
                            : 'font-sans text-sm text-ink-400'
                      }`}
                    >
                      {t.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
            <Text className="font-semibold mb-3 text-xs uppercase tracking-wider text-ink-400">
              Detail
            </Text>
            <View className="gap-3">
              <Detail icon={Calendar} label="Jadwal" value={booking.scheduledAt} />
              <Detail icon={MapPin} label="Alamat" value={booking.addressLine} />
              {booking.pricingMode === 'hourly' && booking.hours && (
                <Detail icon={Clock} label="Durasi" value={`${booking.hours} jam`} />
              )}
            </View>
          </View>

          {booking.formSnapshot && booking.pricingMode === 'package' && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-3 text-xs uppercase tracking-wider text-ink-400">
                Detail Properti (Snapshot)
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
                {booking.formSnapshot.notes && (
                  <Snap label="Catatan" value={booking.formSnapshot.notes} />
                )}
              </View>
            </View>
          )}

          {booking.formSnapshot?.notes && booking.pricingMode === 'hourly' && (
            <View className="mx-4 mt-3 rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-2 text-xs uppercase tracking-wider text-ink-400">
                Checklist Tugas
              </Text>
              <Text className="font-sans text-sm text-ink-700">{booking.formSnapshot.notes}</Text>
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

          {booking.totalPrice > 0 && (
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
              <BookingTimeline bookingId={booking.id} />
            </View>
          )}

          {!booking.id.startsWith('bk_') && ['matched', 'on_the_way', 'in_progress', 'completed'].includes(booking.status) && (
            <View className="mx-4 mt-3">
              <BookingPhotos bookingId={booking.id} isCleaner={isCleaner} status={booking.status} />
            </View>
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
                  <Pressable onPress={onCancel} className="mt-2 py-2">
                    <Text className="font-semibold text-center text-xs text-ink-500">
                      {t('booking.cancel')}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="flex-row gap-2 p-4">
                  <Pressable
                    onPress={onCancel}
                    className="flex-row items-center justify-center gap-1.5 rounded-2xl border border-danger px-4 py-3.5"
                  >
                    <XCircle color="#DC2626" size={16} strokeWidth={2.2} />
                    <Text className="font-semibold text-sm text-danger">
                      {inFreeCancelWindow ? t('bd.free_cancel_left', { sec: freeCancelLeft }) : t('bd.cancel_btn')}
                    </Text>
                  </Pressable>
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
              )}
            </SafeAreaView>
          </View>
        )}

        {/* CLEANER bottom actions — kalau job ini di-take dia */}
        {isCleaner &&
          booking.status !== 'canceled' &&
          booking.status !== 'completed' &&
          booking.cleanerName && (
            <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
              <SafeAreaView edges={['bottom']}>
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
                      onPress={() => advanceStatus('in_progress')}
                      disabled={advancing}
                      className={`flex-1 items-center rounded-2xl py-3.5 ${advancing ? 'bg-brand-400' : 'bg-brand-600'}`}
                    >
                      <Text className="font-bold text-sm text-white">{advancing ? t('auth.processing') : t('cleaner.start_work')}</Text>
                    </Pressable>
                  )}
                  {booking.status === 'in_progress' && (
                    <Pressable
                      onPress={() => advanceStatus('completed')}
                      disabled={advancing}
                      className={`flex-1 items-center rounded-2xl py-3.5 ${advancing ? 'bg-success/60' : 'bg-success'}`}
                    >
                      <Text className="font-bold text-sm text-white">{advancing ? t('auth.processing') : t('cleaner.finish')}</Text>
                    </Pressable>
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
                  <View className="flex-row items-center justify-center gap-1.5 rounded-2xl bg-success/10 py-3.5">
                    <CheckCircle2 color="#047857" size={16} strokeWidth={2.4} />
                    <Text className="font-semibold text-sm text-success">{t('booking.already_rated')}</Text>
                  </View>
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

      {canDispute && (
        <DisputeFormModal
          bookingId={booking.id}
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

export default withAuth(BookingDetail, 'customer');

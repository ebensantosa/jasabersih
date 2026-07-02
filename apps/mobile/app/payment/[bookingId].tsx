import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { withAuth } from '../../src/components/AuthGate';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Building2, CheckCircle2, Copy, RefreshCw, Wallet as WalletIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import QRCode from 'react-native-qrcode-svg';
import { Image } from 'expo-image';

import { api } from '../../src/lib/api';
import { useBookingsStore } from '../../src/stores/bookings';
import { toast } from '../../src/stores/ui';
import { formatRupiah } from '../../src/data/catalog';
import { safeBack } from '../../src/lib/safeBack';

type DirectResult = {
  paymentId: string;
  amount: number;
  senderBank: string;
  senderBankType: 'virtual_account' | 'qris' | 'wallet_account' | 'bank_transfer' | 'retail' | 'credit_card';
  accountNumber: string | null;
  qrString: string | null;
  qrUrl?: string | null;
  nmid?: string | null;
  walletUrl?: string | null;
  expiredAt: string | null;
  paymentUrl?: string | null;
  fellBackToCheckout?: boolean;
};

const VA_METHODS: { code: string; name: string; logo: any }[] = [
  { code: 'bca', name: 'BCA Virtual Account', logo: require('../../assets/payment-logos/logo-bca.png') },
  { code: 'mandiri', name: 'Mandiri Virtual Account', logo: require('../../assets/payment-logos/logo-mandiri.png') },
  { code: 'bni', name: 'BNI Virtual Account', logo: require('../../assets/payment-logos/logo-bni.png') },
  { code: 'bri', name: 'BRI Virtual Account', logo: require('../../assets/payment-logos/logo-bri.png') },
  { code: 'cimb', name: 'CIMB Niaga Virtual Account', logo: require('../../assets/payment-logos/cimb.png') },
  { code: 'permata', name: 'Permata Virtual Account', logo: require('../../assets/payment-logos/logo-permatabank.png') },
  { code: 'bsi', name: 'BSI Virtual Account', logo: require('../../assets/payment-logos/bsi-logo.png') },
  { code: 'danamon', name: 'Danamon Virtual Account', logo: require('../../assets/payment-logos/logo-danamon.png') },
  { code: 'seabank', name: 'SeaBank Virtual Account', logo: require('../../assets/payment-logos/sea-bank.png') },
] as const;

const EWALLET_METHODS: { code: string; name: string; logo: any }[] = [
  { code: 'gopay', name: 'GoPay', logo: require('../../assets/payment-logos/gopay-192x92-1.png') },
  { code: 'ovo', name: 'OVO', logo: require('../../assets/payment-logos/logo-ovo.png') },
  { code: 'dana', name: 'DANA', logo: require('../../assets/payment-logos/logo-dana.png') },
  { code: 'shopeepay', name: 'ShopeePay', logo: require('../../assets/payment-logos/shopeepay.png') },
  { code: 'linkaja', name: 'LinkAja', logo: require('../../assets/payment-logos/logo-linkaja.png') },
] as const;

const TRANSFER_BANK_METHODS: { code: string; name: string; label: string; logo?: any }[] = [
  { code: 'bri', name: 'Transfer dari BRI', label: 'BRI', logo: require('../../assets/payment-logos/logo-bri.png') },
  { code: 'dbs', name: 'Transfer dari DBS', label: 'DBS' },
  { code: 'muamalat', name: 'Transfer dari Muamalat', label: 'Muamalat' },
  { code: 'bni_syariah', name: 'Transfer dari BNI Syariah', label: 'BNI Syariah' },
] as const;

const RETAIL_METHODS: { code: string; name: string; label: string; logo?: any }[] = [
  { code: 'alfamart', name: 'Alfamart', label: 'Alfamart', logo: require('../../assets/payment-logos/alfamart.png') },
  { code: 'indomaret', name: 'Indomaret', label: 'Indomaret', logo: require('../../assets/payment-logos/indomaret.png') },
] as const;

const CARD_METHODS: { code: string; name: string; label: string; logo?: any }[] = [
  { code: 'credit_card', name: 'Kartu Kredit / Debit', label: 'CARD', logo: require('../../assets/payment-logos/debit.png') },
] as const;

const QRIS_LOGO = require('../../assets/payment-logos/qris.png');

type CheckoutMethod = {
  code: string;
  name: string;
  group: 'qris' | 'virtual_account' | 'bank_transfer' | 'ewallet' | 'retail' | 'credit_card';
  senderBank: string;
  senderBankType: DirectResult['senderBankType'];
  status: 'normal' | 'delayed' | 'down';
  message: string;
  description?: string;
  recommended?: boolean;
};

const METHOD_META: Record<string, { logo?: any; label?: string }> = {
  qris: { logo: QRIS_LOGO, label: 'QRIS' },
  bca: { logo: require('../../assets/payment-logos/logo-bca.png'), label: 'BCA' },
  mandiri: { logo: require('../../assets/payment-logos/logo-mandiri.png'), label: 'Mandiri' },
  bni: { logo: require('../../assets/payment-logos/logo-bni.png'), label: 'BNI' },
  bri: { logo: require('../../assets/payment-logos/logo-bri.png'), label: 'BRI' },
  cimb: { logo: require('../../assets/payment-logos/cimb.png'), label: 'CIMB' },
  permata: { logo: require('../../assets/payment-logos/logo-permatabank.png'), label: 'Permata' },
  bsi: { logo: require('../../assets/payment-logos/bsi-logo.png'), label: 'BSI' },
  danamon: { logo: require('../../assets/payment-logos/logo-danamon.png'), label: 'Danamon' },
  seabank: { logo: require('../../assets/payment-logos/sea-bank.png'), label: 'SeaBank' },
  btn: { logo: require('../../assets/payment-logos/BTN.png'), label: 'BTN' },
  mega: { logo: require('../../assets/payment-logos/logo-mega.png'), label: 'Mega' },
  ovo: { logo: require('../../assets/payment-logos/logo-ovo.png'), label: 'OVO' },
  dana: { logo: require('../../assets/payment-logos/logo-dana.png'), label: 'DANA' },
  gopay: { logo: require('../../assets/payment-logos/gopay-192x92-1.png'), label: 'GoPay' },
  shopeepay: { logo: require('../../assets/payment-logos/shopeepay.png'), label: 'ShopeePay' },
  linkaja: { logo: require('../../assets/payment-logos/logo-linkaja.png'), label: 'LinkAja' },
  dbs: { label: 'DBS' },
  muamalat: { label: 'Muamalat' },
  bni_syariah: { label: 'BNI Syariah' },
  alfamart: { label: 'Alfamart' },
  indomaret: { label: 'Indomaret' },
  credit_card: { label: 'Card' },
};

function parseExpiredAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (value.includes('T')) {
    const isoDate = new Date(value);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
  }
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, year, month, day, hour, minute, second] = m;
  const localDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
    0,
  );
  return Number.isNaN(localDate.getTime()) ? null : localDate;
}

function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingId: string; extra?: string; amount?: string }>();
  const bookingId = params.bookingId;
  // Extra mode: bayar tagihan tambahan (upcharge), tip, atau overtime.
  // Format: extra="upcharge:UUID" | extra="tip" | extra="overtime:0.5"; amount=Rp untuk tip/overtime.
  const extraType: 'upcharge' | 'tip' | 'overtime' | null = (() => {
    if (!params.extra) return null;
    const head = params.extra.split(':')[0];
    if (head === 'upcharge') return 'upcharge';
    if (head === 'tip') return 'tip';
    if (head === 'overtime') return 'overtime';
    return null;
  })();
  const extraUpchargeId = extraType === 'upcharge' ? (params.extra?.split(':')[1] ?? null) : null;
  const extraDurationHours = extraType === 'overtime' ? Number(params.extra?.split(':')[1] ?? 0) : null;
  const extraAmount = params.amount ? Number(params.amount) : 0;

  const booking = useBookingsStore((s) => s.list.find((b) => b.id === bookingId));
  const syncBookings = useBookingsStore((s) => s.syncFromApi);
  const fetchOne = useBookingsStore((s) => s.fetchOne);

  const [creating, setCreating] = useState(false);
  const [pickingCode, setPickingCode] = useState<string | null>(null);
  const [direct, setDirect] = useState<DirectResult | null>(null);
  const [paid, setPaid] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [upchargeAmount, setUpchargeAmount] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalToPay = extraType === 'upcharge' ? upchargeAmount : (extraType === 'tip' || extraType === 'overtime') ? extraAmount : (booking?.totalPrice ?? 0);
  const headerLabel = extraType === 'upcharge' ? 'Bayar Charge Tambahan' : extraType === 'tip' ? 'Bayar Tip Cleaner' : extraType === 'overtime' ? `Perpanjang +${extraDurationHours}j` : 'Pilih Metode';

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // AppState listener - kalau user balik dari Flip checkout / e-wallet redirect,
  // langsung force sync. Tanpa ini user mungkin nunggu sampai 4s poll berikutnya.
  useEffect(() => {
    if (!direct || !bookingId) return;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      try {
        if (!extraType) {
          await api.post(`/payments/flip/sync/${bookingId}`).catch(() => {});
          await fetchOne(String(bookingId));
          const latest = useBookingsStore.getState().list.find((b) => b.id === bookingId);
          if (latest && latest.status !== 'pending_payment') { finishAndRedirect(); return; }
        }
        const r = await api.get(`/payments/${direct.paymentId}`);
        const status = (r.data?.data ?? r.data)?.status;
        if (status === 'paid') finishAndRedirect();
      } catch {}
    });
    return () => sub.remove();
  }, [direct, bookingId, fetchOne]);

  function finishAndRedirect() {
    setPaid(true);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    void syncBookings();
    // extraType (tip/upcharge/overtime): dikunjungi via push dari booking/[id],
    // jadi cukup back() — replace() akan duplikat booking/[id] di stack.
    // Initial payment: form booking sudah di-replace sebelumnya, perlu navigate ke booking detail.
    setTimeout(() => {
      if (extraType) {
        router.back();
      } else {
        router.replace({ pathname: '/booking/[id]', params: { id: bookingId } });
      }
    }, 1500);
  }

  // Kalau user back dari VA detail (direct → null), stop polling.
  // Tanpa ini interval terus jalan walau user udah balik ke method picker → API call infinite.
  useEffect(() => {
    if (!direct && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [direct]);

  // Fetch upcharge amount kalau mode extra=upcharge
  useEffect(() => {
    if (extraType !== 'upcharge' || !extraUpchargeId || !bookingId) return;
    void api.get(`/bookings/${bookingId}/upcharges`).then((r) => {
      const list = (r.data?.data ?? r.data ?? []) as any[];
      const found = list.find((u) => u.id === extraUpchargeId);
      if (found) setUpchargeAmount(Number(found.amount ?? 0));
    }).catch(() => {});
  }, [bookingId, extraType, extraUpchargeId]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.get('/customer/wallet');
        setWalletBalance(Number((r.data?.data ?? r.data)?.balance ?? 0));
      } catch { /* ignore */ }
      try {
        const { storage } = await import('../../src/lib/storage');
        const key = `useCredit:${bookingId}`;
        const flag = storage.getString(key) ?? await AsyncStorage.getItem(key) ?? undefined;
        if (flag === '1') setUseCredit(true);
        storage.delete(key);
        const allKeys = await AsyncStorage.getAllKeys();
        const staleKeys = allKeys.filter((item) => item.startsWith('useCredit:'));
        if (staleKeys.length > 0) await AsyncStorage.multiRemove(staleKeys);
      } catch { /* ignore */ }
    })();
  }, [bookingId]);

  // Fetch booking terbaru saat layar terbuka — pastikan status masih pending_payment.
  // Jika ternyata sudah dibayar (dari sumber lain), langsung redirect ke booking detail.
  useEffect(() => {
    if (!bookingId || extraType) return;
    void fetchOne(String(bookingId)).then(() => {
      const b = useBookingsStore.getState().list.find((x) => x.id === bookingId);
      if (b && b.status !== 'pending_payment') finishAndRedirect();
    }).catch(() => {});
  }, [bookingId]);

  async function payWithSaldo() {
    if (!bookingId) return;
    setCreating(true);
    try {
      if (extraType === 'upcharge' && extraUpchargeId) {
        await api.post(`/bookings/${bookingId}/upcharges/${extraUpchargeId}/approve`);
        toast.success('Charge tambahan disetujui');
      } else if (extraType === 'tip') {
        await api.post(`/bookings/${bookingId}/tip`, { amount: extraAmount });
        toast.success('Tip terkirim');
      } else if (booking) {
        await api.post(`/bookings/${bookingId}/pay`, { useCredit: true });
      } else { return; }
      finishAndRedirect();
    } catch (e: any) {
      // Kalau booking ternyata sudah dibayar (race condition / double tap),
      // re-fetch status dan redirect ke booking detail tanpa error.
      if (!extraType) {
        try {
          await fetchOne(String(bookingId));
          const latest = useBookingsStore.getState().list.find((b) => b.id === bookingId);
          if (latest && latest.status !== 'pending_payment') {
            finishAndRedirect();
            return;
          }
        } catch { /* ignore */ }
      }
      toast.error(e?.response?.data?.error?.message ?? 'Gagal bayar dengan saldo');
    } finally {
      setCreating(false);
    }
  }

  const [useCredit, setUseCredit] = useState(false);

  async function pickMethod(senderBank: string, senderBankType: DirectResult['senderBankType']) {
    if (!bookingId) return;
    // Clear interval lama (kalau user pilih method baru tanpa back dulu)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPickingCode(senderBank);
    setCreating(true);
    try {
      const endpoint = extraType ? '/payments/flip/create-direct-extra' : '/payments/flip/create-direct';
      const payload: any = extraType
        ? {
            bookingId,
            type: extraType,
            ...(extraType === 'upcharge' ? { upchargeId: extraUpchargeId } : extraType === 'overtime' ? { durationHours: extraDurationHours } : { tipAmount: extraAmount }),
            senderBank, senderBankType, useCredit,
          }
        : { bookingId, senderBank, senderBankType, useCredit };
      const res = await api.post(endpoint, payload);
      // Wallet covers full - backend balikin paidViaWallet=true, gak ada Flip QR.
      if (res.data?.data?.paidViaWallet || res.data?.paidViaWallet) {
        finishAndRedirect();
        return;
      }
      const data: DirectResult = res.data?.data ?? res.data;
      const hasNativeInstructions =
        Boolean(data.accountNumber)
        || Boolean(data.qrString)
        || Boolean(data.qrUrl)
        || Boolean(data.walletUrl);

      // Retail / Credit Card: gak ada native VA/QR, pakai hosted checkout (paymentUrl).
      // Open external/in-app browser ke Flip page, polling tetap jalan untuk detect bayar.
      const needsHostedCheckout = ['retail', 'credit_card'].includes(senderBankType);
      if (needsHostedCheckout && data.paymentUrl) {
        setDirect(data);
        try { await Linking.openURL(data.paymentUrl); } catch {}
      } else if (data.fellBackToCheckout || !hasNativeInstructions) {
        if (data.paymentUrl) {
          // Tetep show direct view + open URL untuk method yg backend fallback ke checkout
          setDirect(data);
          try { await Linking.openURL(data.paymentUrl); } catch {}
        } else {
          throw new Error('Metode ini belum bisa ditampilkan langsung di aplikasi. Silakan pilih QRIS atau Virtual Account.');
        }
      } else {
        setDirect(data);
      }
      try {
        const { Track } = await import('../../src/lib/analytics');
        Track.paymentStarted(String(bookingId), senderBank, data.amount);
      } catch {}
      // Poll status. Extra mode: cuma cek payment status karena booking.status gak berubah.
      // Skip kalau tab/app gak visible — hemat bandwidth & cegah loop saat user tinggal lama.
      pollRef.current = setInterval(async () => {
        const { AppState, Platform } = await import('react-native');
        if (AppState.currentState !== 'active') return;
        if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        try {
          if (!extraType) {
            await fetchOne(String(bookingId));
            const latestBooking = useBookingsStore.getState().list.find((b) => b.id === bookingId);
            if (latestBooking && latestBooking.status !== 'pending_payment') {
              finishAndRedirect();
              return;
            }
          }
          const r = await api.get(`/payments/${data.paymentId}`);
          const status = (r.data?.data ?? r.data)?.status;
          if (status === 'paid') {
            finishAndRedirect();
            try {
              const { Track } = await import('../../src/lib/analytics');
              Track.paymentSuccess(String(bookingId), data.senderBank, data.amount);
            } catch {}
          } else if (['failed', 'cancelled', 'expired'].includes(status)) {
            toast.error('Pembayaran gagal/expired. Coba lagi.');
            if (pollRef.current) clearInterval(pollRef.current);
            try {
              const { Track } = await import('../../src/lib/analytics');
              Track.paymentFailed(String(bookingId), data.senderBank, status);
            } catch {}
            setDirect(null);
          }
        } catch {}
      }, 10_000);
    } catch (e: any) {
      const raw = e?.response?.data?.error?.message ?? e?.message ?? 'Gagal create pembayaran';
      // Convert raw Flip error to user-friendly Indonesian message
      let friendly = String(raw);
      if (/IP is not whitelisted/i.test(friendly)) {
        friendly = 'Layanan pembayaran sedang tidak aktif. Tim kami sudah diberi tahu, mohon coba lagi nanti.';
      } else if (/401001|Authentication failed/i.test(friendly)) {
        friendly = 'Layanan pembayaran sementara bermasalah. Mohon coba beberapa menit lagi.';
      } else if (/not enabled|is not enabled/i.test(friendly)) {
        friendly = 'Metode pembayaran ini belum aktif di sistem kami. Mohon pilih QRIS untuk pembayaran semua bank/e-wallet.';
      } else if (/VALIDATION_ERROR/i.test(friendly)) {
        friendly = 'Data pembayaran tidak valid. Coba pilih metode lain atau hubungi CS.';
      } else if (/^Flip:|provider/i.test(friendly)) {
        // Fallback: parse JSON, ambil .message kalau ada
        try {
          const inner = JSON.parse(friendly.replace(/^Flip:\s*/, ''));
          friendly = inner?.message ?? inner?.error?.message ?? 'Pembayaran sementara bermasalah. Coba lagi nanti.';
        } catch { friendly = 'Pembayaran sementara bermasalah. Coba lagi nanti.'; }
      }
      toast.error(friendly);
    } finally {
      setCreating(false);
      setPickingCode(null);
    }
  }

  useEffect(() => {
    if (extraType) return; // Extra mode tidak terikat booking.status
    if (!booking || paid) return;
    if (booking.status !== 'pending_payment') {
      finishAndRedirect();
    }
  }, [booking?.status, paid, extraType]);

  async function copyVa() {
    if (!direct?.accountNumber) return;
    await Clipboard.setStringAsync(direct.accountNumber);
    toast.success('Nomor VA disalin');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => (direct ? setDirect(null) : safeBack())} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <View className="flex-1">
            <Text className="font-bold text-base text-ink-900">{paid ? 'Pembayaran Diterima' : direct ? 'Selesaikan Pembayaran' : headerLabel}</Text>
            {totalToPay > 0 && <Text className="font-sans text-[11px] text-ink-500">Total: {formatRupiah(totalToPay)}</Text>}
          </View>
        </View>

        {/* Loading overlay saat create payment */}
        {creating && (
          <Modal transparent animationType="fade" visible>
            <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 28, alignItems: 'center', minWidth: 260, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 }}>
                <ActivityIndicator color="#1D4ED8" size="large" />
                <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '700', color: '#0F172A' }}>Membuat Pembayaran</Text>
                <Text style={{ marginTop: 6, fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18 }}>
                  Mohon tunggu sebentar.
                </Text>
              </View>
            </View>
          </Modal>
        )}

        {paid ? (
          <PaidView />
        ) : direct ? (
          <PaymentInstructions
            data={direct}
            onCopy={copyVa}
            bookingId={String(bookingId ?? '')}
            onManualSync={async () => {
              if (!bookingId || !direct) return;
              try {
                // Trigger backend ke Flip ambil status fresh (instead of polling 4s).
                // Untuk payment booking utama, booking status boleh dipakai sebagai shortcut.
                // Mode ekstra harus menunggu status payment yang benar dari provider.
                if (!extraType) {
                  await api.post(`/payments/flip/sync/${bookingId}`).catch(() => {});
                  await fetchOne(String(bookingId));
                  const latest = useBookingsStore.getState().list.find((b) => b.id === bookingId);
                  if (latest && latest.status !== 'pending_payment') { finishAndRedirect(); return; }
                }
                const r = await api.get(`/payments/${direct.paymentId}`);
                const status = (r.data?.data ?? r.data)?.status;
                if (status === 'paid') { finishAndRedirect(); return; }
                toast.info('Pembayaran belum masuk. Halaman akan auto-redirect kalau status sudah lunas.');
              } catch {
                toast.error('Gagal cek status. Coba lagi sebentar.');
              }
            }}
          />
        ) : (
          <MethodPicker
            disabled={creating}
            pickingCode={pickingCode}
            onPick={pickMethod}
            walletBalance={walletBalance}
            total={totalToPay}
            onPaySaldo={payWithSaldo}
            useCredit={useCredit}
            setUseCredit={setUseCredit}
          />
        )}
      </SafeAreaView>
    </>
  );
}

function CountdownBadge({ expiredAt }: { expiredAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Parse Flip's "YYYY-MM-DD HH:mm" sebagai WIB (server timezone)
  const target = parseExpiredAt(expiredAt)?.getTime() ?? null;
  if (!target) return null;
  const remainingMs = Math.max(0, target - now);
  const totalSec = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const display = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  const expired = remainingMs === 0;
  const urgent = !expired && remainingMs < 5 * 60_000; // < 5 menit
  return (
    <View
      style={{
        minWidth: 74,
        alignItems: 'center',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
        backgroundColor: expired ? '#FEE2E2' : urgent ? '#DBEAFE' : '#D1FAE5',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '800', color: expired ? '#BE123C' : urgent ? '#1D4ED8' : '#047857', fontVariant: ['tabular-nums'] }}>
        {expired ? 'Expired' : display}
      </Text>
    </View>
  );
}

function MethodPicker({
  disabled,
  pickingCode,
  onPick,
  walletBalance,
  total,
  onPaySaldo,
  useCredit,
  setUseCredit,
}: {
  disabled: boolean;
  pickingCode: string | null;
  onPick: (bank: string, type: DirectResult['senderBankType']) => void;
  walletBalance: number;
  total: number;
  onPaySaldo: () => void;
  useCredit: boolean;
  setUseCredit: (v: boolean) => void;
}) {
  const fullSaldo = walletBalance >= total && total > 0;
  const partialSaldo = walletBalance > 0 && walletBalance < total;
  const creditUsed = useCredit ? Math.min(walletBalance, total) : 0;
  const remaining = total - creditUsed;

  const [methods, setMethods] = useState<CheckoutMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.get('/payments/checkout-methods');
        setMethods((r.data?.data ?? r.data ?? []) as CheckoutMethod[]);
      } catch {
        setMethods([]);
      } finally {
        setLoadingMethods(false);
      }
    })();
  }, []);

  const getMethod = (code: string) => methods.find((method) => method.senderBank === code || method.code === code.toUpperCase());
  const getStatus = (code: string): 'normal' | 'delayed' | 'down' => getMethod(code)?.status ?? 'normal';
  const getMessage = (code: string) => getMethod(code)?.message ?? '';
  // Flip VA minimum Rp 10.000 - hide VA section kalau remaining di bawah itu.
  // E-wallet & QRIS support nominal lebih kecil jadi tetap ditampilkan.
  const VA_MIN_AMOUNT = 10000;
  const belowVaMin = remaining > 0 && remaining < VA_MIN_AMOUNT;
  const vaMethods = belowVaMin ? [] : VA_METHODS.filter((method) => getMethod(method.code)?.senderBankType === 'virtual_account');
  const ewalletMethods = EWALLET_METHODS.filter((method) => getMethod(method.code)?.senderBankType === 'wallet_account');
  // Retail: min biasanya 10rb juga (sama dgn VA), skip kalau di bawah.
  const retailMethods = belowVaMin ? [] : RETAIL_METHODS.filter((method) => getMethod(method.code)?.senderBankType === 'retail');
  // Credit/Debit Card: min biasanya 10rb (Flip charge bigger). Skip kalau di bawah.
  const cardMethods = belowVaMin ? [] : CARD_METHODS.filter((method) => getMethod(method.code)?.senderBankType === 'credit_card');

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">Saldo Saya</Text>
        {walletBalance === 0 ? (
          <View className="flex-row items-center gap-3 rounded-2xl border border-ink-200 bg-ink-50 p-4" style={{ opacity: 0.6 }}>
            <View className="h-12 w-14 items-center justify-center rounded-xl bg-ink-200">
              <WalletIcon color="#94A3B8" size={20} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-sm text-ink-500">Pakai Saldo (Rp 0)</Text>
              <Text className="font-medium mt-0.5 text-[11px] text-ink-400">
                Saldo kosong. Silakan pilih metode pembayaran di bawah.
              </Text>
            </View>
            <View className="h-5 w-5 items-center justify-center rounded-full border-2 border-ink-300 bg-ink-100" />
          </View>
        ) : null}
        {walletBalance > 0 && (
          <>
          {fullSaldo ? (
            <>
            <Pressable
              disabled={disabled}
              onPress={onPaySaldo}
              className="flex-row items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4"
            >
              <View className="h-12 w-14 items-center justify-center rounded-xl bg-emerald-600">
                <WalletIcon color="white" size={20} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-sm text-emerald-900">Bayar dengan Saldo</Text>
                <Text className="font-medium mt-0.5 text-[11px] text-ink-600">
                  Tap untuk bayar lunas — tidak perlu pilih bank.
                </Text>
              </View>
            </Pressable>
            <View className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
              <View className="flex-row justify-between">
                <Text className="text-xs text-ink-600">Total pembayaran</Text>
                <Text className="text-xs text-ink-700">{formatRupiah(total)}</Text>
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs text-ink-600">Saldo kamu</Text>
                <Text className="text-xs text-emerald-700">{formatRupiah(walletBalance)}</Text>
              </View>
              <View className="flex-row justify-between mt-1 border-t border-emerald-200 pt-1">
                <Text className="text-xs font-bold text-ink-900">Sisa saldo setelah bayar</Text>
                <Text className="text-xs font-bold text-emerald-700">{formatRupiah(walletBalance - total)}</Text>
              </View>
            </View>
            </>
          ) : (
            <Pressable
              disabled={disabled}
              onPress={() => setUseCredit(!useCredit)}
              className={`flex-row items-center gap-3 rounded-2xl border p-4 ${useCredit ? 'border-emerald-400 bg-emerald-50' : 'border-ink-200 bg-white'}`}
            >
              <View className={`h-12 w-14 items-center justify-center rounded-xl ${useCredit ? 'bg-emerald-600' : 'bg-ink-200'}`}>
                <WalletIcon color={useCredit ? 'white' : '#64748B'} size={20} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-sm text-ink-900">Pakai Saldo (Rp {walletBalance.toLocaleString('id-ID')})</Text>
                <Text className="font-medium mt-0.5 text-[11px] text-ink-600">
                  {useCredit ? `Potongan saldo ${formatRupiah(creditUsed)}. Sisa pembayaran ${formatRupiah(remaining)}.` : 'Gunakan saldo lebih dulu, lalu pilih metode pembayaran untuk sisanya.'}
                </Text>
              </View>
              <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${useCredit ? 'border-emerald-600 bg-emerald-600' : 'border-ink-300'}`}>
                {useCredit ? <View className="h-2 w-2 rounded-full bg-white" /> : null}
              </View>
            </Pressable>
          )}
          {(fullSaldo || partialSaldo) && useCredit && (
            <View className="mt-2 rounded-xl bg-ink-100 px-3 py-2">
              <View className="flex-row justify-between">
                <Text className="text-xs text-ink-600">Total</Text>
                <Text className="text-xs text-ink-700">{formatRupiah(total)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-ink-600">Potong saldo</Text>
                <Text className="text-xs text-emerald-600">-{formatRupiah(creditUsed)}</Text>
              </View>
              <View className="mt-1 flex-row justify-between border-t border-ink-200 pt-1">
                <Text className="text-xs font-bold text-ink-900">Sisa pembayaran</Text>
                <Text className="text-sm font-bold text-ink-900">{formatRupiah(remaining)}</Text>
              </View>
            </View>
          )}
          </>
        )}
      </View>

      {getMethod('qris') && (
      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">QRIS</Text>
        {(() => {
          const st = getStatus('qris');
          const down = st === 'down';
          const delayed = st === 'delayed';
          return (
            <Pressable
              disabled={disabled || down}
              onPress={() => onPick('qris', 'qris')}
              className={`flex-row items-center gap-3 rounded-2xl p-4 ${down ? 'bg-ink-100 opacity-50' : 'bg-white'}`}
            >
              <View className={`h-12 w-14 items-center justify-center rounded-xl border ${down ? 'bg-ink-200 border-ink-300' : 'bg-white border-ink-100'}`}>
                <Image source={QRIS_LOGO} style={{ width: 40, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
              </View>
              <View className="flex-1">
                <Text className={`font-bold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>QRIS</Text>
                {down ? (
                  <Text className="font-bold mt-0.5 text-[11px] text-rose-600">{getMessage('qris') || 'Metode ini sedang tidak tersedia'}</Text>
                ) : delayed ? (
                  <Text className="font-bold mt-0.5 text-[11px] text-amber-600">Transaksi mungkin tertunda</Text>
                ) : (
                  <Text className="font-medium mt-0.5 text-[11px] text-ink-500">Scan QR dari e-wallet atau m-banking</Text>
                )}
              </View>
            </Pressable>
          );
        })()}
      </View>
      )}

      {belowVaMin && (
        <View className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Text className="font-bold text-[11px] text-amber-900">Transfer Bank tidak tersedia untuk nominal ini</Text>
          <Text className="font-medium mt-1 text-[11px] text-amber-800">
            Minimum transaksi Virtual Account Rp 10.000. Silakan gunakan QRIS atau e-wallet untuk nominal kecil.
          </Text>
        </View>
      )}

      {vaMethods.length > 0 && (
      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">Transfer Bank (Virtual Account)</Text>
        <View className="overflow-hidden rounded-2xl bg-white">
          {vaMethods.map((m, i) => {
            const st = getStatus(m.code);
            const down = st === 'down';
            const delayed = st === 'delayed';
            return (
              <Pressable
                key={m.code}
                disabled={disabled || down}
                onPress={() => onPick(m.code, 'virtual_account')}
                className={`flex-row items-center gap-3 p-4 ${i > 0 ? 'border-t border-ink-100' : ''} ${down ? 'opacity-50 bg-ink-50' : ''}`}
              >
                <View className={`h-10 w-14 items-center justify-center rounded border ${down ? 'bg-ink-200 border-ink-300' : 'bg-white border-ink-100'}`}>
                  <Image source={m.logo} style={{ width: 44, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
                </View>
                <View className="flex-1">
                  <Text className={`font-semibold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>{m.name}</Text>
                  {down && <Text className="font-bold text-[10px] text-rose-600 mt-0.5">{getMessage(m.code) || 'Metode ini sedang tidak tersedia'}</Text>}
                  {delayed && <Text className="font-bold text-[10px] text-amber-600 mt-0.5">Transaksi mungkin tertunda</Text>}
                </View>
                <Building2 color={down ? '#CBD5E1' : '#94A3B8'} size={16} />
              </Pressable>
            );
          })}
        </View>
      </View>
      )}

      {ewalletMethods.length > 0 && (
      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">E-Wallet (langsung)</Text>
        <View className="overflow-hidden rounded-2xl bg-white">
          {ewalletMethods.map((m, i) => {
            const st = getStatus(m.code);
            const down = st === 'down';
            const delayed = st === 'delayed';
            return (
              <Pressable
                key={m.code}
                disabled={disabled || down}
                onPress={() => onPick(m.code, 'wallet_account')}
                className={`flex-row items-center gap-3 p-4 ${i > 0 ? 'border-t border-ink-100' : ''} ${down ? 'opacity-50 bg-ink-50' : ''}`}
              >
                <View className={`h-10 w-14 items-center justify-center rounded border ${down ? 'bg-ink-200 border-ink-300' : 'bg-white border-ink-100'}`}>
                  <Image source={m.logo} style={{ width: 44, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
                </View>
                <View className="flex-1">
                  <Text className={`font-semibold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>{m.name}</Text>
                  {down && <Text className="font-bold text-[10px] text-rose-600 mt-0.5">{getMessage(m.code) || 'Metode ini sedang tidak tersedia'}</Text>}
                  {delayed && <Text className="font-bold text-[10px] text-amber-600 mt-0.5">Transaksi mungkin tertunda</Text>}
                </View>
                <WalletIcon color={down ? '#CBD5E1' : '#94A3B8'} size={16} />
              </Pressable>
            );
          })}
        </View>
      </View>
      )}

      {retailMethods.length > 0 && (
      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">Bayar di Minimarket</Text>
        <View className="overflow-hidden rounded-2xl bg-white">
          {retailMethods.map((m, i) => {
            const st = getStatus(m.code);
            const down = st === 'down';
            const delayed = st === 'delayed';
            return (
              <Pressable
                key={m.code}
                disabled={disabled || down}
                onPress={() => onPick(m.code, 'retail')}
                className={`flex-row items-center gap-3 p-4 ${i > 0 ? 'border-t border-ink-100' : ''} ${down ? 'opacity-50 bg-ink-50' : ''}`}
              >
                <View className={`h-10 w-14 items-center justify-center rounded border ${down ? 'bg-ink-200 border-ink-300' : 'bg-white border-ink-100'}`}>
                  {m.logo ? (
                    <Image source={m.logo} style={{ width: 44, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
                  ) : (
                    <Text className={`font-extrabold text-[10px] ${down ? 'text-ink-400' : 'text-ink-900'}`}>{m.label}</Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className={`font-semibold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>{m.name}</Text>
                  <Text className="font-medium text-[10px] text-ink-500">Bayar tunai di kasir, dapat kode pembayaran</Text>
                  {down && <Text className="font-bold text-[10px] text-rose-600 mt-0.5">{getMessage(m.code) || 'Metode ini sedang tidak tersedia'}</Text>}
                  {delayed && <Text className="font-bold text-[10px] text-amber-600 mt-0.5">Transaksi mungkin tertunda</Text>}
                </View>
                <Building2 color={down ? '#CBD5E1' : '#94A3B8'} size={16} />
              </Pressable>
            );
          })}
        </View>
      </View>
      )}

      {cardMethods.length > 0 && (
      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">Kartu Kredit / Debit</Text>
        <View className="overflow-hidden rounded-2xl bg-white">
          {cardMethods.map((m, i) => {
            const st = getStatus(m.code);
            const down = st === 'down';
            const delayed = st === 'delayed';
            return (
              <Pressable
                key={m.code}
                disabled={disabled || down}
                onPress={() => onPick(m.code, 'credit_card')}
                className={`flex-row items-center gap-3 p-4 ${i > 0 ? 'border-t border-ink-100' : ''} ${down ? 'opacity-50 bg-ink-50' : ''}`}
              >
                <View className={`h-10 w-14 items-center justify-center rounded border ${down ? 'bg-ink-200 border-ink-300' : 'bg-white border-ink-100'}`}>
                  {m.logo ? (
                    <Image source={m.logo} style={{ width: 44, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
                  ) : (
                    <Text className={`font-extrabold text-[10px] ${down ? 'text-ink-400' : 'text-ink-900'}`}>VISA/MC</Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className={`font-semibold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>{m.name}</Text>
                  <Text className="font-medium text-[10px] text-ink-500">Visa, Mastercard, JCB - input di halaman pembayaran aman</Text>
                  {down && <Text className="font-bold text-[10px] text-rose-600 mt-0.5">{getMessage(m.code) || 'Metode ini sedang tidak tersedia'}</Text>}
                  {delayed && <Text className="font-bold text-[10px] text-amber-600 mt-0.5">Transaksi mungkin tertunda</Text>}
                </View>
                <Building2 color={down ? '#CBD5E1' : '#94A3B8'} size={16} />
              </Pressable>
            );
          })}
        </View>
      </View>
      )}

      {(disabled || loadingMethods) && (
        <View className="items-center py-3">
          <ActivityIndicator color="#1D4ED8" />
          <Text className="font-medium mt-2 text-[11px] text-ink-500">Memuat metode pembayaran...</Text>
        </View>
      )}
      {!loadingMethods && methods.length === 0 && (
        <View className="rounded-2xl bg-white p-4">
          <Text className="text-sm font-semibold text-ink-900">Metode pembayaran belum tersedia</Text>
          <Text className="mt-1 text-[12px] leading-5 text-ink-500">Silakan coba lagi beberapa saat lagi.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function BigCountdown({ expiredAt }: { expiredAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = parseExpiredAt(expiredAt)?.getTime() ?? null;
  if (!target) return null;
  const remainingMs = Math.max(0, target - now);
  const totalSec = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const expired = remainingMs === 0;
  const urgent = !expired && remainingMs < 5 * 60_000;
  const bg = expired ? '#FEE2E2' : urgent ? '#FEF3C7' : '#DBEAFE';
  const fg = expired ? '#991B1B' : urgent ? '#92400E' : '#1E40AF';
  return (
    <View style={{ backgroundColor: bg, padding: 14, borderRadius: 14, alignItems: 'center' }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {expired ? 'Pembayaran Expired' : 'Selesaikan dalam'}
      </Text>
      <Text style={{ color: fg, fontSize: 32, fontWeight: '800', letterSpacing: 2, marginTop: 4, fontVariant: ['tabular-nums'] }}>
        {h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
      </Text>
      <Text style={{ color: fg, fontSize: 11, marginTop: 4, opacity: 0.85 }}>
        {expired ? 'Pesan ulang booking untuk lanjut bayar' : 'Setelah waktu habis, kamu perlu pesan ulang'}
      </Text>
    </View>
  );
}

function PaymentInstructions({ data, onCopy, bookingId, onManualSync }: { data: DirectResult; onCopy: () => void; bookingId: string; onManualSync?: () => void }) {
  const CountdownBanner = data.expiredAt ? <BigCountdown expiredAt={data.expiredAt} /> : null;
  const formatExpiredHeader = (ex: string | null | undefined) => {
    const d = parseExpiredAt(ex);
    if (!d) return ex ?? '';
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} WIB`;
  };

  // E-wallet (DANA, ShopeePay, LinkAja, GoPay): buka deep link langsung ke app wallet
  if (data.senderBankType === 'wallet_account' && data.senderBank !== 'qris' && (data.walletUrl || data.senderBank === 'ovo')) {
    const isOvo = data.senderBank === 'ovo';
    const WALLET_LABELS: Record<string, string> = {
      ovo: 'OVO', dana: 'DANA', shopeepay: 'ShopeePay', linkaja: 'LinkAja', gopay: 'GoPay',
    };
    const walletName = WALLET_LABELS[data.senderBank] ?? data.senderBank.toUpperCase();
    const openWallet = async () => {
      if (!data.walletUrl) return;
      try { await Linking.openURL(data.walletUrl); }
      catch { toast.error(`Gagal membuka app ${walletName}. Pastikan app sudah terinstall.`); }
    };
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} style={{ backgroundColor: '#F1F5F9' }}>
        {CountdownBanner}
        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, alignItems: 'center', gap: 12 }}>
          {(() => {
            const logo = EWALLET_METHODS.find((m) => m.code === data.senderBank)?.logo;
            return logo ? (
              <View style={{ width: 100, height: 60, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={logo} style={{ width: '100%', height: '100%' }} contentFit="contain" />
              </View>
            ) : (
              <View style={{ width: 80, height: 80, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                <WalletIcon color="#1D4ED8" size={40} />
              </View>
            );
          })()}
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A' }}>{walletName}</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#0F172A' }}>{formatRupiah(data.amount)}</Text>
          {isOvo ? (
            <View style={{ backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', textAlign: 'center' }}>
                Cek notifikasi di app OVO kamu
              </Text>
              <Text style={{ fontSize: 12, color: '#92400E', textAlign: 'center', lineHeight: 18 }}>
                Buka app OVO, terima permintaan pembayaran, lalu masukkan PIN OVO untuk konfirmasi.
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20 }}>
                Klik tombol di bawah untuk lanjut ke app {walletName}. Setelah bayar, kamu akan otomatis kembali ke sini.
              </Text>
              <Pressable
                onPress={openWallet}
                style={{ backgroundColor: '#1D4ED8', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, width: '100%', alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Bayar Sekarang</Text>
              </Pressable>
            </>
          )}
        </View>
        <View style={{ padding: 12, backgroundColor: '#FEF3C7', borderRadius: 10, flexDirection: 'row', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 }}>
            Status pembayaran kami cek otomatis. Halaman ini akan pindah saat lunas.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if ((data.senderBankType === 'qris' || data.senderBank === 'qris') && (data.qrString || data.qrUrl)) {
    return (
      <ScrollView contentContainerStyle={{ padding: 0, backgroundColor: '#F1F5F9' }}>
        <View style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 16 }}>
          <Text style={{ fontSize: 28, color: '#0F172A', fontWeight: '800' }}>Lakukan Pembayaran</Text>
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: '#0F172A', fontWeight: '700' }}>
              Bayar sebelum {formatExpiredHeader(data.expiredAt)}.
            </Text>
            {data.expiredAt ? <CountdownBadge expiredAt={data.expiredAt} /> : null}
          </View>
        </View>

        <View style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingBottom: 28, alignItems: 'center' }}>
          <Image source={QRIS_LOGO} style={{ width: 70, height: 34, marginTop: 6, marginBottom: 18 }} contentFit="contain" />
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ padding: 12, backgroundColor: 'white', borderRadius: 8 }}>
              {data.qrString ? (
                Platform.OS === 'web' ? (
                  <QRCodeWeb value={data.qrString} size={260} />
                ) : (
                  <QRCode value={data.qrString} size={260} />
                )
              ) : (
                <Image
                  source={{ uri: data.qrUrl! }}
                  style={{ width: 260, height: 260, backgroundColor: 'white' }}
                  contentFit="contain"
                />
              )}
            </View>
          </View>
          {data.nmid ? (
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 8 }}>
              NMID: {data.nmid}
            </Text>
          ) : null}
          <View style={{ width: '100%', marginTop: 18, borderRadius: 14, overflow: 'hidden' }}>
            <Pressable
              onPress={() => onManualSync?.()}
              style={{ paddingVertical: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1D4ED8' }}
            >
              <Text style={{ fontSize: 16, color: 'white', fontWeight: '800' }}>Cek Status Transaksi</Text>
            </Pressable>
          </View>
          <Text style={{ marginTop: 18, fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20 }}>
            Kalau pembayaran belum masuk, status tetap menunggu. Setelah pembayaran diterima, halaman ini akan berpindah otomatis ke detail pesanan.
          </Text>
          <View style={{ marginTop: 14, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>ID Order</Text>
            <Text style={{ fontSize: 12, color: '#0F172A', fontWeight: '700' }} selectable>
              {bookingId}
            </Text>
          </View>
          <Text style={{ marginTop: 12, fontSize: 22, color: '#0F172A', fontWeight: '800' }}>
            {formatRupiah(data.amount)}
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (data.senderBankType === 'virtual_account' && data.accountNumber) {
    const copyAmount = async () => {
      await Clipboard.setStringAsync(String(data.amount));
      toast.success('Nominal disalin');
    };
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} style={{ backgroundColor: '#F1F5F9' }}>
        {CountdownBanner}

        {/* VA Number - highlight biru muda */}
        <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE', borderRadius: 16, padding: 18 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#1E3A8A', textTransform: 'uppercase', marginBottom: 10 }}>
            {data.senderBank.toUpperCase()} Virtual Account
          </Text>
          <Text selectable style={{ fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: 1, marginBottom: 12, fontVariant: ['tabular-nums'] }}>
            {data.accountNumber}
          </Text>
          <Pressable
            onPress={onCopy}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1D4ED8', borderRadius: 12, paddingVertical: 12 }}
          >
            <Copy color="white" size={16} />
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Salin Nomor VA</Text>
          </Pressable>
        </View>

        {/* Total Bayar - highlight hijau */}
        <View style={{ backgroundColor: '#ECFDF5', borderWidth: 1.5, borderColor: '#A7F3D0', borderRadius: 16, padding: 18 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#065F46', textTransform: 'uppercase', marginBottom: 6 }}>
            Total Bayar
          </Text>
          <Text selectable style={{ fontSize: 26, fontWeight: '800', color: '#064E3B', fontVariant: ['tabular-nums'], marginBottom: 12 }}>
            {formatRupiah(data.amount)}
          </Text>
          <Pressable
            onPress={copyAmount}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 12, paddingVertical: 12 }}
          >
            <Copy color="white" size={16} />
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Salin Nominal</Text>
          </Pressable>
          <Text style={{ marginTop: 8, fontSize: 11, color: '#047857', textAlign: 'center' }}>
            Pastikan nominal transfer sama persis dan tidak dibulatkan.
          </Text>
        </View>

        {/* Cara Bayar */}
        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12 }}>
            Cara Bayar via m-banking {data.senderBank.toUpperCase()}
          </Text>
          <View style={{ gap: 10 }}>
            {[
              `Buka app m-banking ${data.senderBank.toUpperCase()}`,
              'Pilih menu Transfer lalu Virtual Account',
              'Masukkan nomor VA di atas',
              'Masukkan nominal sesuai total bayar',
              'Konfirmasi dan selesaikan transaksi',
            ].map((step, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E40AF' }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: '#334155', lineHeight: 20, paddingTop: 2 }}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginHorizontal: 4, marginTop: 4, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 10, flexDirection: 'row', gap: 8 }}>
          <Text style={{ fontSize: 14 }}>Info</Text>
          <Text style={{ flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 }}>
            Status pembayaran kami cek otomatis. Halaman ini akan pindah ke pesanan otomatis setelah pembayaran masuk.
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Fallback: QRIS/method without native instructions data → hosted Flip page.
  // - Web: iframe diblok Flip (X-Frame-Options). Buka di tab baru.
  // - Mobile: WebView native bekerja normal.
  if (data.paymentUrl) {
    if (Platform.OS === 'web') {
      return (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {CountdownBanner}
          <View className="items-center rounded-2xl bg-white p-6">
            <Text className="font-bold text-base text-ink-900">Lanjutkan Pembayaran</Text>
            <Text className="font-sans text-center mt-2 text-[12px] text-ink-500 leading-5">
              Halaman pembayaran akan terbuka di tab baru. Selesaikan transaksi di sana, lalu kembali ke tab ini - status pembayaran akan otomatis ter-update.
            </Text>
            <Pressable
              onPress={() => {
                if (typeof window !== 'undefined') window.open(data.paymentUrl!, '_blank', 'noopener,noreferrer');
              }}
              className="mt-5 bg-blue-600 rounded-xl px-6 py-3 flex-row items-center gap-2"
            >
              <Text className="text-white font-bold text-sm">🔗 Buka Halaman Pembayaran</Text>
            </Pressable>
            <Text className="font-sans text-center mt-4 text-[10px] text-ink-400 break-all" selectable>
              {data.paymentUrl}
            </Text>
          </View>
          <PollingHint />
        </ScrollView>
      );
    }
    return (
      <WebView source={{ uri: data.paymentUrl }} startInLoadingState style={{ flex: 1 }} />
    );
  }

  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="font-bold text-sm text-ink-900">Metode tidak didukung</Text>
    </View>
  );
}

function PollingHint() {
  return (
    <View className="flex-row items-center gap-2 rounded-2xl bg-amber-50 p-3">
      <RefreshCw color="#B45309" size={14} />
      <Text className="flex-1 font-sans text-[11px] text-amber-900">
        Status pembayaran kami cek otomatis tiap beberapa detik. Halaman ini akan otomatis pindah ke pesanan saat sudah lunas.
      </Text>
    </View>
  );
}

function PaidView() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 color="#16A34A" size={48} />
      </View>
      <Text className="font-bold mt-4 text-lg text-ink-900">Pembayaran Diterima</Text>
      <Text className="font-sans mt-1 text-center text-sm text-ink-500">Mengarahkan ke pesanan...</Text>
    </View>
  );
}

// Web fallback for QR - uses canvas via google chart API or qr-code-styling import
function QRCodeWeb({ value, size }: { value: string; size: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  // @ts-expect-error host elem
  return <img src={url} width={size} height={size} alt="QRIS" />;
}

export default withAuth(PaymentScreen, 'customer');

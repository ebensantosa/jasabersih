import * as Clipboard from 'expo-clipboard';
import { withAuth } from '../../src/components/AuthGate';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Building2, CheckCircle2, Copy, QrCode, RefreshCw, Wallet as WalletIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
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
  senderBankType: 'virtual_account' | 'qris' | 'wallet_account';
  accountNumber: string | null;
  qrString: string | null;
  expiredAt: string | null;
  paymentUrl?: string | null;
};

// Stylized brand badges — no external image deps so always renders.
const VA_METHODS: {
  code: string;
  name: string;
  bg: string;
  fg: string;
  label: string;
  logo: any;
}[] = [
  { code: 'bca',     name: 'BCA Virtual Account',         bg: '#FFFFFF', fg: '#0060AF', label: 'BCA',     logo: require('../../assets/payment-logos/logo-bca.png') },
  { code: 'mandiri', name: 'Mandiri Virtual Account',     bg: '#FFFFFF', fg: '#003D79', label: 'mandiri', logo: require('../../assets/payment-logos/logo-mandiri.png') },
  { code: 'bni',     name: 'BNI Virtual Account',         bg: '#FFFFFF', fg: '#F36F21', label: 'BNI',     logo: require('../../assets/payment-logos/logo-bni.png') },
  { code: 'bri',     name: 'BRI Virtual Account',         bg: '#FFFFFF', fg: '#00529C', label: 'BRI',     logo: require('../../assets/payment-logos/logo-bri.png') },
  { code: 'cimb',    name: 'CIMB Niaga Virtual Account',  bg: '#FFFFFF', fg: '#7A1A1A', label: 'CIMB',    logo: require('../../assets/payment-logos/cimb.png') },
  { code: 'permata', name: 'Permata Virtual Account',     bg: '#FFFFFF', fg: '#00853F', label: 'Permata', logo: require('../../assets/payment-logos/logo-permatabank.png') },
  { code: 'bsi',     name: 'BSI Virtual Account',         bg: '#FFFFFF', fg: '#00904F', label: 'BSI',     logo: require('../../assets/payment-logos/bsi-logo.png') },
  { code: 'danamon', name: 'Danamon Virtual Account',     bg: '#FFFFFF', fg: '#FF6B00', label: 'Danamon', logo: require('../../assets/payment-logos/logo-danamon.png') },
  { code: 'btn',     name: 'BTN Virtual Account',         bg: '#FFFFFF', fg: '#005DA8', label: 'BTN',     logo: require('../../assets/payment-logos/BTN.png') },
  { code: 'mega',    name: 'Bank Mega Virtual Account',   bg: '#FFFFFF', fg: '#FFB500', label: 'Mega',    logo: require('../../assets/payment-logos/logo-mega.png') },
];

// E-wallet direct (alternatif kalau gak mau scan QRIS)
const EWALLET_METHODS: { code: string; name: string; logo: any }[] = [
  { code: 'gopay',     name: 'GoPay',     logo: require('../../assets/payment-logos/gopay-192x92-1.png') },
  { code: 'ovo',       name: 'OVO',       logo: require('../../assets/payment-logos/logo-ovo.png') },
  { code: 'dana',      name: 'DANA',      logo: require('../../assets/payment-logos/logo-dana.png') },
  { code: 'shopeepay', name: 'ShopeePay', logo: require('../../assets/payment-logos/shopeepay.png') },
  { code: 'linkaja',   name: 'LinkAja',   logo: require('../../assets/payment-logos/logo-linkaja.png') },
];

const QRIS_LOGO = require('../../assets/payment-logos/qris.png');

type BankHealth = { code: string; status: 'normal' | 'delayed' | 'down'; message: string };

function PaymentScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === bookingId));
  const syncBookings = useBookingsStore((s) => s.syncFromApi);

  const [creating, setCreating] = useState(false);
  const [pickingCode, setPickingCode] = useState<string | null>(null);
  const [direct, setDirect] = useState<DirectResult | null>(null);
  const [paid, setPaid] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.get('/customer/wallet');
        setWalletBalance(Number((r.data?.data ?? r.data)?.balance ?? 0));
      } catch { /* ignore */ }
      try {
        const { storage } = await import('../../src/lib/storage');
        const flag = storage.getString(`useCredit:${bookingId}`);
        if (flag === '1') setUseCredit(true);
      } catch { /* ignore */ }
    })();
  }, [bookingId]);

  async function payWithSaldo() {
    if (!bookingId || !booking) return;
    setCreating(true);
    try {
      await api.post(`/bookings/${bookingId}/pay`, { useCredit: true });
      setPaid(true);
      void syncBookings();
      setTimeout(() => router.replace({ pathname: '/booking/[id]', params: { id: bookingId } }), 1500);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal bayar dengan saldo');
    } finally {
      setCreating(false);
    }
  }

  const [useCredit, setUseCredit] = useState(false);

  async function pickMethod(senderBank: string, senderBankType: DirectResult['senderBankType']) {
    if (!bookingId) return;
    setPickingCode(senderBank);
    setCreating(true);
    try {
      const res = await api.post('/payments/flip/create-direct', { bookingId, senderBank, senderBankType, useCredit });
      const data: DirectResult = res.data?.data ?? res.data;
      setDirect(data);
      // Poll status
      pollRef.current = setInterval(async () => {
        try {
          const r = await api.get(`/payments/${data.paymentId}`);
          const status = (r.data?.data ?? r.data)?.status;
          if (status === 'paid') {
            setPaid(true);
            if (pollRef.current) clearInterval(pollRef.current);
            void syncBookings();
            setTimeout(() => router.replace({ pathname: '/booking/[id]', params: { id: bookingId } }), 1500);
          } else if (['failed', 'cancelled', 'expired'].includes(status)) {
            toast.error('Pembayaran gagal/expired. Coba lagi.');
            if (pollRef.current) clearInterval(pollRef.current);
            setDirect(null);
          }
        } catch {}
      }, 4000);
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
      } else if (friendly.startsWith('Flip: {')) {
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
            <Text className="font-bold text-base text-ink-900">{paid ? 'Pembayaran Diterima' : direct ? 'Selesaikan Pembayaran' : 'Pilih Metode'}</Text>
            {booking && <Text className="font-sans text-[11px] text-ink-500">Total: {formatRupiah(booking.totalPrice)}</Text>}
          </View>
          {direct?.expiredAt && !paid && <CountdownBadge expiredAt={direct.expiredAt} />}
        </View>

        {/* Loading overlay saat create payment */}
        {creating && (
          <Modal transparent animationType="fade" visible>
            <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 28, alignItems: 'center', minWidth: 260, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 }}>
                <ActivityIndicator color="#1D4ED8" size="large" />
                <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '700', color: '#0F172A' }}>Membuat Pembayaran</Text>
                <Text style={{ marginTop: 6, fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18 }}>
                  Lagi terhubung ke Flip…{'\n'}Mohon tunggu sebentar.
                </Text>
              </View>
            </View>
          </Modal>
        )}

        {paid ? (
          <PaidView />
        ) : direct ? (
          <PaymentInstructions data={direct} onCopy={copyVa} />
        ) : (
          <MethodPicker
            disabled={creating}
            pickingCode={pickingCode}
            onPick={pickMethod}
            walletBalance={walletBalance}
            total={booking?.totalPrice ?? 0}
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
  const target = (() => {
    if (!expiredAt) return null;
    // ISO format kalau dari fallback createBill, native parse
    if (expiredAt.includes('T')) return new Date(expiredAt).getTime();
    // Flip format "2026-06-08 00:00" — treat as local server time
    return new Date(expiredAt.replace(' ', 'T') + ':00').getTime();
  })();
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
    <View className={`rounded-lg px-2 py-1 ${expired ? 'bg-rose-100' : urgent ? 'bg-amber-100' : 'bg-blue-100'}`}>
      <Text className={`text-[10px] font-semibold ${expired ? 'text-rose-700' : urgent ? 'text-amber-700' : 'text-blue-700'}`}>
        {expired ? '⛔ Expired' : `⏱ ${display}`}
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

  // Bank health — disable bank yang lagi down
  const [bankHealth, setBankHealth] = useState<Record<string, BankHealth>>({});
  useEffect(() => {
    (async () => {
      try {
        const { api } = await import('../../src/lib/api');
        const r = await api.get('/payments/bank-health');
        const list = (r.data?.data ?? r.data ?? []) as BankHealth[];
        const map: Record<string, BankHealth> = {};
        for (const b of list) map[b.code] = b;
        setBankHealth(map);
      } catch { /* ignore — default semua normal */ }
    })();
  }, []);
  // Trust backend API sepenuhnya. Admin bisa toggle aktif/tidak via App Settings
  // (key: payment.active_channels) tanpa redeploy APK.
  const getStatus = (code: string): 'normal' | 'delayed' | 'down' => bankHealth[code]?.status ?? 'normal';
  const getMessage = (code: string) => bankHealth[code]?.message ?? '';
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {walletBalance > 0 && (
        <View>
          <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">Saldo Saya</Text>
          {fullSaldo ? (
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
                  Saldo: {formatRupiah(walletBalance)} — bayar penuh dari saldo
                </Text>
              </View>
            </Pressable>
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
                  {useCredit ? `Potongan: ${formatRupiah(creditUsed)} · Sisa bayar via metode bawah: ${formatRupiah(remaining)}` : 'Tap untuk pakai saldo, sisanya bayar via bank/QRIS'}
                </Text>
              </View>
              <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${useCredit ? 'border-emerald-600 bg-emerald-600' : 'border-ink-300'}`}>
                {useCredit && <Text className="font-bold text-white text-[10px]">✓</Text>}
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
                <Text className="text-xs text-emerald-600">−{formatRupiah(creditUsed)}</Text>
              </View>
              <View className="mt-1 flex-row justify-between border-t border-ink-200 pt-1">
                <Text className="text-xs font-bold text-ink-900">Bayar via bank/QRIS</Text>
                <Text className="text-sm font-bold text-ink-900">{formatRupiah(remaining)}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">QRIS (rekomendasi)</Text>
        {(() => {
          const st = getStatus('qris');
          const down = st === 'down';
          const delayed = st === 'delayed';
          return (
            <Pressable
              disabled={disabled || down}
              onPress={() => onPick('qris', 'wallet_account')}
              className={`flex-row items-center gap-3 rounded-2xl p-4 ${down ? 'bg-ink-100 opacity-50' : 'bg-white'}`}
            >
              <View className={`h-12 w-14 items-center justify-center rounded-xl border ${down ? 'bg-ink-200 border-ink-300' : 'bg-white border-ink-100'}`}>
                <Image source={QRIS_LOGO} style={{ width: 40, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
              </View>
              <View className="flex-1">
                <Text className={`font-bold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>QRIS — Semua e-wallet & m-banking</Text>
                {down ? (
                  <Text className="font-bold mt-0.5 text-[11px] text-rose-600">🔧 {getMessage('qris') || 'Sedang pemeliharaan'}</Text>
                ) : delayed ? (
                  <Text className="font-bold mt-0.5 text-[11px] text-amber-600">⚠️ Mungkin tertunda</Text>
                ) : (
                  <Text className="font-medium mt-0.5 text-[11px] text-ink-500">GoPay · OVO · DANA · ShopeePay · m-banking</Text>
                )}
              </View>
            </Pressable>
          );
        })()}
      </View>

      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">Virtual Account</Text>
        <View className="overflow-hidden rounded-2xl bg-white">
          {VA_METHODS.map((m, i) => {
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
                  {down && <Text className="font-bold text-[10px] text-rose-600 mt-0.5">🔧 {getMessage(m.code) || 'Belum tersedia'}</Text>}
                  {delayed && <Text className="font-bold text-[10px] text-amber-600 mt-0.5">⚠️ Mungkin tertunda</Text>}
                </View>
                <Building2 color={down ? '#CBD5E1' : '#94A3B8'} size={16} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">E-Wallet (langsung)</Text>
        <View className="overflow-hidden rounded-2xl bg-white">
          {EWALLET_METHODS.map((m, i) => {
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
                  {down && <Text className="font-bold text-[10px] text-rose-600 mt-0.5">🔧 {getMessage(m.code) || 'Belum tersedia'}</Text>}
                  {delayed && <Text className="font-bold text-[10px] text-amber-600 mt-0.5">⚠️ Mungkin tertunda</Text>}
                </View>
                <WalletIcon color={down ? '#CBD5E1' : '#94A3B8'} size={16} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {disabled && (
        <View className="items-center py-3">
          <ActivityIndicator color="#1D4ED8" />
          <Text className="font-medium mt-2 text-[11px] text-ink-500">Memuat metode pembayaran…</Text>
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
  const target = expiredAt.includes('T')
    ? new Date(expiredAt).getTime()
    : new Date(expiredAt.replace(' ', 'T') + ':00').getTime();
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
        {expired ? '⛔' : h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
      </Text>
      <Text style={{ color: fg, fontSize: 11, marginTop: 4, opacity: 0.85 }}>
        {expired ? 'Pesan ulang booking untuk lanjut bayar' : 'Setelah waktu habis, kamu perlu pesan ulang'}
      </Text>
    </View>
  );
}

function PaymentInstructions({ data, onCopy }: { data: DirectResult; onCopy: () => void }) {
  const CountdownBanner = data.expiredAt ? <BigCountdown expiredAt={data.expiredAt} /> : null;
  const formatExpiredHeader = (ex: string | null | undefined) => {
    if (!ex) return '';
    try {
      const d = ex.includes('T') ? new Date(ex) : new Date(ex.replace(' ', 'T') + ':00');
      const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} WIB`;
    } catch { return ex; }
  };

  if ((data.senderBankType === 'qris' || data.senderBankType === 'wallet_account') && data.qrString) {
    return (
      <ScrollView contentContainerStyle={{ padding: 0, backgroundColor: '#F1F5F9' }}>
        {/* Header dengan tanggal expired */}
        <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
          <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '500' }}>Selesaikan Pembayaran Sebelum</Text>
          <Text style={{ fontSize: 16, color: '#0F172A', fontWeight: '700', marginTop: 4 }}>
            {formatExpiredHeader(data.expiredAt)}
          </Text>
        </View>

        {/* QRIS card */}
        <View style={{ backgroundColor: 'white', padding: 20, marginTop: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>QRIS</Text>
            <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Image source={QRIS_LOGO} style={{ width: 36, height: 18 }} contentFit="contain" />
            </View>
          </View>
          <Text style={{ fontSize: 13, color: '#475569', marginTop: 12, lineHeight: 20 }}>
            Scan QRIS di bawah ini untuk melanjutkan pembayaran Anda.
          </Text>

          {/* QR code centered */}
          <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
            <View style={{ padding: 12, backgroundColor: 'white', borderRadius: 8 }}>
              {Platform.OS === 'web' ? (
                <QRCodeWeb value={data.qrString} size={260} />
              ) : (
                <QRCode value={data.qrString} size={260} />
              )}
            </View>
          </View>
        </View>

        {/* Nominal card */}
        <View style={{ backgroundColor: 'white', padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, marginHorizontal: 16 }}>
          <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '500' }}>Nominal Pembayaran</Text>
          <Text style={{ fontSize: 22, color: '#0F172A', fontWeight: '800', marginTop: 4 }}>
            {formatRupiah(data.amount)}
          </Text>
        </View>

        {/* Status info */}
        <View style={{ marginHorizontal: 16, marginTop: 16, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 10, flexDirection: 'row', gap: 8 }}>
          <Text style={{ fontSize: 14 }}>⚠️</Text>
          <Text style={{ flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 }}>
            Status pembayaran kami cek otomatis tiap beberapa detik. Halaman ini akan otomatis pindah ke pesanan saat sudah lunas.
          </Text>
        </View>

        {CountdownBanner ? <View style={{ marginHorizontal: 16, marginTop: 12 }}>{CountdownBanner}</View> : null}

        {/* Order ref footer */}
        {data.paymentId && (
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: '#64748B' }}>Kode Order</Text>
            <Text style={{ fontSize: 12, color: '#0F172A', fontWeight: '600' }} selectable>
              {data.paymentId.slice(0, 16)}
            </Text>
          </View>
        )}
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

        {/* VA Number — highlight biru muda */}
        <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE', borderRadius: 16, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#1E3A8A', textTransform: 'uppercase' }}>
              {data.senderBank.toUpperCase()} Virtual Account
            </Text>
            <View style={{ backgroundColor: '#1D4ED8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: 'white', fontSize: 9, fontWeight: '700' }}>NATIVE</Text>
            </View>
          </View>
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

        {/* Total Bayar — highlight hijau */}
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
            ⚠️ Pastikan nominal transfer sama persis (jangan dibulatkan)
          </Text>
        </View>

        {/* Cara Bayar */}
        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12 }}>
            📱 Cara Bayar via m-banking {data.senderBank.toUpperCase()}
          </Text>
          <View style={{ gap: 10 }}>
            {[
              `Buka app m-banking ${data.senderBank.toUpperCase()}`,
              'Pilih menu Transfer → Virtual Account',
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
          <Text style={{ fontSize: 14 }}>🔄</Text>
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
            <Text className="font-bold text-base text-ink-900">Lanjutkan Pembayaran di Flip</Text>
            <Text className="font-sans text-center mt-2 text-[12px] text-ink-500 leading-5">
              Halaman pembayaran Flip akan terbuka di tab baru. Selesaikan transaksi di sana, lalu kembali ke tab ini — status pembayaran akan otomatis ter-update.
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
      <Text className="font-sans mt-1 text-center text-sm text-ink-500">Mengarahkan ke pesanan…</Text>
    </View>
  );
}

// Web fallback for QR — uses canvas via google chart API or qr-code-styling import
function QRCodeWeb({ value, size }: { value: string; size: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  // @ts-expect-error host elem
  return <img src={url} width={size} height={size} alt="QRIS" />;
}

export default withAuth(PaymentScreen, 'customer');

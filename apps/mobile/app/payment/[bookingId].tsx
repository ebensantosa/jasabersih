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
  logo: string;
}[] = [
  { code: 'bca',     name: 'BCA Virtual Account',         bg: '#FFFFFF', fg: '#0060AF', label: 'BCA',     logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Bank_Central_Asia.svg/240px-Bank_Central_Asia.svg.png' },
  { code: 'mandiri', name: 'Mandiri Virtual Account',     bg: '#FFFFFF', fg: '#003D79', label: 'mandiri', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Bank_Mandiri_logo_2016.svg/240px-Bank_Mandiri_logo_2016.svg.png' },
  { code: 'bni',     name: 'BNI Virtual Account',         bg: '#FFFFFF', fg: '#F36F21', label: 'BNI',     logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/BNI_logo.svg/240px-BNI_logo.svg.png' },
  { code: 'bri',     name: 'BRI Virtual Account',         bg: '#FFFFFF', fg: '#00529C', label: 'BRI',     logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/BANK_BRI_logo.svg/240px-BANK_BRI_logo.svg.png' },
  { code: 'cimb',    name: 'CIMB Niaga Virtual Account',  bg: '#FFFFFF', fg: '#7A1A1A', label: 'CIMB',    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/CIMB_Niaga_logo.svg/240px-CIMB_Niaga_logo.svg.png' },
  { code: 'permata', name: 'Permata Virtual Account',     bg: '#FFFFFF', fg: '#00853F', label: 'Permata', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/PermataBank.svg/240px-PermataBank.svg.png' },
  { code: 'bsi',     name: 'BSI Virtual Account',         bg: '#FFFFFF', fg: '#00904F', label: 'BSI',     logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Bank_Syariah_Indonesia.svg/240px-Bank_Syariah_Indonesia.svg.png' },
  { code: 'danamon', name: 'Danamon Virtual Account',     bg: '#FFFFFF', fg: '#FF6B00', label: 'Danamon', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Bank_Danamon_logo.svg/240px-Bank_Danamon_logo.svg.png' },
  { code: 'btn',     name: 'BTN Virtual Account',         bg: '#FFFFFF', fg: '#005DA8', label: 'BTN',     logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Bank_BTN_logo.svg/240px-Bank_BTN_logo.svg.png' },
  { code: 'mega',    name: 'Bank Mega Virtual Account',   bg: '#FFFFFF', fg: '#FFB500', label: 'Mega',    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Logo_Bank_Mega.svg/240px-Logo_Bank_Mega.svg.png' },
];

// E-wallet direct (alternatif kalau gak mau scan QRIS)
const EWALLET_METHODS: { code: string; name: string; logo: string }[] = [
  { code: 'gopay',     name: 'GoPay',     logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Gopay_logo.svg/240px-Gopay_logo.svg.png' },
  { code: 'ovo',       name: 'OVO',       logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Logo_ovo_purple.svg/240px-Logo_ovo_purple.svg.png' },
  { code: 'dana',      name: 'DANA',      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Logo_dana_blue.svg/240px-Logo_dana_blue.svg.png' },
  { code: 'shopeepay', name: 'ShopeePay', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/ShopeePay_logo.svg/240px-ShopeePay_logo.svg.png' },
  { code: 'linkaja',   name: 'LinkAja',   logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/LinkAja.svg/240px-LinkAja.svg.png' },
];

const QRIS_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/QRIS_logo.svg/240px-QRIS_logo.svg.png';

type BankHealth = { code: string; status: 'normal' | 'delayed' | 'down'; message: string };

function PaymentScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === bookingId));
  const syncBookings = useBookingsStore((s) => s.syncFromApi);

  const [creating, setCreating] = useState(false);
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
      toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal create pembayaran');
    } finally {
      setCreating(false);
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
        </View>

        {paid ? (
          <PaidView />
        ) : direct ? (
          <PaymentInstructions data={direct} onCopy={copyVa} />
        ) : (
          <MethodPicker
            disabled={creating}
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

function MethodPicker({
  disabled,
  onPick,
  walletBalance,
  total,
  onPaySaldo,
  useCredit,
  setUseCredit,
}: {
  disabled: boolean;
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
  const getStatus = (code: string) => bankHealth[code]?.status ?? 'normal';
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
                <Image source={{ uri: QRIS_LOGO }} style={{ width: 40, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
              </View>
              <View className="flex-1">
                <Text className={`font-bold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>QRIS — Semua e-wallet & m-banking</Text>
                {down ? (
                  <Text className="font-bold mt-0.5 text-[11px] text-rose-600">🔴 Sedang gangguan, coba lain</Text>
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
                  <Image source={{ uri: m.logo }} style={{ width: 44, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
                </View>
                <View className="flex-1">
                  <Text className={`font-semibold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>{m.name}</Text>
                  {down && <Text className="font-bold text-[10px] text-rose-600 mt-0.5">🔴 Sedang gangguan</Text>}
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
                  <Image source={{ uri: m.logo }} style={{ width: 44, height: 28, opacity: down ? 0.4 : 1 }} contentFit="contain" />
                </View>
                <View className="flex-1">
                  <Text className={`font-semibold text-sm ${down ? 'text-ink-400' : 'text-ink-900'}`}>{m.name}</Text>
                  {down && <Text className="font-bold text-[10px] text-rose-600 mt-0.5">🔴 Sedang gangguan</Text>}
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

function PaymentInstructions({ data, onCopy }: { data: DirectResult; onCopy: () => void }) {
  if ((data.senderBankType === 'qris' || data.senderBankType === 'wallet_account') && data.qrString) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View className="items-center rounded-2xl bg-white p-5">
          <Text className="font-bold text-sm text-ink-900">Scan QR untuk Bayar</Text>
          <Text className="font-sans mt-1 text-[11px] text-ink-500">Total {formatRupiah(data.amount)}</Text>
          <View className="mt-4 rounded-xl bg-white p-3">
            {Platform.OS === 'web' ? (
              <QRCodeWeb value={data.qrString} size={240} />
            ) : (
              <QRCode value={data.qrString} size={240} />
            )}
          </View>
          <Text className="font-sans mt-4 text-center text-[11px] text-ink-500">
            Buka app m-banking / e-wallet kamu, pilih scan QR, scan QR di atas.
          </Text>
        </View>
        <PollingHint />
      </ScrollView>
    );
  }

  if (data.senderBankType === 'virtual_account' && data.accountNumber) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View className="rounded-2xl bg-white p-5">
          <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">{data.senderBank.toUpperCase()} Virtual Account</Text>
          <View className="mt-3 flex-row items-center gap-3">
            <Text className="flex-1 font-bold text-2xl text-ink-900" selectable>{data.accountNumber}</Text>
            <Pressable onPress={onCopy} className="flex-row items-center gap-1 rounded-xl bg-brand-50 px-3 py-2">
              <Copy color="#1D4ED8" size={14} />
              <Text className="font-bold text-xs text-brand-700">Salin</Text>
            </Pressable>
          </View>
          <View className="mt-4 border-t border-ink-100 pt-3">
            <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">Total Bayar</Text>
            <Text className="font-bold mt-0.5 text-xl text-ink-900">{formatRupiah(data.amount)}</Text>
          </View>
        </View>
        <View className="rounded-2xl bg-white p-4">
          <Text className="font-bold text-sm text-ink-900">Cara Bayar</Text>
          <View className="mt-3 gap-2">
            {[
              'Buka app m-banking ' + data.senderBank.toUpperCase(),
              'Pilih menu Transfer → Virtual Account',
              `Masukkan nomor VA: ${data.accountNumber}`,
              `Masukkan nominal Rp ${data.amount.toLocaleString('id-ID')}`,
              'Konfirmasi dan selesaikan transaksi',
            ].map((step, i) => (
              <View key={i} className="flex-row gap-2">
                <Text className="font-bold text-xs text-brand-700">{i + 1}.</Text>
                <Text className="flex-1 font-sans text-xs text-ink-700">{step}</Text>
              </View>
            ))}
          </View>
        </View>
        <PollingHint />
      </ScrollView>
    );
  }

  // Fallback: QRIS without raw string OR any method without VA — embed Flip's
  // hosted checkout in WebView (in-app, no external browser).
  if (data.paymentUrl) {
    return (
      <>
        {Platform.OS === 'web' ? (
          // @ts-expect-error host elem
          <iframe src={data.paymentUrl} style={{ flex: 1, border: 'none', width: '100%', height: '100%' } as any} title="Flip QRIS" />
        ) : (
          <WebView source={{ uri: data.paymentUrl }} startInLoadingState style={{ flex: 1 }} />
        )}
      </>
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

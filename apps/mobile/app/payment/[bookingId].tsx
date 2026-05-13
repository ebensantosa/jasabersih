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
}[] = [
  { code: 'bca',     name: 'BCA Virtual Account',         bg: '#0060AF', fg: '#FFFFFF', label: 'BCA' },
  { code: 'bni',     name: 'BNI Virtual Account',         bg: '#F36F21', fg: '#FFFFFF', label: 'BNI' },
  { code: 'bri',     name: 'BRI Virtual Account',         bg: '#00529C', fg: '#FFFFFF', label: 'BRI' },
  { code: 'mandiri', name: 'Mandiri Virtual Account',     bg: '#003D79', fg: '#FFD200', label: 'mandiri' },
  { code: 'cimb',    name: 'CIMB Niaga Virtual Account',  bg: '#7A1A1A', fg: '#FFFFFF', label: 'CIMB' },
  { code: 'permata', name: 'Permata Virtual Account',     bg: '#00853F', fg: '#FFFFFF', label: 'Permata' },
];

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
    })();
  }, []);

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

  async function pickMethod(senderBank: string, senderBankType: DirectResult['senderBankType']) {
    if (!bookingId) return;
    setCreating(true);
    try {
      const res = await api.post('/payments/flip/create-direct', { bookingId, senderBank, senderBankType });
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
          <Pressable onPress={() => (direct ? setDirect(null) : router.back())} className="h-10 w-10 items-center justify-center">
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
}: {
  disabled: boolean;
  onPick: (bank: string, type: DirectResult['senderBankType']) => void;
  walletBalance: number;
  total: number;
  onPaySaldo: () => void;
}) {
  const canPaySaldo = walletBalance >= total && total > 0;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {walletBalance > 0 && (
        <View>
          <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">Saldo Saya</Text>
          <Pressable
            disabled={disabled || !canPaySaldo}
            onPress={onPaySaldo}
            className={`flex-row items-center gap-3 rounded-2xl p-4 ${canPaySaldo ? 'bg-emerald-50 border border-emerald-300' : 'bg-ink-100 border border-ink-200'}`}
          >
            <View className="h-12 w-14 items-center justify-center rounded-xl bg-emerald-600">
              <WalletIcon color="white" size={20} />
            </View>
            <View className="flex-1">
              <Text className={`font-bold text-sm ${canPaySaldo ? 'text-emerald-900' : 'text-ink-500'}`}>
                {canPaySaldo ? 'Bayar dengan Saldo' : 'Saldo tidak cukup'}
              </Text>
              <Text className="font-medium mt-0.5 text-[11px] text-ink-600">
                Saldo: {formatRupiah(walletBalance)}{canPaySaldo ? ' — bayar penuh dari saldo' : ` (kurang ${formatRupiah(total - walletBalance)})`}
              </Text>
            </View>
          </Pressable>
        </View>
      )}

      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">QRIS</Text>
        <Pressable
          disabled={disabled}
          onPress={() => onPick('qris', 'wallet_account')}
          className="flex-row items-center gap-3 rounded-2xl bg-white p-4"
        >
          <View className="h-12 w-14 items-center justify-center rounded-xl" style={{ backgroundColor: '#ED1C24' }}>
            <Text className="font-bold text-xs text-white">QRIS</Text>
          </View>
          <View className="flex-1">
            <Text className="font-bold text-sm text-ink-900">QRIS — Semua e-wallet & m-banking</Text>
            <Text className="font-medium mt-0.5 text-[11px] text-ink-500">GoPay · OVO · Dana · ShopeePay · LinkAja · m-banking</Text>
          </View>
        </Pressable>
      </View>

      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">Virtual Account</Text>
        <View className="overflow-hidden rounded-2xl bg-white">
          {VA_METHODS.map((m, i) => (
            <Pressable
              key={m.code}
              disabled={disabled}
              onPress={() => onPick(m.code, 'virtual_account')}
              className={`flex-row items-center gap-3 p-4 ${i > 0 ? 'border-t border-ink-100' : ''}`}
            >
              <View
                className="h-10 w-14 items-center justify-center rounded"
                style={{ backgroundColor: m.bg }}
              >
                <Text
                  className="font-bold text-[11px]"
                  style={{ color: m.fg, textTransform: m.label === 'mandiri' ? 'lowercase' : 'uppercase' }}
                >
                  {m.label}
                </Text>
              </View>
              <Text className="flex-1 font-semibold text-sm text-ink-900">{m.name}</Text>
              <Building2 color="#94A3B8" size={16} />
            </Pressable>
          ))}
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

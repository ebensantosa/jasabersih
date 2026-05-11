import * as Clipboard from 'expo-clipboard';
import { withAuth } from '../../src/components/AuthGate';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Building2, CheckCircle2, Copy, QrCode, RefreshCw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

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
};

const VA_METHODS: { code: string; name: string; sub?: string }[] = [
  { code: 'bca', name: 'BCA Virtual Account' },
  { code: 'bni', name: 'BNI Virtual Account' },
  { code: 'bri', name: 'BRI Virtual Account' },
  { code: 'mandiri', name: 'Mandiri Virtual Account' },
  { code: 'cimb', name: 'CIMB Niaga Virtual Account' },
  { code: 'permata', name: 'Permata Virtual Account' },
  { code: 'bsi', name: 'BSI Virtual Account' },
];

function PaymentScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === bookingId));
  const syncBookings = useBookingsStore((s) => s.syncFromApi);

  const [creating, setCreating] = useState(false);
  const [direct, setDirect] = useState<DirectResult | null>(null);
  const [paid, setPaid] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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
          <MethodPicker disabled={creating} onPick={pickMethod} />
        )}
      </SafeAreaView>
    </>
  );
}

function MethodPicker({ disabled, onPick }: { disabled: boolean; onPick: (bank: string, type: DirectResult['senderBankType']) => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View>
        <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">QRIS</Text>
        <Pressable
          disabled={disabled}
          onPress={() => onPick('qris', 'qris')}
          className="flex-row items-center gap-3 rounded-2xl bg-white p-4"
        >
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
            <QrCode color="#1D4ED8" size={24} />
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
              <View className="h-10 w-12 items-center justify-center rounded bg-ink-100">
                <Text className="font-bold text-[10px] uppercase text-ink-700">{m.code}</Text>
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
  if (data.senderBankType === 'qris' && data.qrString) {
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

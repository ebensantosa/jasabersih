import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { withAuth } from '../../src/components/AuthGate';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Clock, Copy, ExternalLink, Loader2, ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { api } from '../../src/lib/api';
import { useBookingsStore } from '../../src/stores/bookings';
import { toast } from '../../src/stores/ui';
import { formatRupiah } from '../../src/data/catalog';

type Channel = {
  code: string; name: string; group: string; type: string; iconUrl: string;
  fee: { flat: number; percent: string };
};

type PaymentResult = {
  paymentId: string;
  reference: string;
  method: string;
  methodName: string;
  amount: number;
  fee: number;
  amountTotal: number;
  payCode: string | null;
  payUrl: string | null;
  checkoutUrl: string | null;
  qrUrl: string | null;
  expiredAt: string;
  instructions?: { title: string; steps: string[] }[];
};

function PaymentScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const booking = useBookingsStore((s) => s.list.find((b) => b.id === bookingId));
  const syncBookings = useBookingsStore((s) => s.syncFromApi);

  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [paid, setPaid] = useState(false);
  const [flipUrl, setFlipUrl] = useState<string | null>(null);
  const [flipPaymentId, setFlipPaymentId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/payments/channels');
        setChannels(res.data?.data ?? []);
      } catch (e: any) {
        toast.error(e?.response?.data?.error?.message ?? 'Gagal load metode pembayaran');
        setChannels([]);
      }
    })();
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  async function payViaFlip() {
    if (!bookingId) return;
    setCreating(true);
    try {
      const res = await api.post('/payments/flip/create', { bookingId });
      const data = res.data?.data ?? res.data;
      const url: string | undefined = data?.checkoutUrl;
      const paymentId: string | undefined = data?.paymentId;
      if (!url || !paymentId) throw new Error('Checkout URL kosong dari server.');
      // On web we can't iframe Flip (X-Frame-Options) — fall back to new tab.
      // On native: open in-app WebView modal.
      // Native: in-app WebView modal. Web: in-app iframe overlay (same flipUrl state)
      setFlipUrl(url);
      setFlipPaymentId(paymentId);
      // Poll status — webhook will mark paid; UI auto-closes WebView on detect.
      pollTimerRef.current = setInterval(async () => {
        try {
          const r = await api.get(`/payments/${paymentId}`);
          const status = (r.data?.data ?? r.data)?.status;
          if (status === 'paid') {
            setPaid(true);
            setFlipUrl(null);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            void syncBookings();
            setTimeout(() => router.replace({ pathname: '/booking/[id]', params: { id: bookingId } }), 1500);
          } else if (['failed', 'cancelled', 'expired'].includes(status)) {
            setFlipUrl(null);
            toast.error('Pembayaran gagal/dibatalkan. Coba lagi.');
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          }
        } catch {}
      }, 4000);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal create pembayaran Flip');
    } finally {
      setCreating(false);
    }
  }

  async function pickAndCreate(method: string) {
    if (!bookingId) return;
    setCreating(true);
    try {
      const res = await api.post('/payments/create', { bookingId, method });
      const data: PaymentResult = res.data?.data ?? res.data;
      setPayment(data);
      // Start polling status every 5s
      pollTimerRef.current = setInterval(async () => {
        try {
          const r = await api.get(`/payments/${data.paymentId}`);
          const status = (r.data?.data ?? r.data)?.status;
          if (status === 'paid') {
            setPaid(true);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            void syncBookings();
            setTimeout(() => router.replace({ pathname: '/booking/[id]', params: { id: bookingId } }), 2000);
          } else if (status === 'expired' || status === 'failed') {
            toast.error('Pembayaran kadaluwarsa atau gagal. Silakan coba lagi.');
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setPayment(null);
          }
        } catch {}
      }, 5000);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal create payment');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <View className="flex-1">
            <Text className="font-bold text-base text-ink-900">{paid ? 'Pembayaran Diterima' : payment ? 'Selesaikan Pembayaran' : 'Pilih Pembayaran'}</Text>
            {booking && <Text className="font-sans text-[11px] text-ink-500">Total: {formatRupiah(booking.totalPrice)}</Text>}
          </View>
        </View>

        {paid ? (
          <PaidView onContinue={() => router.replace({ pathname: '/booking/[id]', params: { id: bookingId! } })} />
        ) : payment ? (
          <PaymentDetailView payment={payment} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View className="rounded-2xl bg-white p-4">
              <Text className="font-bold text-sm text-ink-900">Bayar dengan Flip</Text>
              <Text className="font-sans mt-1 text-[11px] text-ink-500">
                Pilih metode pembayaran (Virtual Account, QRIS, E-Wallet) di halaman Flip. Kembali otomatis ke pesanan setelah berhasil.
              </Text>
            </View>
            <Pressable
              onPress={payViaFlip}
              disabled={creating}
              className="items-center rounded-2xl bg-brand-600 px-4 py-4 shadow"
            >
              <Text className="font-bold text-base text-white">
                {creating ? 'Memuat…' : booking ? `Bayar ${formatRupiah(booking.totalPrice)}` : 'Bayar via Flip'}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal visible={!!flipUrl} animationType="slide" onRequestClose={() => setFlipUrl(null)}>
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <View className="flex-row items-center gap-2 border-b border-ink-100 px-3 py-2">
            <Pressable onPress={() => setFlipUrl(null)} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <View className="flex-1">
              <Text className="font-bold text-base text-ink-900">Pembayaran Flip</Text>
              <Text className="font-sans text-[11px] text-ink-500">Tetap di halaman ini sampai pembayaran selesai</Text>
            </View>
          </View>
          {flipUrl && Platform.OS === 'web' && (
            // @ts-expect-error host elem
            <iframe
              src={flipUrl}
              style={{ flex: 1, border: 'none', width: '100%', height: '100%' } as any}
              allow="payment *; clipboard-write"
              title="Flip Checkout"
            />
          )}
          {flipUrl && Platform.OS !== 'web' && (
            <WebView
              source={{ uri: flipUrl }}
              startInLoadingState
              renderLoading={() => (
                <View className="absolute inset-0 items-center justify-center bg-white">
                  <ActivityIndicator color="#1D4ED8" />
                </View>
              )}
              onNavigationStateChange={(nav) => {
                // Flip redirects ke redirect_url saat selesai → kita pake jasabersih.com/booking/{id}
                if (nav.url.includes('/booking/') && flipPaymentId) {
                  // Trigger immediate poll
                  api.get(`/payments/${flipPaymentId}`).then((r) => {
                    const status = (r.data?.data ?? r.data)?.status;
                    if (status === 'paid') {
                      setPaid(true);
                      setFlipUrl(null);
                      void syncBookings();
                    }
                  }).catch(() => {});
                }
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function ChannelPicker({ channels, disabled, onPick }: { channels: Channel[]; disabled: boolean; onPick: (method: string) => void }) {
  const groups = channels.reduce<Record<string, Channel[]>>((acc, c) => {
    (acc[c.group] = acc[c.group] ?? []).push(c);
    return acc;
  }, {});
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {Object.entries(groups).map(([group, items]) => (
        <View key={group}>
          <Text className="font-bold mb-2 text-xs uppercase tracking-wider text-ink-500">{group}</Text>
          <View className="overflow-hidden rounded-2xl bg-white">
            {items.map((c, i) => (
              <Pressable
                key={c.code}
                onPress={() => onPick(c.code)}
                disabled={disabled}
                className={`flex-row items-center gap-3 p-4 ${i > 0 ? 'border-t border-ink-100' : ''} ${disabled ? 'opacity-50' : ''}`}
              >
                {c.iconUrl ? (
                  <Image source={{ uri: c.iconUrl }} style={{ width: 36, height: 24 }} contentFit="contain" />
                ) : (
                  <View className="h-6 w-9 rounded bg-ink-100" />
                )}
                <View className="flex-1">
                  <Text className="font-semibold text-sm text-ink-900">{c.name}</Text>
                  {c.fee.flat > 0 && (
                    <Text className="font-sans text-[10px] text-ink-500">Fee {formatRupiah(c.fee.flat)}{c.fee.percent !== '0.00' ? ` + ${c.fee.percent}%` : ''}</Text>
                  )}
                </View>
                <ChevronRight color="#94A3B8" size={16} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function PaymentDetailView({ payment }: { payment: PaymentResult }) {
  const expireDate = new Date(payment.expiredAt);
  const [secLeft, setSecLeft] = useState<number>(Math.floor((expireDate.getTime() - Date.now()) / 1000));
  useEffect(() => {
    const id = setInterval(() => setSecLeft(Math.floor((expireDate.getTime() - Date.now()) / 1000)), 1000);
    return () => clearInterval(id);
  }, [expireDate]);

  const hh = Math.max(0, Math.floor(secLeft / 3600));
  const mm = Math.max(0, Math.floor((secLeft % 3600) / 60));
  const ss = Math.max(0, secLeft % 60);

  async function copyCode() {
    if (!payment.payCode) return;
    await Clipboard.setStringAsync(payment.payCode);
    toast.success('Disalin');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View className="rounded-2xl bg-white p-4">
        <Text className="font-sans text-[11px] text-ink-500">Bayar via</Text>
        <Text className="font-bold mt-0.5 text-base text-ink-900">{payment.methodName}</Text>
        <View className="mt-3 flex-row items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
          <Clock color="#B45309" size={14} />
          <Text className="font-medium text-xs text-amber-900">
            {secLeft > 0 ? `Bayar dalam ${hh > 0 ? `${hh}j ` : ''}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : 'Pembayaran sudah kadaluwarsa'}
          </Text>
        </View>
      </View>

      {payment.qrUrl ? (
        <View className="items-center rounded-2xl bg-white p-4">
          <Image source={{ uri: payment.qrUrl }} style={{ width: 240, height: 240 }} contentFit="contain" />
          <Text className="font-sans mt-3 text-xs text-ink-500">Scan QR di atas dengan app pembayaran</Text>
        </View>
      ) : payment.payCode ? (
        <View className="rounded-2xl bg-white p-4">
          <Text className="font-sans text-[11px] text-ink-500">Nomor Virtual Account</Text>
          <View className="mt-1 flex-row items-center justify-between">
            <Text className="font-bold flex-1 text-2xl tracking-wider text-ink-900">{payment.payCode}</Text>
            <Pressable onPress={copyCode} className="flex-row items-center gap-1 rounded-lg bg-brand-50 px-3 py-2">
              <Copy color="#1D4ED8" size={14} />
              <Text className="font-semibold text-xs text-brand-700">Salin</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View className="rounded-2xl bg-white p-4">
        <Text className="font-sans text-[11px] text-ink-500">Total Bayar</Text>
        <Text className="font-bold mt-0.5 text-2xl text-ink-900">{formatRupiah(payment.amountTotal)}</Text>
        {payment.fee > 0 && (
          <Text className="font-sans mt-0.5 text-[11px] text-ink-500">
            Termasuk fee {formatRupiah(payment.fee)}
          </Text>
        )}
      </View>

      {payment.checkoutUrl && (
        <Pressable
          onPress={() => Linking.openURL(payment.checkoutUrl!)}
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-brand-300 bg-white py-3.5"
        >
          <ExternalLink color="#1D4ED8" size={16} />
          <Text className="font-bold text-sm text-brand-700">Buka Halaman Pembayaran</Text>
        </Pressable>
      )}

      {payment.instructions && payment.instructions.length > 0 && (
        <View className="rounded-2xl bg-white p-4">
          <Text className="font-bold mb-2 text-sm text-ink-900">Cara Bayar</Text>
          {payment.instructions.map((ins, i) => (
            <View key={i} className="mt-2">
              <Text className="font-semibold text-xs text-ink-700">{ins.title}</Text>
              {ins.steps.map((s, j) => (
                <Text key={j} className="font-sans mt-1 text-xs text-ink-600">{j + 1}. {s.replace(/<\/?[^>]+(>|$)/g, '')}</Text>
              ))}
            </View>
          ))}
        </View>
      )}

      <View className="flex-row items-center justify-center gap-2 py-2">
        <ActivityIndicator size="small" color="#94A3B8" />
        <Text className="font-sans text-xs text-ink-500">Menunggu pembayaran…</Text>
      </View>
    </ScrollView>
  );
}

function PaidView({ onContinue }: { onContinue: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 color="#047857" size={40} strokeWidth={2.4} />
      </View>
      <Text className="font-bold mt-4 text-xl text-ink-900">Pembayaran Berhasil!</Text>
      <Text className="font-sans mt-2 text-center text-sm text-ink-500">Kami sedang mencari cleaner untuk kamu.</Text>
      <Pressable onPress={onContinue} className="mt-6 rounded-2xl bg-brand-600 px-6 py-3">
        <Text className="font-bold text-sm text-white">Lihat Pesanan</Text>
      </Pressable>
    </View>
  );
}

export default withAuth(PaymentScreen, 'customer');

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Calendar, Check, Clock3, MapPin, Wallet, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { useJobsRealtime } from '../hooks/useJobsRealtime';
import { formatScheduleWithTz } from '../lib/datetime';
import { toast } from '../stores/ui';

const SEARCH_TIMEOUT_SEC = 15 * 60;

export function RealtimeJobModal() {
  const router = useRouter();
  const { incoming, dismiss, accept } = useJobsRealtime();
  const [accepting, setAccepting] = useState(false);
  const [secLeft, setSecLeft] = useState(SEARCH_TIMEOUT_SEC);

  useEffect(() => {
    if (!incoming) {
      setSecLeft(SEARCH_TIMEOUT_SEC);
      return;
    }
    const createdAtMs = incoming.createdAt ? Date.parse(incoming.createdAt) : Date.now();
    const syncCountdown = () => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
      setSecLeft(Math.max(0, SEARCH_TIMEOUT_SEC - elapsedSec));
    };
    syncCountdown();
    const id = setInterval(syncCountdown, 1000);
    return () => clearInterval(id);
  }, [incoming?.id]);

  useEffect(() => {
    if (incoming && secLeft <= 0) dismiss(incoming.id);
  }, [secLeft, incoming, dismiss]);

  if (!incoming) return null;

  async function onAccept() {
    if (!incoming) return;
    setAccepting(true);
    const res = await accept(incoming.id);
    setAccepting(false);
    if (res.ok) {
      toast.success('Job berhasil diambil.');
      router.push({ pathname: '/booking/[id]', params: { id: incoming.id } });
      return;
    }
    toast.warning(res.error ?? 'Job sudah tidak tersedia.');
  }

  const total = Number(incoming.totalAmount ?? 0);
  const payout = Number(incoming.cleanerPayout ?? 0);
  const pct = (secLeft / SEARCH_TIMEOUT_SEC) * 100;
  const minLeft = Math.floor(secLeft / 60);
  const remainingLabel = secLeft >= 60 ? `${minLeft} menit` : `${secLeft} detik`;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => dismiss(incoming.id)}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl bg-white">
          <LinearGradient colors={['#1D4ED8', '#0F766E']} className="rounded-t-3xl px-5 pb-5 pt-4">
            <View className="mb-3 self-center h-1.5 w-10 rounded-full bg-white/35" />
            <View className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <View style={{ width: `${pct}%` }} className="h-full bg-white" />
            </View>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <BellRing color="white" size={16} strokeWidth={2.2} />
                  <Text className="font-bold text-[11px] uppercase tracking-[1px] text-white/80">
                    Tawaran Job Baru
                  </Text>
                </View>
                <Text className="mt-2 font-bold text-2xl text-white">
                  {incoming.serviceName ?? 'Layanan'}
                </Text>
                <Text className="mt-1 text-[12px] text-white/80">
                  Job ini dikirim ke cleaner aktif di area yang sesuai. Siapa cepat dia dapat.
                </Text>
              </View>
              <View className="min-w-[70px] rounded-2xl bg-white/15 px-3 py-2">
                <Text className="text-center font-extrabold text-2xl text-white">{secLeft >= 60 ? minLeft : secLeft}</Text>
                <Text className="text-center text-[10px] text-white/75">{secLeft >= 60 ? 'menit' : 'detik'}</Text>
              </View>
            </View>
          </LinearGradient>

          <View className="px-5 pb-3 pt-4">
            <View className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <View className="flex-row items-center gap-2">
                <Wallet color="#047857" size={16} strokeWidth={2.2} />
                <Text className="font-semibold text-[11px] uppercase tracking-[1px] text-emerald-800">
                  Perkiraan Pendapatan
                </Text>
              </View>
              <Text className="mt-2 font-extrabold text-3xl text-emerald-700">
                Rp {payout.toLocaleString('id-ID')}
              </Text>
              {total > 0 ? (
                <Text className="mt-1 text-[11px] text-emerald-800">
                  Nilai pesanan pelanggan Rp {total.toLocaleString('id-ID')}
                </Text>
              ) : null}
            </View>

            <View className="mt-4 gap-3">
              <Row icon={<MapPin color="#475569" size={16} />} text={incoming.addressLine} />
              <Row icon={<Calendar color="#475569" size={16} />} text={formatScheduleWithTz(incoming.scheduledAt, (incoming as any).addressLine)} />
              <Row icon={<Clock3 color="#475569" size={16} />} text="Ambil sekarang agar customer segera mendapat kepastian." />
            </View>
          </View>

          <SafeAreaView edges={['bottom']} className="border-t border-ink-100 bg-white">
            <View className="flex-row gap-3 px-5 pb-4 pt-4">
              <Pressable onPress={() => dismiss(incoming.id)} className="flex-1 items-center justify-center rounded-2xl border border-ink-300 bg-white py-3.5">
                <View className="flex-row items-center gap-1.5">
                  <X color="#475569" size={16} />
                  <Text className="font-semibold text-sm text-ink-700">Lewati</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={onAccept}
                disabled={accepting}
                className={`flex-1 items-center justify-center rounded-2xl py-3.5 ${accepting ? 'bg-success/60' : 'bg-success'}`}
              >
                {accepting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <View className="flex-row items-center gap-1.5">
                    <Check color="white" size={16} strokeWidth={2.4} />
                    <Text className="font-bold text-sm text-white">Ambil Job</Text>
                  </View>
                )}
              </Pressable>
            </View>
            <View className="px-5 pb-3">
              <Text className="text-center text-[11px] text-ink-500">
                Tawaran ini mengikuti sisa waktu pencarian customer: {remainingLabel}.
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="mt-0.5">{icon}</View>
      <Text className="flex-1 text-sm text-ink-800">{text}</Text>
    </View>
  );
}

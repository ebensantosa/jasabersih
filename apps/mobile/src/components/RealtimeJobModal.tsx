import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Calendar, Check, Clock3, MapPin, Wallet, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { useJobsRealtime } from '../hooks/useJobsRealtime';
import { formatScheduleWithTz } from '../lib/datetime';
import { toast } from '../stores/ui';

const SEARCH_TIMEOUT_SEC = 15 * 60;

export function RealtimeJobModal() {
  const router = useRouter();
  const { incoming, queuedCount, dismiss, accept } = useJobsRealtime();
  const [accepting, setAccepting] = useState(false);
  const [secLeft, setSecLeft] = useState(SEARCH_TIMEOUT_SEC);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

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
  const secPart = secLeft % 60;
  const remainingLabel = `${String(minLeft).padStart(2, '0')}:${String(secPart).padStart(2, '0')}`;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => dismiss(incoming.id)}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl bg-white">
          <LinearGradient colors={['#1D4ED8', '#0F766E']} className="rounded-t-3xl px-5 pb-5 pt-4">
            <View className="mb-3 self-center h-1.5 w-10 rounded-full bg-white/35" />
            {queuedCount > 0 ? (
              <View className="mb-2 self-start rounded-full bg-amber-400 px-2.5 py-1">
                <Text className="font-extrabold text-[10px] text-amber-900">
                  + {queuedCount} job lain antri
                </Text>
              </View>
            ) : null}
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
                  {incoming.pricingMode === 'hourly'
                    ? `Layanan Per Jam${incoming.hours ? ` · ${incoming.hours}j` : ''}`
                    : (incoming.serviceName ?? 'Layanan')}
                </Text>
                <Text className="mt-1 text-[12px] text-white/80">
                  Job ini dikirim ke cleaner aktif di area yang sesuai. Siapa cepat dia dapat.
                </Text>
              </View>
              <View className="min-w-[70px] rounded-2xl bg-white/15 px-3 py-2">
                <Text className="text-center font-extrabold text-2xl text-white">{remainingLabel}</Text>
                <Text className="text-center text-[10px] text-white/75">menit : detik</Text>
              </View>
            </View>
          </LinearGradient>

          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 }}>
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
            </View>

            {/* Layanan */}
            <View className="flex-row items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3">
              {incoming.serviceIconUrl ? (
                <View className="h-12 w-12 overflow-hidden rounded-xl bg-ink-100">
                  <Image source={{ uri: incoming.serviceIconUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
              ) : null}
              <View className="flex-1">
                <Text className="font-bold text-sm text-ink-900">
                  {incoming.pricingMode === 'hourly'
                    ? `Layanan Per Jam${incoming.hours ? ` · ${incoming.hours}j` : ''}`
                    : (incoming.serviceName ?? 'Layanan')}
                </Text>
                <Text className="font-medium text-[11px] text-brand-600">
                  {incoming.pricingMode === 'package'
                    ? (incoming.packageName ?? 'Paket Tetap')
                    : incoming.pricingMode === 'hourly'
                      ? incoming.hours
                        ? `${incoming.hours} Jam${incoming.hourlyTierName ? ` · ${incoming.hourlyTierName}` : ''}`
                        : (incoming.hourlyTierName ?? 'Per Jam')
                      : 'Konsultasi WA'}
                </Text>
              </View>
            </View>

            <View className="gap-3">
              <Row icon={<MapPin color="#475569" size={16} />} text={incoming.addressLine} />
              <Row icon={<Calendar color="#475569" size={16} />} text={formatScheduleWithTz(incoming.scheduledAt, (incoming as any).addressLine)} />
            </View>

            {/* Detail properti dari snapshot */}
            {incoming.formSnapshot && incoming.pricingMode === 'package' && (incoming.formSnapshot.propertyType || incoming.formSnapshot.bedrooms != null) ? (
              <View className="rounded-xl bg-ink-50 p-3">
                <Text className="font-semibold text-[10px] uppercase tracking-wider text-ink-500">Detail Properti</Text>
                <Text className="mt-1 text-[11px] text-ink-700">
                  {[
                    incoming.formSnapshot.propertyType,
                    incoming.formSnapshot.bedrooms != null ? `${incoming.formSnapshot.bedrooms} kamar tidur` : null,
                    incoming.formSnapshot.bathrooms != null ? `${incoming.formSnapshot.bathrooms} kamar mandi` : null,
                    incoming.formSnapshot.areaM2 ? `${incoming.formSnapshot.areaM2}m²` : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
                {incoming.formSnapshot.dirtLevel ? (
                  <Text className="mt-1 text-[11px] text-ink-700">Tingkat kotor: {incoming.formSnapshot.dirtLevel}/5</Text>
                ) : null}
              </View>
            ) : null}

            {/* Foto kondisi */}
            {Array.isArray(incoming.formSnapshot?.conditionPhotos) && incoming.formSnapshot.conditionPhotos.length > 0 ? (
              <View className="rounded-xl border border-ink-100 bg-white p-3">
                <Text className="font-semibold text-[10px] uppercase tracking-wider text-ink-500">
                  Foto Kondisi ({incoming.formSnapshot.conditionPhotos.length})
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                  <View className="flex-row gap-2">
                    {incoming.formSnapshot.conditionPhotos.map((url: string, i: number) => (
                      <Pressable key={`${url}-${i}`} onPress={() => setPreviewPhoto(url)} className="overflow-hidden rounded-lg bg-ink-100" style={{ width: 80, height: 80 }}>
                        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {/* Catatan customer */}
            {incoming.customerNotes ? (
              <View className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="font-semibold text-[10px] uppercase tracking-wider text-amber-900">Catatan Customer</Text>
                <Text className="mt-1 text-[11px] text-amber-900">{incoming.customerNotes}</Text>
              </View>
            ) : null}

            <View className="flex-row items-start gap-2">
              <Clock3 color="#475569" size={14} style={{ marginTop: 2 }} />
              <Text className="flex-1 text-[11px] text-ink-500">Ambil sekarang agar customer segera mendapat kepastian.</Text>
            </View>
          </ScrollView>

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

      <Modal visible={!!previewPhoto} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <Pressable
          onPress={() => setPreviewPhoto(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 12 }}
        >
          {previewPhoto ? (
            <Image source={{ uri: previewPhoto }} style={{ width: '100%', height: '80%' }} contentFit="contain" />
          ) : null}
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

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="mt-0.5">{icon}</View>
      <Text className="flex-1 text-sm text-ink-800">{text}</Text>
    </View>
  );
}

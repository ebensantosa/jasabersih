// PREVIEW per-jam booking. Pricing & toggle on/off di-pull dari admin app_config + hourly_tiers.
// Belum wired ke flow booking sungguhan - tujuan validate UX dulu sebelum commit ke implementasi penuh.
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Ban, Check, Clock, Info, Minus, Plus, Sparkles, Wrench } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApiHourlyTiers, useConfig } from '../../src/stores/appContent';
import { safeBack } from '../../src/lib/safeBack';

type Mode = 'per_room' | 'per_hour';

function rupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function tierIcon(code: string | null) {
  if (code === 'deep') return { Icon: Wrench, tint: '#047857', bg: '#D1FAE5' };
  return { Icon: Sparkles, tint: '#1D4ED8', bg: '#DBEAFE' };
}

export default function PreviewHourly() {
  const router = useRouter();
  const perRoomEnabled = useConfig('booking.modes.per_room.enabled' as any, true) as unknown as boolean;
  const perHourEnabled = useConfig('booking.modes.per_hour.enabled' as any, true) as unknown as boolean;
  const tiers = useApiHourlyTiers();

  const bothEnabled = !!perRoomEnabled && !!perHourEnabled;
  const initialMode: Mode = perHourEnabled ? 'per_hour' : 'per_room';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [tierId, setTierId] = useState<string | null>(tiers[0]?.id ?? null);
  const [hours, setHours] = useState<number>(tiers[0]?.minHours ?? 2);

  const tier = useMemo(() => tiers.find((t) => t.id === tierId) ?? tiers[0] ?? null, [tiers, tierId]);
  const minH = tier?.minHours ?? 2;
  const maxH = tier?.maxHours ?? 8;

  // Clamp hours kalau ganti tier dengan range beda
  const clampedHours = Math.min(Math.max(hours, minH), maxH);
  const subtotal = tier ? tier.pricePerHour * clampedHours : 0;
  const platformFee = Math.round(subtotal * 0.05);
  const total = subtotal + platformFee;

  function dec() { setHours((h) => Math.max(minH, h - 1)); }
  function inc() { setHours((h) => Math.min(maxH, h + 1)); }

  // Kalau kedua mode disabled - safety net, tampilin pesan
  if (!perRoomEnabled && !perHourEnabled) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-8">
        <Ban color="#94A3B8" size={48} />
        <Text className="font-bold mt-4 text-center text-base text-ink-700">Booking belum dibuka</Text>
        <Text className="font-sans mt-2 text-center text-[12px] text-ink-500">
          Admin menonaktifkan semua mode booking. Coba lagi nanti.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <LinearGradient
          colors={['#1E3A8A', '#047857', '#0E7490']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingBottom: 28, width: '100%', alignSelf: 'stretch' }}
        >
          <SafeAreaView edges={['top']}>
            <View className="flex-row items-center px-3 py-2">
              <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <ArrowLeft color="white" size={20} />
              </Pressable>
              <Text className="font-bold ml-2 flex-1 text-base text-white">Preview: Booking</Text>
            </View>
            <View className="px-5 pt-2">
              <Text className="font-extrabold text-2xl text-white">Pilih Layanan</Text>
              <Text className="font-sans mt-1 text-[12px] text-white/85">
                {bothEnabled ? 'Per-ruangan rekomendasi · per-jam untuk yang butuh fleksibilitas' : perHourEnabled ? 'Bayar sesuai durasi kerja' : 'Bayar tetap per kamar/area'}
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView className="-mt-5" contentContainerStyle={{ padding: 16, paddingBottom: mode === 'per_hour' ? 140 : 40 }}>
          {/* Mode toggle - cuma tampil kalau keduanya enabled */}
          {bothEnabled && (
            <View className="rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
              <Text className="font-bold text-sm text-ink-900">Cara Hitung Harga</Text>
              <View className="mt-2.5 flex-row gap-2">
                <Pressable
                  onPress={() => setMode('per_room')}
                  className={`flex-1 rounded-xl border-2 p-3 ${mode === 'per_room' ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                >
                  <View className="flex-row items-center gap-1">
                    <Text className={`font-bold text-[13px] ${mode === 'per_room' ? 'text-brand-700' : 'text-ink-700'}`}>
                      Per Ruangan
                    </Text>
                    <View className="rounded-full bg-emerald-100 px-1.5 py-0.5">
                      <Text className="font-bold text-[8px] text-emerald-700">HEMAT</Text>
                    </View>
                  </View>
                  <Text className="font-sans mt-0.5 text-[10px] leading-[14px] text-ink-500">
                    Harga tetap per kamar/area
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('per_hour')}
                  className={`flex-1 rounded-xl border-2 p-3 ${mode === 'per_hour' ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                >
                  <Text className={`font-bold text-[13px] ${mode === 'per_hour' ? 'text-brand-700' : 'text-ink-700'}`}>
                    Per Jam
                  </Text>
                  <Text className="font-sans mt-0.5 text-[10px] leading-[14px] text-ink-500">
                    Fleksibel sesuai durasi
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {mode === 'per_hour' && (
            <>
              {tiers.length === 0 ? (
                <View className="mt-3 items-center rounded-2xl bg-white p-8 shadow-sm" style={{ elevation: 3 }}>
                  <Text className="font-bold text-center text-sm text-ink-700">Tier per-jam belum di-setup</Text>
                  <Text className="font-sans mt-2 text-center text-[12px] text-ink-500">
                    Admin perlu tambahin tier di hourly_tiers table.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Tier selector */}
                  <View className="mt-3 rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                    <Text className="font-bold text-sm text-ink-900">Jenis Pembersihan</Text>
                    <View className="mt-3 gap-2">
                      {tiers.map((t) => {
                        const { Icon, tint, bg } = tierIcon(t.code);
                        const active = tier?.id === t.id;
                        return (
                          <Pressable
                            key={t.id}
                            onPress={() => { setTierId(t.id); setHours(t.minHours); }}
                            className={`flex-row items-center gap-3 rounded-xl border-2 p-3 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                          >
                            <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: bg }}>
                              <Icon color={tint} size={18} strokeWidth={2.2} />
                            </View>
                            <View className="flex-1">
                              <Text className="font-bold text-[13px] text-ink-900">{t.name ?? '-'}</Text>
                              {t.description && (
                                <Text className="font-sans text-[11px] text-ink-500" numberOfLines={1}>
                                  {t.description}
                                </Text>
                              )}
                            </View>
                            <View>
                              <Text className="font-extrabold text-[14px]" style={{ color: tint }}>
                                {rupiah(t.pricePerHour)}
                              </Text>
                              <Text className="font-sans text-right text-[10px] text-ink-500">/jam</Text>
                            </View>
                            {active && (
                              <View className="ml-1 h-5 w-5 items-center justify-center rounded-full bg-brand-600">
                                <Check color="white" size={12} strokeWidth={3} />
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Duration stepper */}
                  <View className="mt-3 rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                    <View className="flex-row items-center gap-2">
                      <Clock color="#1D4ED8" size={16} strokeWidth={2.4} />
                      <Text className="font-bold text-sm text-ink-900">Durasi Kerja</Text>
                    </View>
                    <Text className="font-sans mt-1 text-[11px] text-ink-500">
                      Min {minH} jam, maks {maxH} jam per sesi
                    </Text>

                    <View className="mt-4 flex-row items-center justify-between">
                      <Pressable
                        onPress={dec}
                        disabled={clampedHours <= minH}
                        className={`h-12 w-12 items-center justify-center rounded-full ${clampedHours <= minH ? 'bg-ink-100' : 'bg-brand-600'}`}
                      >
                        <Minus color={clampedHours <= minH ? '#94A3B8' : 'white'} size={20} strokeWidth={2.6} />
                      </Pressable>
                      <View className="items-center">
                        <Text className="font-extrabold text-4xl text-ink-900">{clampedHours}</Text>
                        <Text className="font-medium text-[11px] text-ink-500">jam</Text>
                      </View>
                      <Pressable
                        onPress={inc}
                        disabled={clampedHours >= maxH}
                        className={`h-12 w-12 items-center justify-center rounded-full ${clampedHours >= maxH ? 'bg-ink-100' : 'bg-brand-600'}`}
                      >
                        <Plus color={clampedHours >= maxH ? '#94A3B8' : 'white'} size={20} strokeWidth={2.6} />
                      </Pressable>
                    </View>

                    {/* Quick presets - filter only those in range */}
                    <View className="mt-4 flex-row gap-2">
                      {[2, 3, 4, 6].filter((h) => h >= minH && h <= maxH).map((h) => (
                        <Pressable
                          key={h}
                          onPress={() => setHours(h)}
                          className={`flex-1 rounded-lg border py-2 ${clampedHours === h ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                        >
                          <Text className={`font-bold text-center text-[12px] ${clampedHours === h ? 'text-brand-700' : 'text-ink-600'}`}>
                            {h}j
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* Info card - transparency */}
                  <View className="mt-3 flex-row items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <Info color="#B45309" size={14} strokeWidth={2.4} />
                    <View className="flex-1">
                      <Text className="font-bold text-[12px] text-amber-900">Cara kerja per-jam</Text>
                      <Text className="font-sans mt-0.5 text-[11px] leading-4 text-amber-900">
                        Cleaner foto check-in saat mulai & check-out saat selesai. Bayar sesuai durasi yang di-book. Overtime +30 menit pertama gratis.
                      </Text>
                    </View>
                  </View>

                  {/* Price breakdown */}
                  {tier && (
                    <View className="mt-3 rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 3 }}>
                      <Text className="font-bold text-sm text-ink-900">Rincian Harga</Text>
                      <View className="mt-3 gap-2">
                        <View className="flex-row justify-between">
                          <Text className="font-sans text-[13px] text-ink-600">
                            {tier.name} · {clampedHours} jam
                          </Text>
                          <Text className="font-semibold text-[13px] text-ink-900">{rupiah(subtotal)}</Text>
                        </View>
                        <View className="flex-row justify-between">
                          <Text className="font-sans text-[13px] text-ink-600">Biaya platform (5%)</Text>
                          <Text className="font-semibold text-[13px] text-ink-900">{rupiah(platformFee)}</Text>
                        </View>
                        <View className="my-2 h-px bg-ink-100" />
                        <View className="flex-row items-center justify-between">
                          <Text className="font-bold text-sm text-ink-900">Total</Text>
                          <Text className="font-extrabold text-xl text-brand-700">{rupiah(total)}</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </>
              )}
            </>
          )}

          {mode === 'per_room' && (
            <View className="mt-3 items-center rounded-2xl bg-white p-8 shadow-sm" style={{ elevation: 3 }}>
              <Text className="font-bold text-center text-sm text-ink-900">Mode Per Ruangan</Text>
              <Text className="font-sans mt-2 text-center text-[12px] text-ink-500">
                Preview — flow existing dengan pilih kamar/ruangan akan diintegrasi di sini.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Sticky CTA - only per_hour */}
        {mode === 'per_hour' && tier && (
          <View className="absolute bottom-0 left-0 right-0 border-t border-ink-100 bg-white px-4 pb-6 pt-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-sans text-[11px] text-ink-500">Total ({clampedHours} jam)</Text>
              <Text className="font-extrabold text-lg text-brand-700">{rupiah(total)}</Text>
            </View>
            <Pressable className="rounded-2xl bg-brand-600 py-4" style={{ elevation: 3 }}>
              <Text className="font-bold text-center text-sm text-white">Lanjut Pilih Jadwal</Text>
            </Pressable>
          </View>
        )}
      </View>
    </>
  );
}

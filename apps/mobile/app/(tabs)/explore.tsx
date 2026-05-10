import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CalendarClock, ChevronRight, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../../src/data/catalog';
import { useServices } from '../../src/hooks/useServices';

export default function Explore() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ALL_SERVICES = useServices();
  // Hide mode-toggles (general/deep cleaning) + subscription (punya section khusus)
  const HIDDEN_CODES = new Set(['general_cleaning', 'deep_cleaning', 'subscription']);
  const SERVICE_CATEGORIES = ALL_SERVICES.filter((s) => !HIDDEN_CODES.has(s.code));
  const subscriptionService = ALL_SERVICES.find((s) => s.code === 'subscription');

  const query = q.trim().toLowerCase();
  const filtered = query
    ? SERVICE_CATEGORIES.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.code.toLowerCase().includes(query),
      )
    : SERVICE_CATEGORIES;

  return (
    <View className="flex-1 bg-ink-50">
      <SafeAreaView edges={['top']} className="bg-white">
        <View className="px-4 pb-4 pt-3">
          <Text className="font-bold text-2xl text-ink-900">Layanan</Text>
          <Text className="font-sans mt-0.5 text-xs text-ink-500">
            Pilih layanan sesuai kebutuhanmu
          </Text>
          <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-ink-100 px-4 py-3">
            <Search color="#64748B" size={18} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Cari layanan…"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className="font-sans flex-1 text-sm text-ink-900"
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ('')} className="p-1">
                <X color="#94A3B8" size={16} />
              </Pressable>
            )}
          </View>
          {query && (
            <Text className="font-sans mt-2 text-[11px] text-ink-500">
              {filtered.length} hasil untuk "{q}"
            </Text>
          )}
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {/* Section khusus: Berlangganan Bulanan — perhitungan & jadwal beda */}
        {subscriptionService && !query && (
          <Pressable
            onPress={() => router.push(`/services/${subscriptionService.code}`)}
            className="overflow-hidden rounded-2xl"
            style={{ elevation: 4 }}
          >
            <LinearGradient
              colors={['#7C3AED', '#A855F7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 16 }}
            >
              <View className="flex-row items-start gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                  <CalendarClock color="white" size={26} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <View className="rounded bg-white/20 px-1.5 py-0.5">
                      <Text className="font-extrabold text-[9px] uppercase tracking-wider text-white">Khusus</Text>
                    </View>
                    <View className="rounded bg-amber-400 px-1.5 py-0.5">
                      <Text className="font-extrabold text-[9px] uppercase tracking-wider text-amber-900">Hemat</Text>
                    </View>
                  </View>
                  <Text className="font-extrabold mt-1.5 text-base text-white">Berlangganan Bulanan</Text>
                  <Text className="font-sans mt-0.5 text-[11px] leading-4 text-white/85">
                    3-6× kunjungan per bulan dengan jadwal tetap. Lebih hemat dibanding pesan satuan.
                  </Text>
                </View>
              </View>
              <View className="mt-3 flex-row items-center justify-between rounded-xl bg-white/15 px-3 py-2">
                <View>
                  <Text className="font-medium text-[10px] uppercase tracking-wider text-white/70">Mulai dari</Text>
                  <Text className="font-extrabold text-sm text-white">
                    {subscriptionService.startingPrice > 0
                      ? formatRupiah(subscriptionService.startingPrice) + '/bulan'
                      : 'Konsultasi'}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="font-bold text-[12px] text-white">Lihat Paket</Text>
                  <ChevronRight color="white" size={14} strokeWidth={2.4} />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        )}

        {!query && SERVICE_CATEGORIES.length > 0 && (
          <Text className="font-bold mt-2 text-[11px] uppercase tracking-wider text-ink-500">
            Layanan Satuan
          </Text>
        )}

        {filtered.map((s) => (
          <Pressable
            key={s.code}
            onPress={() => router.push(`/services/${s.code}`)}
            className="flex-row overflow-hidden rounded-2xl bg-white"
          >
            <View className="h-24 w-24 bg-ink-100">
              <Image
                source={s.imageUrl}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
            <View className="flex-1 justify-center p-3">
              <View className="flex-row items-center gap-2">
                <View
                  style={{ backgroundColor: s.iconBg }}
                  className="h-7 w-7 items-center justify-center rounded-lg"
                >
                  {s.customIconUrl ? (
                    <Image source={{ uri: s.customIconUrl }} style={{ width: 18, height: 18 }} contentFit="contain" />
                  ) : (
                    <s.icon color={s.iconColor} size={16} strokeWidth={2.2} />
                  )}
                </View>
                <Text className="font-semibold text-sm text-ink-900">{s.name}</Text>
              </View>
              <Text className="font-sans mt-1 text-[11px] text-ink-500" numberOfLines={1}>
                {s.description}
              </Text>
              {s.startingPrice > 0 && (
                <Text className="font-bold mt-1.5 text-sm text-brand-600">
                  Mulai {formatRupiah(s.startingPrice)}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
        {filtered.length === 0 && (
          <View className="items-center py-12">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-ink-100">
              <Search color="#94A3B8" size={28} />
            </View>
            <Text className="font-semibold mt-3 text-sm text-ink-700">Tidak ada hasil</Text>
            <Text className="font-sans mt-1 text-center text-xs text-ink-500">
              Coba kata kunci lain seperti "kamar", "dapur", atau "full house"
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

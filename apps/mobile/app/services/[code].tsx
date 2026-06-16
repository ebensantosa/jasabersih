import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Clock } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WaIcon } from '../../src/components/BrandIcon';
import { formatRupiah } from '../../src/data/catalog';
import { useServices } from '../../src/hooks/useServices';
import { useApiHourlyTiers, useConfig } from '../../src/stores/appContent';
import { useAuthStore } from '../../src/stores/auth';
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

export default function ServiceDetail() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const tokens = useAuthStore((s) => s.tokens);
  const SERVICE_CATEGORIES = useServices();

  const category = SERVICE_CATEGORIES.find((s) => s.code === code);
  const perRoomEnabled = !!useConfig('booking.modes.per_room.enabled' as any, true);
  const perHourEnabled = !!useConfig('booking.modes.per_hour.enabled' as any, true);
  const hourlyTiers = useApiHourlyTiers();
  const cheapestHourly = hourlyTiers.length > 0 ? Math.min(...hourlyTiers.map((t) => t.pricePerHour * t.minHours)) : 0;
  if (!category) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans">Layanan tidak ditemukan.</Text>
      </SafeAreaView>
    );
  }

  function ensureLogin(go: () => void) {
    if (!tokens) {
      router.push({ pathname: '/(auth)/login', params: { next: `/services/${code}` } });
    } else {
      go();
    }
  }

  if (code === 'konsultasi') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <Text className="font-bold flex-1 text-base text-ink-900">Konsultasi via WhatsApp</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <View className="items-center rounded-3xl bg-emerald-50 p-6">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm" style={{ elevation: 4 }}>
                <WaIcon size={40} />
              </View>
              <Text className="font-extrabold mt-4 text-center text-xl text-ink-900">
                Bingung Pilih Layanan?
              </Text>
              <Text className="font-sans mt-2 text-center text-sm leading-5 text-ink-600">
                Konsultasi langsung dengan CS kami via WhatsApp. Cocok kalau properti kamu besar,
                kondisi unik, atau belum yakin paket mana yang pas.
              </Text>
            </View>

            <View className="mt-4 rounded-2xl bg-white p-4" style={{ elevation: 2 }}>
              <Text className="font-bold text-sm text-ink-900">Kapan pakai konsultasi?</Text>
              <View className="mt-3 gap-2.5">
                {[
                  'Properti besar (rumah 3+ lantai, kantor, gudang)',
                  'Pasca renovasi atau bekas banjir / kebakaran',
                  'Kondisi sangat kotor / kerak parah / jamur tebal',
                  'Kebutuhan khusus (alat berat, vacuum profesional)',
                  'Belum tahu paket mana yang cocok',
                ].map((item, i) => (
                  <View key={i} className="flex-row gap-2">
                    <Text className="font-bold text-emerald-600">✓</Text>
                    <Text className="font-sans flex-1 text-[13px] text-ink-700">{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-4 rounded-2xl bg-amber-50 p-3">
              <Text className="font-semibold text-[11px] text-amber-900">ⓘ Cara kerja</Text>
              <Text className="font-sans mt-1 text-[11px] leading-4 text-amber-900">
                CS akan tanya detail kondisi, jadwal, &amp; lokasi → kami kirim quote harga →
                kalau setuju, langsung dijadwalkan.
              </Text>
            </View>

            <Pressable
              onPress={() => router.push({ pathname: '/booking/wa-survey', params: { category: 'konsultasi' } })}
              className="mt-5 flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4"
              style={{ elevation: 4 }}
            >
              <WaIcon size={20} />
              <Text className="font-bold text-sm text-white">Mulai Konsultasi WA</Text>
            </Pressable>
            <Text className="font-sans mt-2 text-center text-[10px] text-ink-500">
              Atau kembali ke halaman sebelumnya untuk pilih paket langsung
            </Text>
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[]}
        >
          {/* HERO */}
          <View className="relative h-64 w-full bg-ink-200">
            <Image
              source={category.imageUrl}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
            {/* Top dark gradient untuk back button visibility */}
            <LinearGradient
              colors={['rgba(0,0,0,0.5)', 'transparent']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 90 }}
            />
            {/* Bottom gradient (blue-green, samain dgn home hero) untuk text overlay */}
            <LinearGradient
              colors={['transparent', 'rgba(30,58,138,0.55)', 'rgba(4,120,87,0.75)']}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160 }}
            />

            {/* Top action bar */}
            <SafeAreaView edges={['top']} className="absolute left-0 right-0 top-0">
              <View className="flex-row items-center justify-between px-4 py-2">
                <Pressable
                  onPress={() => safeBack()}
                  className="h-10 w-10 items-center justify-center rounded-full bg-white"
                  style={{ elevation: 4 }}
                >
                  <ArrowLeft color="#0F172A" size={20} strokeWidth={2.4} />
                </Pressable>
              </View>
            </SafeAreaView>

            {/* Title overlay */}
            <View className="absolute bottom-8 left-5 right-5">
              <View className="flex-row items-center gap-2">
                <View
                  style={{ backgroundColor: category.iconBg }}
                  className="h-9 w-9 items-center justify-center rounded-xl"
                >
                  {category.customIconUrl ? (
                    <Image source={{ uri: category.customIconUrl }} style={{ width: 22, height: 22 }} contentFit="contain" />
                  ) : (
                    <category.icon color={category.iconColor} size={18} strokeWidth={2.2} />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-xl text-white" numberOfLines={1}>
                    {category.name}
                  </Text>
                  <Text className="font-medium text-[11px] text-white/85" numberOfLines={1}>
                    {category.description}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Content card lifted over hero with rounded top */}
          <View
            className="-mt-5 rounded-t-3xl bg-ink-50 px-4 pb-4 pt-5"
            style={{ minHeight: 400 }}
          >
            {/* Drag handle (visual hint) */}
            <View className="mb-4 self-center h-1 w-10 rounded-full bg-ink-300" />

            <Text className="font-bold text-base text-ink-900">Pilih Cara Pesan</Text>
            <Text className="font-sans mt-0.5 text-xs text-ink-500">
              Pilih cara pemesanan yang sesuai dengan kebutuhanmu
            </Text>

            {category.isActive === false && (
              <View className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                <Text className="font-bold text-sm text-amber-900">🔧 Layanan Sedang Tidak Tersedia</Text>
                <Text className="font-medium mt-1 text-[11px] leading-4 text-amber-800">
                  Layanan {category.name} lagi maintenance / pause sementara. Coba lagi nanti atau pilih layanan lain.
                </Text>
              </View>
            )}

            <View className="mt-4 gap-2.5" style={category.isActive === false ? { opacity: 0.5 } : undefined} pointerEvents={category.isActive === false ? 'none' : 'auto'}>
              {perRoomEnabled && (
                <ModeCard
                  renderIcon={() =>
                    category.customIconUrl ? (
                      <Image source={{ uri: category.customIconUrl }} style={{ width: 26, height: 26 }} contentFit="contain" />
                    ) : (
                      <category.icon color={category.iconColor} size={26} strokeWidth={2.2} />
                    )
                  }
                  iconBg={category.iconBg}
                  title="Per Ruangan"
                  tagline="Harga tetap"
                  tag="Paling Populer"
                  desc="Bayar sesuai paket per ruangan. Total pasti tahu di muka."
                  priceHint={
                    category.startingPrice > 0
                      ? `Mulai ${formatRupiah(category.startingPrice)}`
                      : undefined
                  }
                  onPress={() =>
                    ensureLogin(() =>
                      router.push({ pathname: '/booking/new', params: { category: code } }),
                    )
                  }
                />
              )}

              {perHourEnabled && hourlyTiers.length > 0 && (
                <ModeCard
                  renderIcon={() => <Clock color="#1D4ED8" size={26} strokeWidth={2.2} />}
                  iconBg="#DBEAFE"
                  title="Per Jam"
                  tagline="Fleksibel sesuai durasi"
                  desc="Pilih durasi 2-8 jam. Cleaner kerjain apapun dalam waktu itu sesuai prioritas kamu."
                  priceHint={cheapestHourly > 0 ? `Mulai ${formatRupiah(cheapestHourly)}` : undefined}
                  onPress={() =>
                    ensureLogin(() =>
                      router.push({ pathname: '/booking/hourly', params: { category: code } }),
                    )
                  }
                />
              )}

              <ModeCard
                renderIcon={() => <WaIcon size={26} />}
                iconBg="#D1FAE5"
                title="Konsultasi via WhatsApp"
                tagline="Untuk job kompleks"
                desc="Properti besar, pasca renovasi, atau kebutuhan unik. CS hubungi untuk survey & quote."
                priceHint={undefined}
                onPress={() =>
                  router.push({ pathname: '/booking/wa-survey', params: { category: code } })
                }
              />
            </View>

            <View className="mt-5 rounded-2xl bg-brand-50 p-3">
              <Text className="font-semibold text-[11px] text-brand-900">💡 Tips memilih</Text>
              <Text className="font-sans mt-1 text-[11px] leading-4 text-brand-900">
                <Text className="font-bold">Per Ruangan</Text> cocok untuk job rutin (harga jelas di muka).{perHourEnabled && hourlyTiers.length > 0 ? <> <Text className="font-bold">Per Jam</Text> untuk yang butuh fleksibilitas durasi.</> : null}{' '}
                <Text className="font-bold">WA Survey</Text> untuk properti besar / pasca renovasi / kebutuhan unik.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

function ModeCard({
  renderIcon,
  iconBg,
  title,
  tagline,
  tag,
  desc,
  priceHint,
  onPress,
}: {
  renderIcon: () => React.ReactNode;
  iconBg: string;
  title: string;
  tagline: string;
  tag?: string;
  desc: string;
  priceHint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl bg-white p-4"
      style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 }}
    >
      <View className="flex-row items-start gap-3">
        <View
          style={{ backgroundColor: iconBg }}
          className="h-12 w-12 items-center justify-center rounded-2xl"
        >
          {renderIcon()}
        </View>
        <View className="flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-bold text-[15px] text-ink-900">{title}</Text>
            {tag && (
              <View className="rounded-full bg-amber-100 px-2 py-0.5">
                <Text className="font-bold text-[10px] text-amber-800">{tag}</Text>
              </View>
            )}
          </View>
          <Text className="font-medium mt-0.5 text-[11px] text-brand-600">{tagline}</Text>
          <Text className="font-sans mt-2 text-[12px] leading-[18px] text-ink-600">{desc}</Text>
          {priceHint && (
            <View className="mt-2.5 self-start rounded-md bg-brand-50 px-2 py-1">
              <Text className="font-bold text-[11px] text-brand-700">{priceHint}</Text>
            </View>
          )}
        </View>
        <ChevronRight color="#94A3B8" size={18} />
      </View>
    </Pressable>
  );
}

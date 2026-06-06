import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Bell,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Wallet,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BannerCarousel } from '../../src/components/BannerCarousel';
import { FeaturedCleaners } from '../../src/components/FeaturedCleaners';
import { WaIcon } from '../../src/components/BrandIcon';
import { NotifBell } from '../../src/components/NotifBell';
import { formatRupiah } from '../../src/data/catalog';
import { useServices } from '../../src/hooks/useServices';
import { useT } from '../../src/lib/i18n';
import { useAddressesStore } from '../../src/stores/addresses';
import { useConfig } from '../../src/stores/appContent';
import { useModeStore } from '../../src/stores/mode';
import { shortenAddress } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';
import { useUserStore } from '../../src/stores/user';

export default function Home() {
  const router = useRouter();
  const mode = useModeStore((s) => s.mode);
  const ctaAnimated = useConfig('home.cta_animated' as any, false as any) as unknown as boolean;
  const ctaImageUrl = useConfig('home.cta_image_url' as any, '' as any) as unknown as string;
  const pulse = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (!ctaAnimated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ctaAnimated, pulse]);

  // Cleaner mode → redirect ke Job Board (customer home gak relevan)
  useEffect(() => {
    if (mode === 'freelancer') router.replace('/(tabs)/jobs');
  }, [mode]);
  const addresses = useAddressesStore((s) => s.list);
  const setDefault = useAddressesStore((s) => s.setDefault);
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const ALL_SERVICES_RAW = useServices();
  // Always put 'konsultasi' last so it lands bottom-right of the grid
  const ALL_SERVICES = [...ALL_SERVICES_RAW].sort((a, b) => {
    if (a.code === 'konsultasi') return 1;
    if (b.code === 'konsultasi') return -1;
    return 0;
  });
  // Hide mode-toggles (general/deep cleaning) — they are picker options inside booking, not destinations
  const HIDDEN_CODES = new Set(['general_cleaning', 'deep_cleaning']);
  // Grid layanan reguler di Home: NOT bundle + showOnHome.
  const SERVICE_CATEGORIES_ALL = ALL_SERVICES.filter((s) => !HIDDEN_CODES.has(s.code) && !s.isBundle && s.showOnHome !== false);
  // Max 7 tile + 1 "Lihat semua" = 8 total (2 baris × 4 kolom)
  const HOME_TILE_LIMIT = 7;
  const SERVICE_CATEGORIES = SERVICE_CATEGORIES_ALL.slice(0, HOME_TILE_LIMIT);
  const hasMoreServices = SERVICE_CATEGORIES_ALL.length > HOME_TILE_LIMIT;
  // Section "Paket Lengkap": yang ditandai admin sebagai bundle.
  const BUNDLE_SERVICES = ALL_SERVICES.filter((s) => s.isBundle);
  const t = useT();
  const profile = useUserStore((s) => s.profile);
  const firstName = profile?.name?.trim().split(' ')[0] ?? null;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 11) return 'Selamat pagi';
    if (h < 15) return 'Selamat siang';
    if (h < 18) return 'Selamat sore';
    return 'Selamat malam';
  })();

  return (
    <View className="flex-1 bg-ink-50">
      {/* Hero header dengan U-shape curve (Gojek/Traveloka style) — gradient lebih cerah & welcoming */}
      <LinearGradient
        colors={['#0B2A6F', '#1E40AF', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 24 }}
      >
        {/* Decorative blob untuk depth visual (pojok kanan atas) */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 40,
            right: 30,
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: 'rgba(255,255,255,0.06)',
          }}
        />
        <SafeAreaView edges={['top']}>
          <View className="px-4 pb-2 pt-1">
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => {
                  if (addresses.length === 0) {
                    router.push('/addresses/edit');
                  } else {
                    setPickerOpen(true);
                  }
                }}
                className="flex-1 flex-row items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <MapPin color="white" size={15} strokeWidth={2.4} />
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-[10px] text-white/70" numberOfLines={1}>
                    {firstName
                      ? `Hai ${firstName}, ${greeting.toLowerCase()}`
                      : defaultAddress
                        ? `${t('home.send_to')} · ${defaultAddress.label}`
                        : t('home.no_address')}
                  </Text>
                  <Text
                    className="font-semibold text-xs text-white"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {defaultAddress?.addressLine ?? t('home.tap_to_add')}
                  </Text>
                </View>
                <ChevronDown color="rgba(255,255,255,0.7)" size={16} />
              </Pressable>
              <View className="rounded-full bg-white/15">
                <NotifBell tint="white" />
              </View>
            </View>

            <Pressable
              onPress={() => router.push('/booking/custom')}
              className="mt-3 overflow-hidden rounded-2xl bg-white"
              style={{
                elevation: 4,
                shadowColor: '#0F172A',
                shadowOpacity: 0.12,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
              }}
            >
              <View style={{ paddingVertical: 14, paddingHorizontal: 16, position: 'relative' }}>
                {/* Subtle accent strip kiri */}
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    backgroundColor: '#1D4ED8',
                  }}
                />

                <View className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text className="font-extrabold text-base text-ink-900">Bersih Full Custom</Text>
                    <Text className="font-medium mt-0.5 text-[11px] text-ink-500" numberOfLines={1}>
                      Pilih sendiri layanan & jumlahnya, bayar sesuai pakai
                    </Text>
                    <View className="mt-2 self-start bg-brand-600 px-3 py-1" style={{ borderRadius: 8 }}>
                      <Text className="font-extrabold text-[10px] text-white">PESAN SEKARANG</Text>
                    </View>
                  </View>
                  {ctaImageUrl ? (
                    <Image
                      source={{ uri: ctaImageUrl }}
                      style={{ width: 48, height: 48 }}
                      contentFit="contain"
                    />
                  ) : (
                    <Animated.View
                      style={{
                        backgroundColor: '#1D4ED8',
                        height: 36,
                        width: 36,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 18,
                        transform: ctaAnimated ? [{ scale: pulse }] : [],
                      }}
                    >
                      <ChevronRight color="white" size={18} strokeWidth={3} />
                    </Animated.View>
                  )}
                </View>
              </View>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        style={{ backgroundColor: '#EFF4FB', marginTop: -20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Curved top transition card - Gojek/Grab style */}
        <View
          style={{
            backgroundColor: '#EFF4FB',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
          }}
        >
          {/* Soft gradient fade dari header biru ke body */}
          <LinearGradient
            colors={['rgba(37,99,235,0.08)', 'rgba(37,99,235,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
            pointerEvents="none"
          />
        {/* Service grid 4 col */}
        <View className="mx-4 mt-1 rounded-2xl bg-white px-2 py-3" style={{ elevation: 2, shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
          <View className="flex-row flex-wrap">
            {SERVICE_CATEGORIES.map((s) => {
              const isKonsul = s.code === 'konsultasi';
              return (
                <Pressable
                  key={s.code}
                  onPress={() =>
                    isKonsul
                      ? router.push('/services/konsultasi')
                      : router.push(`/services/${s.code}`)
                  }
                  className="w-1/4 items-center px-1 py-2"
                >
                  <View
                    style={{ backgroundColor: isKonsul ? '#D1FAE5' : s.iconBg }}
                    className="h-12 w-12 items-center justify-center rounded-2xl"
                  >
                    {isKonsul ? (
                      <WaIcon size={22} />
                    ) : s.customIconUrl ? (
                      <Image source={{ uri: s.customIconUrl }} style={{ width: 26, height: 26 }} contentFit="contain" />
                    ) : (
                      <s.icon color={s.iconColor} size={22} strokeWidth={2} />
                    )}
                  </View>
                  <Text
                    className="font-medium mt-1.5 text-center text-[10px] leading-tight text-ink-700"
                    numberOfLines={2}
                  >
                    {isKonsul ? 'Konsultasi WA' : s.name}
                  </Text>
                </Pressable>
              );
            })}
            {hasMoreServices && (
              <Pressable
                onPress={() => router.push('/(tabs)/explore')}
                className="w-1/4 items-center px-1 py-2"
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-100">
                  <ChevronRight color="#1D4ED8" size={22} strokeWidth={2.4} />
                </View>
                <Text
                  className="font-medium mt-1.5 text-center text-[10px] leading-tight text-brand-700"
                  numberOfLines={2}
                >
                  Lihat Semua
                </Text>
              </Pressable>
            )}
          </View>
        </View>


        {BUNDLE_SERVICES.length > 0 && (
          <View className="mt-6">
            <View className="mb-3 flex-row items-end justify-between px-4">
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="font-extrabold text-base text-ink-900">Paket Lengkap</Text>
                  <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: '#F97316' }}>
                    <Text className="font-extrabold text-[9px] uppercase tracking-wider text-white">Hemat</Text>
                  </View>
                </View>
                <Text className="font-sans mt-0.5 text-[11px] text-ink-500">Combo all-in untuk rumah, kantor & berkala</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/explore')}>
                <Text className="font-semibold text-[12px] text-brand-600">Lihat semua ›</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3 px-4">
                {BUNDLE_SERVICES.map((s, idx) => (
                  <Pressable
                    key={s.code}
                    onPress={() => router.push(`/services/${s.code}`)}
                    style={{
                      width: 220,
                      elevation: 4,
                      shadowColor: '#0F172A',
                      shadowOpacity: 0.12,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                    }}
                    className="overflow-hidden rounded-2xl bg-white"
                  >
                    <View style={{ position: 'relative', height: 112, width: '100%', backgroundColor: '#E2E8F0' }}>
                      <Image source={s.imageUrl} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
                      <LinearGradient
                        colors={['rgba(15,23,42,0.0)', 'rgba(15,23,42,0.85)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                      />
                      <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 }}>
                        <View style={{ backgroundColor: '#F97316', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text className="font-extrabold text-[9px] uppercase tracking-wider text-white">Combo</Text>
                        </View>
                        {idx === 0 && (
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text className="font-extrabold text-[9px] uppercase tracking-wider text-ink-900">Best Seller</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ position: 'absolute', bottom: 8, left: 10, right: 10 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontFamily: 'Inter_800ExtraBold',
                            fontSize: 14,
                            lineHeight: 18,
                            color: 'white',
                            textShadowColor: 'rgba(0,0,0,0.6)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 3,
                          }}
                        >
                          {s.name}
                        </Text>
                      </View>
                    </View>
                    <View className="p-2.5">
                      <Text className="font-sans text-[11px] text-ink-600" numberOfLines={2}>{s.description}</Text>
                      <View className="mt-1.5 flex-row items-end justify-between">
                        <View>
                          <Text className="font-sans text-[9px] uppercase tracking-wider text-ink-400">Mulai dari</Text>
                          <Text className="font-extrabold text-[14px] text-brand-600">
                            {s.startingPrice > 0 ? formatRupiah(s.startingPrice) : 'WA Survey'}
                          </Text>
                        </View>
                        <View className="rounded-full bg-brand-50 px-2 py-1">
                          <Text className="font-bold text-[10px] text-brand-700">Pesan ›</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View className="mt-6">
          <BannerCarousel />
        </View>

        <View className="mt-6">
          <FeaturedCleaners />
        </View>

        <View className="mt-6">
          <View className="mb-3 flex-row items-center justify-between px-4">
            <Text className="font-extrabold text-base text-ink-900">{t('home.popular')}</Text>
            <Pressable onPress={() => router.push('/(tabs)/explore')} className="flex-row items-center">
              <Text className="font-semibold text-xs text-brand-600">{t('home.see_all')}</Text>
              <ChevronRight color="#2563EB" size={14} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-3 px-4">
              {SERVICE_CATEGORIES.filter((s) => s.popular).map((s) => (
                <Pressable
                  key={s.code}
                  onPress={() => router.push(`/services/${s.code}`)}
                  style={{ width: 180, elevation: 1 }}
                  className="overflow-hidden rounded-xl border border-ink-100 bg-white"
                >
                  <View className="h-24 w-full bg-ink-100">
                    <Image source={s.imageUrl} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  </View>
                  <View className="p-2.5">
                    <Text className="font-semibold text-[13px] text-ink-900" numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text className="font-sans mt-0.5 text-[10px] text-ink-500" numberOfLines={1}>
                      {s.description}
                    </Text>
                    <Text className="font-bold mt-1.5 text-[12px] text-brand-600">
                      Mulai {formatRupiah(s.startingPrice)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        <SectionHeader title="Cara Kerja" />
        <View className="mx-4 rounded-2xl bg-white p-4">
          <View className="gap-3">
            <Step
              n={1}
              icon={Search}
              title="Pilih Layanan"
              desc="Pilih jenis bersih + cara pesan (per ruangan / WA)"
            />
            <Connector />
            <Step
              n={2}
              icon={CalendarCheck}
              title="Atur Jadwal & Lokasi"
              desc="Pin alamat di peta, pilih tanggal & jam, lihat total harga"
            />
            <Connector />
            <Step
              n={3}
              icon={Sparkles}
              title="Cleaner Datang & Bayar"
              desc="Cleaner tervalidasi datang sesuai jadwal. Bayar via QRIS/e-wallet/VA"
            />
          </View>
        </View>

        </View>
      </ScrollView>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          onPress={() => setPickerOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' }}
        >
          <Pressable
            onPress={() => {}}
            className="mt-auto rounded-t-3xl bg-white"
            style={{ maxHeight: '80%' }}
          >
            <SafeAreaView edges={['bottom']}>
              <View className="self-center mt-2 mb-3 h-1 w-10 rounded-full bg-ink-300" />
              <View className="flex-row items-center justify-between px-5 pb-2">
                <Text className="font-bold text-base text-ink-900">Pilih Alamat Utama</Text>
                <Pressable
                  onPress={() => {
                    setPickerOpen(false);
                    router.push('/addresses/edit');
                  }}
                  className="flex-row items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5"
                >
                  <Plus color="#1D4ED8" size={12} strokeWidth={2.4} />
                  <Text className="font-semibold text-xs text-brand-700">Tambah</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingTop: 4 }}>
                {addresses.map((a) => {
                  const active = a.isDefault;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => {
                        setDefault(a.id);
                        toast.success(`Alamat utama: ${a.label}`);
                        setPickerOpen(false);
                      }}
                      className={`rounded-xl border p-3 ${
                        active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                      }`}
                    >
                      <View className="flex-row items-center gap-2">
                        <Tag color={active ? '#1D4ED8' : '#64748B'} size={12} strokeWidth={2.4} />
                        <Text className="font-bold text-sm text-ink-900">{a.label}</Text>
                        {a.isDefault && (
                          <View className="rounded-full bg-brand-100 px-2 py-0.5">
                            <Text className="font-bold text-[9px] text-brand-700">UTAMA</Text>
                          </View>
                        )}
                        <View className="flex-1" />
                        {active && <ChevronRight color="#1D4ED8" size={14} />}
                      </View>
                      <Text className="font-medium mt-1 text-xs text-ink-700">
                        {a.recipientName} · {a.recipientPhone}
                      </Text>
                      <Text className="font-sans mt-0.5 text-[11px] text-ink-500" numberOfLines={2}>
                        {a.addressLine}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => {
                    setPickerOpen(false);
                    router.push('/account/addresses');
                  }}
                  className="mt-2 flex-row items-center justify-center gap-1.5 py-3"
                >
                  <MapPin color="#1D4ED8" size={14} />
                  <Text className="font-semibold text-xs text-brand-700">Kelola Semua Alamat →</Text>
                </Pressable>
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ModeBtn({
  icon: Icon,
  renderIcon,
  label,
  sub,
  onPress,
}: {
  icon?: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  renderIcon?: () => React.ReactNode;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center py-1.5">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
        {renderIcon ? renderIcon() : Icon ? <Icon color="#1D4ED8" size={18} strokeWidth={2.2} /> : null}
      </View>
      <Text className="font-bold mt-1 text-[11px] text-ink-900">{label}</Text>
      <Text className="font-medium text-[9px] text-ink-500">{sub}</Text>
    </Pressable>
  );
}

function Divider() {
  return <View className="my-2 w-px bg-ink-100" />;
}

function Step({
  n,
  icon: Icon,
  title,
  desc,
}: {
  n: number;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  title: string;
  desc: string;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="items-center">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-600">
          <Text className="font-bold text-sm text-white">{n}</Text>
        </View>
      </View>
      <View className="flex-1 pt-1">
        <View className="flex-row items-center gap-2">
          <Icon color="#1D4ED8" size={16} strokeWidth={2.2} />
          <Text className="font-bold text-sm text-ink-900">{title}</Text>
        </View>
        <Text className="font-sans mt-0.5 text-[11px] leading-4 text-ink-600">{desc}</Text>
      </View>
    </View>
  );
}

function Connector() {
  return <View className="ml-5 h-4 w-0.5 bg-brand-200" />;
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mt-5 mb-3 flex-row items-center justify-between px-4">
      <Text className="font-bold text-[15px] text-ink-900">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} className="flex-row items-center">
          <Text className="font-semibold text-xs text-brand-600">{actionLabel}</Text>
          <ChevronRight color="#2563EB" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

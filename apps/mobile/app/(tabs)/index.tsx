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
  Sparkles,
  Tag,
  Wallet,
} from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BannerCarousel } from '../../src/components/BannerCarousel';
import { FeaturedCleaners } from '../../src/components/FeaturedCleaners';
import { WaIcon } from '../../src/components/BrandIcon';
import { NotifBell } from '../../src/components/NotifBell';
import { formatRupiah } from '../../src/data/catalog';
import { useServices } from '../../src/hooks/useServices';
import { useT } from '../../src/lib/i18n';
import { useAddressesStore } from '../../src/stores/addresses';
import { shortenAddress } from '../../src/stores/location';
import { toast } from '../../src/stores/ui';

export default function Home() {
  const router = useRouter();
  const addresses = useAddressesStore((s) => s.list);
  const setDefault = useAddressesStore((s) => s.setDefault);
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const ALL_SERVICES = useServices();
  // Hide mode-toggles (general/deep cleaning) — they are picker options inside booking, not destinations
  const HIDDEN_CODES = new Set(['general_cleaning', 'deep_cleaning']);
  const BUNDLE_CODES = new Set(['full_house', 'kos', 'kantor', 'pasca_renovasi', 'subscription', 'bundle']);
  const SERVICE_CATEGORIES = ALL_SERVICES.filter((s) => !HIDDEN_CODES.has(s.code) && !BUNDLE_CODES.has(s.code));
  const BUNDLE_SERVICES = ALL_SERVICES.filter((s) => BUNDLE_CODES.has(s.code));
  const t = useT();

  return (
    <View className="flex-1 bg-ink-50">
      {/* Compact gradient header */}
      <LinearGradient colors={['#0B2A6F', '#1D4ED8']} style={{ paddingBottom: 64 }}>
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
                className="flex-1 flex-row items-center gap-1.5 rounded-full bg-white/15 px-3 py-2"
              >
                <MapPin color="white" size={14} strokeWidth={2.4} />
                <View className="flex-1">
                  <Text className="font-medium text-[10px] text-white/70">
                    {defaultAddress ? `${t('home.send_to')} · ${defaultAddress.label}` : t('home.no_address')}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Text
                      className="font-semibold flex-1 text-xs text-white"
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {defaultAddress?.addressLine ?? t('home.tap_to_add')}
                    </Text>
                    <ChevronDown color="white" size={12} />
                  </View>
                </View>
              </Pressable>
              <View className="rounded-full bg-white/15">
                <NotifBell tint="white" />
              </View>
            </View>

            <Pressable
              onPress={() => router.push('/(tabs)/explore')}
              className="mt-3 flex-row items-center gap-2 rounded-2xl bg-white px-4 py-3"
              style={{ elevation: 2 }}
            >
              <Search color="#64748B" size={18} />
              <Text className="font-medium flex-1 text-sm text-ink-500">
                Cari layanan, mis. dapur, kamar…
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        style={{ marginTop: -52 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick mode picker */}
        <View
          className="mx-4 flex-row gap-2 rounded-2xl bg-white p-2.5"
          style={{ elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 }}
        >
          <ModeBtn icon={Wallet} label={t('home.mode_packages')} sub={t('home.mode_packages_sub')} onPress={() => router.push('/(tabs)/explore')} />
          <Divider />
          <ModeBtn icon={Clock} label={t('home.mode_hourly')} sub={t('home.mode_hourly_sub')} onPress={() => router.push('/booking/hourly')} />
          <Divider />
          <ModeBtn
            renderIcon={() => <WaIcon size={18} />}
            label={t('home.mode_wa')}
            sub={t('home.mode_wa_sub')}
            onPress={() => router.push('/booking/wa-survey')}
          />
        </View>

        {/* Service grid 4 col */}
        <View className="mx-4 mt-3 rounded-2xl bg-white px-2 py-3">
          <View className="flex-row flex-wrap">
            {SERVICE_CATEGORIES.map((s) => (
              <Pressable
                key={s.code}
                onPress={() => router.push(`/services/${s.code}`)}
                className="w-1/4 items-center px-1 py-2"
              >
                <View
                  style={{ backgroundColor: s.iconBg }}
                  className="h-12 w-12 items-center justify-center rounded-2xl"
                >
                  <s.icon color={s.iconColor} size={22} strokeWidth={2} />
                </View>
                <Text
                  className="font-medium mt-1.5 text-center text-[10px] leading-tight text-ink-700"
                  numberOfLines={2}
                >
                  {s.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {BUNDLE_SERVICES.length > 0 && (
          <View className="mx-4 mt-4">
            <View className="mb-2 flex-row items-center justify-between">
              <View>
                <Text className="font-bold text-sm text-ink-900">Paket Lengkap</Text>
                <Text className="font-sans text-[10px] text-ink-500">Combo hemat untuk area besar / berkala</Text>
              </View>
              <View className="rounded-full bg-amber-100 px-2 py-0.5">
                <Text className="font-bold text-[9px] uppercase tracking-wider text-amber-800">Combo</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pr-4">
                {BUNDLE_SERVICES.map((s) => (
                  <Pressable
                    key={s.code}
                    onPress={() => router.push(`/services/${s.code}`)}
                    style={{ width: 160 }}
                    className="overflow-hidden rounded-2xl"
                  >
                    <LinearGradient
                      colors={['#1E40AF', '#7C3AED']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ padding: 12, minHeight: 110 }}
                    >
                      <View className="h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                        <s.icon color="white" size={18} strokeWidth={2.2} />
                      </View>
                      <Text className="font-bold mt-2 text-[13px] text-white" numberOfLines={1}>{s.name}</Text>
                      <Text className="font-sans mt-0.5 text-[10px] text-white/80" numberOfLines={2}>{s.description}</Text>
                      {s.startingPrice > 0 && (
                        <Text className="font-bold mt-1.5 text-[11px] text-white">Mulai {formatRupiah(s.startingPrice)}</Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View className="mt-4">
          <BannerCarousel />
        </View>

        <FeaturedCleaners />

        <SectionHeader
          title={t('home.popular')}
          actionLabel={t('home.see_all')}
          onAction={() => router.push('/(tabs)/explore')}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3 px-4 pb-1">
            {SERVICE_CATEGORIES.filter((s) => s.popular).map((s) => (
              <Pressable
                key={s.code}
                onPress={() => router.push(`/services/${s.code}`)}
                style={{ width: 180 }}
                className="overflow-hidden rounded-2xl bg-white"
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

        <SectionHeader title="Cara Kerja" />
        <View className="mx-4 rounded-2xl bg-white p-4">
          <View className="gap-3">
            <Step
              n={1}
              icon={Search}
              title="Pilih Layanan"
              desc="Pilih jenis bersih + cara pesan (per ruangan / per jam / WA)"
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

        <View className="mx-4 mt-5">
          <Pressable
            onPress={() => router.push('/(auth)/cleaner-onboarding')}
            className="overflow-hidden rounded-2xl"
          >
            <LinearGradient colors={['#1E40AF', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View className="flex-row items-center gap-3 p-4">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Wallet color="white" size={22} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-sm text-white">Jadi Mitra Cleaner</Text>
                  <Text className="font-sans mt-0.5 text-[11px] text-white/85">
                    Kerja fleksibel, payout harian, asuransi termasuk
                  </Text>
                </View>
                <ChevronRight color="white" size={18} />
              </View>
            </LinearGradient>
          </Pressable>
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

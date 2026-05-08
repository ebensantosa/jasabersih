import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  Bell,
  Briefcase,
  ChevronRight,
  CreditCard,
  Gift,
  Globe,
  HelpCircle,
  LogIn,
  LogOut,
  MapPin,
  Settings,
  Shield,
  Star,
  Tag,
  User,
} from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '../../src/stores/auth';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';

export default function Profile() {
  const router = useRouter();
  const tokens = useAuthStore((s) => s.tokens);
  const logout = useAuthStore((s) => s.logout);
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);

  return (
    <View className="flex-1 bg-ink-50">
      <LinearGradient colors={['#0B2A6F', '#1D4ED8']} style={{ paddingBottom: 60 }}>
        <SafeAreaView edges={['top']}>
          <View className="px-5 pb-2 pt-3">
            <Text className="font-bold text-xl text-white">Profil</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
        style={{ marginTop: -45 }}
        showsVerticalScrollIndicator={false}
      >
        {tokens ? (
          <View className="rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 4 }}>
            <View className="flex-row items-center gap-3">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-100">
                <User color="#1D4ED8" size={26} strokeWidth={2} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-base text-ink-900">User Test</Text>
                <Text className="font-sans text-xs text-ink-500">user@test.com</Text>
                <View className="mt-1 flex-row items-center gap-1">
                  <Star color="#F59E0B" fill="#F59E0B" size={12} />
                  <Text className="font-medium text-[11px] text-ink-600">Member · 2026</Text>
                </View>
              </View>
              <ChevronRight color="#94A3B8" size={18} />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => router.push('/(auth)/login')}
            className="overflow-hidden rounded-2xl"
            style={{ elevation: 4 }}
          >
            <LinearGradient colors={['#1D4ED8', '#2563EB']} style={{ padding: 18 }}>
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-white/20">
                  <LogIn color="white" size={22} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-base text-white">Login / Daftar</Text>
                  <Text className="font-sans text-xs text-white/85">
                    Akses pesanan, wallet, dan promo
                  </Text>
                </View>
                <ArrowRight color="white" size={18} />
              </View>
            </LinearGradient>
          </Pressable>
        )}

        {tokens && (
          <View className="rounded-2xl bg-white p-1.5">
            <View className="flex-row">
              <Pressable
                onPress={() => setMode('customer')}
                className={`flex-1 items-center rounded-xl py-2.5 ${
                  mode === 'customer' ? 'bg-brand-600' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`font-semibold text-xs ${
                    mode === 'customer' ? 'text-white' : 'text-ink-500'
                  }`}
                >
                  Mode Customer
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('freelancer')}
                className={`flex-1 items-center rounded-xl py-2.5 ${
                  mode === 'freelancer' ? 'bg-brand-700' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`font-semibold text-xs ${
                    mode === 'freelancer' ? 'text-white' : 'text-ink-500'
                  }`}
                >
                  Mode Cleaner
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {!tokens && (
          <Pressable
            onPress={() => router.push('/(auth)/cleaner-onboarding')}
            className="rounded-2xl bg-white p-4"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
                <Briefcase color="#1D4ED8" size={20} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-sm text-ink-900">Jadi Mitra Cleaner</Text>
                <Text className="font-sans text-xs text-ink-500">
                  Kerja fleksibel, payout harian
                </Text>
              </View>
              <ChevronRight color="#94A3B8" size={18} />
            </View>
          </Pressable>
        )}

        {tokens && mode === 'freelancer' && (
          <Section
            title="Mitra Cleaner"
            items={[
              { icon: CreditCard, label: 'Wallet & Penarikan', onPress: () => router.push('/cleaner/wallet') },
              { icon: MapPin, label: 'Area Layananku', onPress: () => router.push('/cleaner/areas') },
              { icon: Briefcase, label: 'Status KYC & Verifikasi', onPress: () => toast.comingSoon() },
            ]}
          />
        )}

        <Section
          title="Akun"
          items={[
            { icon: MapPin, label: 'Alamat Tersimpan', onPress: () => router.push('/account/addresses') },
            { icon: CreditCard, label: 'Wallet & Pembayaran', onPress: () => router.push('/account/wallet') },
            { icon: Gift, label: 'Referral & Bonus', onPress: () => router.push('/account/referral') },
            { icon: Tag, label: 'Voucher Saya', onPress: () => router.push('/account/vouchers') },
            { icon: Bell, label: 'Notifikasi', onPress: () => router.push('/notifications') },
          ]}
        />

        <Section
          title="Lainnya"
          items={[
            { icon: Globe, label: 'Bahasa / Language', onPress: () => router.push('/account/language') },
            { icon: Shield, label: 'Keamanan & Privasi', onPress: () => router.push('/account/security') },
            { icon: HelpCircle, label: 'Pusat Bantuan', onPress: () => router.push('/account/help') },
            { icon: Settings, label: 'Pengaturan', onPress: () => router.push('/account/settings') },
          ]}
        />

        {tokens && (
          <Pressable
            onPress={() => logout()}
            className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl bg-white p-4"
          >
            <LogOut color="#DC2626" size={18} strokeWidth={2.2} />
            <Text className="font-semibold text-sm text-danger">Logout</Text>
          </Pressable>
        )}

        <Text className="font-sans mt-3 text-center text-[11px] text-ink-400">
          JasaBersih v0.1.0
        </Text>
      </ScrollView>
    </View>
  );
}

type MenuItem = {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
};

function Section({
  title,
  items,
  children,
}: {
  title: string;
  items?: MenuItem[];
  children?: React.ReactNode;
}) {
  return (
    <View>
      <Text className="font-semibold mb-2 ml-1 text-[11px] uppercase tracking-wider text-ink-400">
        {title}
      </Text>
      <View className="rounded-2xl bg-white">
        {items?.map((it, i) => (
          <Pressable
            key={it.label}
            onPress={() => {
              try {
                it.onPress();
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[MenuRow]', it.label, e);
              }
            }}
            android_ripple={{ color: '#F1F5F9' }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: i < items.length - 1 ? 1 : 0,
              borderBottomColor: '#F1F5F9',
            })}
          >
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-ink-50">
              <it.icon color="#475569" size={18} strokeWidth={2.2} />
            </View>
            <Text className="font-medium flex-1 text-sm text-ink-800">{it.label}</Text>
            <ChevronRight color="#CBD5E1" size={18} />
          </Pressable>
        ))}
        {children}
      </View>
    </View>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#F1F5F9' }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.6 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
      })}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-ink-50">
        <Icon color="#475569" size={18} strokeWidth={2.2} />
      </View>
      <Text className="font-medium flex-1 text-sm text-ink-800">{label}</Text>
      <ChevronRight color="#CBD5E1" size={18} />
    </Pressable>
  );
}

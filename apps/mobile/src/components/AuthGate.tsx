import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Lock, ShieldAlert } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { UserMode } from '@jasabersih/shared-types';

import { useAuthStore } from '../stores/auth';
import { useModeStore } from '../stores/mode';

type Props = {
  children: React.ReactNode;
  /** Restrict access to a specific mode (customer/freelancer). Omit for any-logged-in. */
  requireMode?: UserMode;
  /** Title shown in the not-allowed screen */
  title?: string;
  /** Optional message override */
  message?: string;
};

export function AuthGate({ children, requireMode, title, message }: Props) {
  const router = useRouter();
  const tokens = useAuthStore((s) => s.tokens);
  const mode = useModeStore((s) => s.mode);

  // Anonymous → must login
  if (!tokens) {
    return (
      <View className="flex-1 bg-white">
        <LinearGradient colors={['#0B2A6F', '#1D4ED8']} style={{ height: 180 }}>
          <SafeAreaView edges={['top']} />
        </LinearGradient>
        <View className="flex-1 items-center px-6 -mt-16">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-white shadow-md" style={{ elevation: 6 }}>
            <Lock color="#1D4ED8" size={36} strokeWidth={2.2} />
          </View>
          <Text className="font-extrabold mt-5 text-center text-xl text-ink-900">{title ?? 'Login Dulu Yuk'}</Text>
          <Text className="font-sans mt-2 text-center text-sm text-ink-600">
            {message ?? 'Halaman ini cuma bisa diakses setelah kamu login. Gratis & cuma butuh nomor HP.'}
          </Text>
          <Pressable
            onPress={() => router.replace('/(auth)/login')}
            className="mt-6 w-full rounded-2xl bg-brand-600 py-4"
          >
            <Text className="font-bold text-center text-sm text-white">Masuk Sekarang</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/(auth)/register')} className="mt-3">
            <Text className="font-sans text-center text-sm text-ink-500">
              Belum punya akun? <Text className="font-semibold text-brand-600">Daftar</Text>
            </Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/(tabs)')} className="mt-6">
            <Text className="font-medium text-center text-xs text-ink-400">← Kembali ke beranda</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Logged in but wrong mode (customer trying cleaner page or vice versa)
  if (requireMode && mode !== requireMode) {
    const wantCleaner = requireMode === 'freelancer';
    return (
      <View className="flex-1 bg-white">
        <LinearGradient colors={['#7C2D12', '#DC2626']} style={{ height: 180 }}>
          <SafeAreaView edges={['top']} />
        </LinearGradient>
        <View className="flex-1 items-center px-6 -mt-16">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-white shadow-md" style={{ elevation: 6 }}>
            <ShieldAlert color="#DC2626" size={36} strokeWidth={2.2} />
          </View>
          <Text className="font-extrabold mt-5 text-center text-xl text-ink-900">Akses Ditolak</Text>
          <Text className="font-sans mt-2 text-center text-sm text-ink-600">
            {wantCleaner
              ? 'Halaman ini khusus mitra cleaner. Akun customer tidak dapat mengaksesnya.'
              : 'Halaman ini khusus customer. Akun cleaner tidak dapat mengaksesnya.'}
          </Text>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            className="mt-6 w-full rounded-2xl bg-brand-600 py-4"
          >
            <Text className="font-bold text-center text-sm text-white">Kembali ke Beranda</Text>
          </Pressable>
          {wantCleaner && (
            <Pressable onPress={() => router.replace('/(auth)/cleaner-onboarding')} className="mt-3">
              <Text className="font-sans text-center text-sm text-ink-500">
                Mau jadi mitra cleaner? <Text className="font-semibold text-brand-600">Daftar di sini</Text>
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

/** HOC: wrap a screen so it requires login (and optionally a specific role). */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  requireMode?: UserMode,
) {
  return function Guarded(props: P) {
    return (
      <AuthGate requireMode={requireMode}>
        <Component {...props} />
      </AuthGate>
    );
  };
}

import { useRouter } from 'expo-router';
import { LogIn, ShieldAlert } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

  // Belum login → tampilkan layar login-prompt (bukan Redirect kosong yg bikin flash hitam)
  if (!tokens) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        <LinearGradient
          colors={['#1E3A8A', '#047857', '#0E7490']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ height: 200, width: '100%', alignSelf: 'stretch' }}
        >
          <SafeAreaView edges={['top']} />
        </LinearGradient>
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 24, marginTop: -48 }}>
          <View style={{ height: 96, width: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 48, backgroundColor: 'white', elevation: 6, shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <LogIn color="#1D4ED8" size={36} strokeWidth={2} />
          </View>
          <Text style={{ fontWeight: '800', fontSize: 20, color: '#0F172A', marginTop: 20, textAlign: 'center' }}>
            {title ?? 'Login Dulu, Yuk!'}
          </Text>
          <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
            {message ?? 'Masuk ke akunmu untuk mengakses fitur ini.'}
          </Text>
          <Pressable
            onPress={() => router.push('/(auth)/login')}
            style={{ marginTop: 28, width: '100%', borderRadius: 16, backgroundColor: '#1D4ED8', paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ fontWeight: '700', fontSize: 15, color: 'white' }}>Masuk / Daftar</Text>
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
        <LinearGradient colors={['#7C2D12', '#DC2626']} style={{ height: 180, width: '100%', alignSelf: 'stretch' }}>
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

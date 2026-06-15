import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail, Phone, ShieldCheck, Star, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '../../src/components/BrandLogo';
import { validatePassword } from '../../src/components/Field';
import { login } from '../../src/lib/devAuth';
import { useT } from '../../src/lib/i18n';
import { useAuthStore } from '../../src/stores/auth';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';
import { useUserStore } from '../../src/stores/user';
import { safeBack } from '../../src/lib/safeBack';

export default function Login() {
  const router = useRouter();
  const t = useT();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setMode = useModeStore((s) => s.setMode);
  const setCleanerName = useCleanerStore((s) => s.setName);
  const fetchUser = useUserStore((s) => s.fetch);

  const [loginAs, setLoginAs] = useState<'customer' | 'freelancer'>('customer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string | null; password?: string | null }>({});
  const [touched, setTouched] = useState<{ identifier?: boolean; password?: boolean }>({});

  // Accept email OR Indonesian phone (08.../+62.../62...)
  function validateIdentifier(v: string): string | null {
    const x = v.trim();
    if (!x) return 'Email atau No. HP wajib diisi';
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
    const isPhone = /^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(x.replace(/\s/g, ''));
    if (!isEmail && !isPhone) return 'Format harus email atau nomor HP Indonesia (08...)';
    return null;
  }

  // Detect input mode for adaptive icon
  const idTrim = identifier.trim();
  const looksLikePhone = /^[\d+]/.test(idTrim);
  const IdIcon = looksLikePhone ? Phone : Mail;

  function validate(): boolean {
    const e = { identifier: validateIdentifier(identifier), password: validatePassword(password, 6) };
    setErrors(e);
    setTouched({ identifier: true, password: true });
    return !e.identifier && !e.password;
  }

  async function onLogin() {
    if (!validate()) {
      toast.error('Periksa input yang masih kosong/salah');
      return;
    }
    setLoading(true);
    try {
      const result = await login(identifier, password);
      if (result.user.mode !== loginAs) {
        const want = loginAs === 'customer' ? 'Customer' : 'Cleaner';
        const actual = result.user.mode === 'customer' ? 'Customer' : 'Cleaner';
        toast.error(`Akun ini terdaftar sebagai ${actual}, bukan ${want}. Pilih tab yang sesuai.`);
        setLoading(false);
        return;
      }
      setTokens(result.tokens);
      setMode(result.user.mode);
      void fetchUser();
      if (result.user.mode === 'freelancer') setCleanerName(result.user.name);
      if (result.user.mode === 'customer') {
        toast.success(`Selamat datang, ${result.user.name}`);
      }
      router.replace(result.user.mode === 'freelancer' ? '/cleaner/kyc' : '/(tabs)');
    } catch (e) {
      const raw = (e as Error).message ?? 'Login gagal';
      let userMsg = raw;
      const lc = raw.toLowerCase();
      if (lc.includes('invalid') || lc.includes('wrong') || lc.includes('salah') || lc.includes('credential') || lc.includes('401') || lc.includes('not found')) {
        userMsg = 'Email/Nomor HP atau password kamu salah. Coba cek lagi ya.';
      } else if (lc.includes('network') || lc.includes('fetch') || lc.includes('timeout') || lc.includes('abort')) {
        userMsg = 'Koneksi internet bermasalah. Pastikan sinyal/Wi-Fi stabil & coba lagi.';
      } else if (lc.includes('too many') || lc.includes('rate') || lc.includes('429')) {
        userMsg = 'Terlalu banyak percobaan. Tunggu 1 menit sebelum coba lagi.';
      } else if (lc.includes('suspend') || lc.includes('blocked') || lc.includes('disabled')) {
        userMsg = 'Akun kamu di-suspend. Hubungi customer service.';
      }
      setErrors({ identifier: ' ', password: ' ' });
      toast.error(userMsg);
    } finally {
      setLoading(false);
    }
  }

  const idError = touched.identifier ? errors.identifier : null;
  const pwError = touched.password ? errors.password : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: 'white' }}
    >
      {/* Hero compact - shorter biar form lebih dominan di viewport */}
      <LinearGradient
        colors={['#1E3A8A', '#047857', '#0E7490']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 36 }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.10)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 60, left: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.06)' }} />

        <SafeAreaView edges={['top']}>
          <View className="flex-row items-center px-4 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
              <ArrowLeft color="white" size={20} />
            </Pressable>
          </View>
          <View className="px-6 pt-4 pb-2">
            <BrandLogo size={48} showName />
            <Text className="font-extrabold mt-6 text-[28px] leading-8 text-white" style={{ letterSpacing: -0.5 }}>
              Selamat datang
            </Text>
            <Text className="font-medium mt-1.5 text-[13px] leading-[18px] text-white/85">
              Masuk untuk lanjut pesan jasa bersih
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        style={{ marginTop: -20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Form card */}
        <View
          className="mx-4 rounded-3xl bg-white p-5"
          style={{ elevation: 8, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }}
        >
          {/* Role segmented toggle */}
          <View className="rounded-2xl bg-ink-100 p-1 flex-row">
            {([
              { key: 'customer', label: 'Customer', emoji: '🏠' },
              { key: 'freelancer', label: 'Cleaner', emoji: '🧹' },
            ] as const).map((r) => {
              const active = loginAs === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setLoginAs(r.key)}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${active ? 'bg-white' : ''}`}
                  style={active ? { elevation: 2, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 4 } : undefined}
                >
                  <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                  <Text className={`font-bold text-[13px] ${active ? 'text-ink-900' : 'text-ink-500'}`}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Form fields */}
          <View className="mt-5 gap-3.5">
            {/* Identifier */}
            <View>
              <Text className="font-semibold mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">Email atau No. HP</Text>
              <View
                className={`flex-row items-center gap-2.5 rounded-xl border px-3.5 py-3.5 ${
                  idError ? 'border-red-400 bg-red-50' : 'border-ink-200 bg-ink-50'
                }`}
              >
                <IdIcon color={idError ? '#DC2626' : '#94A3B8'} size={18} />
                <TextInput
                  value={identifier}
                  onChangeText={(v) => {
                    setIdentifier(v);
                    if (touched.identifier) setErrors({ ...errors, identifier: validateIdentifier(v) });
                  }}
                  onBlur={() => {
                    setTouched({ ...touched, identifier: true });
                    setErrors({ ...errors, identifier: validateIdentifier(identifier) });
                  }}
                  placeholder="kamu@email.com atau 08123456789"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="font-sans flex-1 text-sm text-ink-900"
                />
              </View>
              {idError && idError.trim() && (
                <Text className="font-medium mt-1 text-[11px] text-red-600">{idError}</Text>
              )}
            </View>

            {/* Password */}
            <View>
              <View className="mb-1.5 flex-row items-center justify-between">
                <Text className="font-semibold text-[11px] uppercase tracking-wider text-ink-500">Password</Text>
                <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                  <Text className="font-bold text-[11px] text-brand-600">Lupa?</Text>
                </Pressable>
              </View>
              <View
                className={`flex-row items-center gap-2.5 rounded-xl border px-3.5 py-3.5 ${
                  pwError ? 'border-red-400 bg-red-50' : 'border-ink-200 bg-ink-50'
                }`}
              >
                <TextInput
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (touched.password) setErrors({ ...errors, password: validatePassword(v, 6) });
                  }}
                  onBlur={() => {
                    setTouched({ ...touched, password: true });
                    setErrors({ ...errors, password: validatePassword(password, 6) });
                  }}
                  placeholder="Masukin password kamu"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPwd}
                  autoCapitalize="none"
                  className="font-sans flex-1 text-sm text-ink-900"
                />
                <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                  {showPwd ? <EyeOff color="#94A3B8" size={18} /> : <Eye color="#94A3B8" size={18} />}
                </Pressable>
              </View>
              {pwError && pwError.trim() && (
                <Text className="font-medium mt-1 text-[11px] text-red-600">{pwError}</Text>
              )}
            </View>
          </View>

          {/* Primary CTA */}
          <Pressable
            onPress={onLogin}
            disabled={loading}
            className={`mt-6 flex-row items-center justify-center gap-2 rounded-2xl py-4 ${loading ? 'bg-brand-400' : 'bg-brand-600'}`}
            style={{ elevation: 4, shadowColor: '#1D4ED8', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Text className="font-bold text-sm text-white">Masuk</Text>
                <ArrowRight color="white" size={16} strokeWidth={2.4} />
              </>
            )}
          </Pressable>

          {/* Divider */}
          <View className="mt-6 mb-4 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-ink-200" />
            <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-400">Belum punya akun?</Text>
            <View className="h-px flex-1 bg-ink-200" />
          </View>

          {/* Secondary CTA - register */}
          <Pressable
            onPress={() => loginAs === 'freelancer'
              ? router.replace('/(auth)/cleaner-onboarding')
              : router.replace({ pathname: '/(auth)/register', params: { mode: 'customer' } })}
            className="flex-row items-center justify-center gap-1.5 rounded-2xl border border-brand-200 bg-brand-50 py-3.5"
          >
            <Text className="font-bold text-sm text-brand-700">
              {loginAs === 'freelancer' ? 'Daftar Jadi Mitra Cleaner' : 'Daftar Akun Baru'}
            </Text>
          </Pressable>
        </View>

        {/* Trust badges - small social proof footer */}
        <View className="mx-4 mt-5 flex-row gap-2">
          <TrustBadge icon={ShieldCheck} label="Cleaner ter-verifikasi" />
          <TrustBadge icon={Star} label="Rating 4.8+ dari ribuan order" />
          <TrustBadge icon={Users} label="Komunitas 10K+ mitra" />
        </View>

        <Text className="mt-5 text-center text-[10px] text-ink-400">
          Dengan masuk, kamu setuju dengan{' '}
          <Text className="font-bold text-brand-600">Syarat & Ketentuan</Text>
          {' '}dan{' '}
          <Text className="font-bold text-brand-600">Kebijakan Privasi</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TrustBadge({ icon: Icon, label }: { icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>; label: string }) {
  return (
    <View className="flex-1 items-center gap-1.5 rounded-xl bg-white p-2.5">
      <Icon color="#1D4ED8" size={16} strokeWidth={2.2} />
      <Text className="font-medium text-center text-[9px] leading-3 text-ink-600">{label}</Text>
    </View>
  );
}

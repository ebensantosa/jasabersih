import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '../../src/components/BrandLogo';
import { Field, validateEmail, validatePassword } from '../../src/components/Field';
import { useT } from '../../src/lib/i18n';
import { login } from '../../src/lib/devAuth';
import { useAuthStore } from '../../src/stores/auth';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useCleanerKycStore } from '../../src/stores/cleanerKyc';
import { useModeStore } from '../../src/stores/mode';
import { useUserStore } from '../../src/stores/user';
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

export default function Login() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
  const t = useT();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setMode = useModeStore((s) => s.setMode);
  const setCleanerName = useCleanerStore((s) => s.setName);
  const setCleanerKycStatus = useCleanerKycStore((s) => s.setStatus);
  const fetchUser = useUserStore((s) => s.fetch);

  const [loginAs, setLoginAs] = useState<'customer' | 'freelancer'>('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});

  function getSafeNextPath(raw?: string | string[]): string | null {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || typeof value !== 'string') return null;
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    if (value === '/booking') return null;
    return value;
  }

  // Accept email OR Indonesian phone (08.../+62.../62...)
  function validateIdentifier(v: string): string | null {
    const x = v.trim();
    if (!x) return 'Email atau No. HP wajib diisi';
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
    const isPhone = /^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(x.replace(/\s/g, ''));
    if (!isEmail && !isPhone) return 'Format harus email atau nomor HP Indonesia (08...)';
    return null;
  }

  function validate(): boolean {
    const e = { email: validateIdentifier(email), password: validatePassword(password, 6) };
    setErrors(e);
    setTouched({ email: true, password: true });
    return !e.email && !e.password;
  }

  async function onLogin() {
    if (!validate()) {
      toast.error('Periksa input yang masih kosong/salah');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email, password);
      // Validate role matches selected toggle
      if (result.user.mode !== loginAs) {
        const want = loginAs === 'customer' ? 'Customer' : 'Cleaner';
        const actual = result.user.mode === 'customer' ? 'Customer' : 'Cleaner';
        toast.error(`Akun ini terdaftar sebagai ${actual}, bukan ${want}. Pilih tab yang sesuai.`);
        setLoading(false);
        return;
      }
      setTokens(result.tokens);
      setMode(result.user.mode);
      // Fetch full profile from /auth/me - populates name/phone/email/photo for Profile tab
      void fetchUser();
      if (result.user.mode === 'freelancer') {
        setCleanerName(result.user.name);
        setCleanerKycStatus(result.user.kycStatus ?? null);
      }
      // Toast 'Selamat datang' hanya untuk customer.
      // Cleaner: skip - KYC gate akan show context yang lebih relevant
      if (result.user.mode === 'customer') {
        toast.success(`Selamat datang, ${result.user.name}`);
      }
      // Cleaner: jangan ke (tabs) dulu - CleanerLockOverlay handle routing
      // berdasarkan KYC status (approved → tabs/jobs, else → cleaner/kyc)
      const safeNext = getSafeNextPath(next);
      if (result.user.mode === 'freelancer') {
        router.replace(result.user.kycStatus === 'approved' ? '/(tabs)/jobs' : '/cleaner/kyc');
      } else {
        router.replace(safeNext ?? '/(tabs)');
      }
    } catch (e) {
      const raw = (e as Error).message ?? 'Login gagal';
      // Map pesan teknis backend ke pesan ramah user.
      let userMsg = raw;
      const lc = raw.toLowerCase();
      if (lc.includes('invalid') || lc.includes('wrong') || lc.includes('salah') || lc.includes('credential') || lc.includes('401') || lc.includes('not found')) {
        userMsg = 'Email/Nomor HP atau password kamu salah. Coba cek lagi ya.';
      } else if (lc.includes('percobaan login') || lc.includes('login_temp_locked')) {
        userMsg = raw;
      } else if (lc.includes('network') || lc.includes('fetch') || lc.includes('timeout') || lc.includes('abort')) {
        userMsg = 'Koneksi internet bermasalah. Pastikan sinyal/Wi-Fi stabil & coba lagi.';
      } else if (lc.includes('too many') || lc.includes('rate') || lc.includes('429')) {
        userMsg = 'Terlalu banyak percobaan. Tunggu 1 menit sebelum coba lagi.';
      } else if (lc.includes('suspend') || lc.includes('blocked') || lc.includes('disabled')) {
        userMsg = 'Akun kamu di-suspend. Hubungi customer service.';
      }
      // Cuma red border di dua field - pesan asli di toast. Hindari duplikasi text.
      setErrors({ email: ' ', password: ' ' });
      toast.error(userMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View className="flex-1 bg-ink-50" style={{ overflow: 'hidden' }}>
      {/* Hero gradient blue->emerald->teal (samain dgn home, earnings, profile, wallet).
          width '100%' + alignSelf 'stretch' supaya gak shrink ke children -
          tanpa ini di RN-Web, gradient cuma se-lebar content terdalam. */}
      <LinearGradient
        colors={['#1E3A8A', '#047857', '#0E7490']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 32, width: '100%', alignSelf: 'stretch', overflow: 'hidden' }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.10)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 70, left: -40, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.07)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 20, right: 60, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <SafeAreaView edges={['top']}>
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <ArrowLeft color="white" size={20} />
            </Pressable>
          </View>
          <View className="px-6 pt-6 pb-6">
            <BrandLogo size={56} showName />
            <Text
              className="font-extrabold mt-10 text-white"
              style={{ fontSize: 32, letterSpacing: -0.8, lineHeight: 38 }}
            >
              {t('login.welcome_emoji')}
            </Text>
            <Text className="font-medium mt-2 text-[14px] leading-5 text-white/85">{t('login.subtitle')}</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        style={{ marginTop: -20 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="mx-4 rounded-3xl bg-white p-5"
          style={{ elevation: 8, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }}
        >
          {/* Role toggle - clean pill segmented */}
          <View className="mb-4 flex-row rounded-xl bg-ink-100 p-1">
            {([
              { key: 'customer', label: 'Customer' },
              { key: 'freelancer', label: 'Cleaner' },
            ] as const).map((r) => {
              const active = loginAs === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setLoginAs(r.key)}
                  className={`flex-1 items-center justify-center rounded-lg py-2.5 ${active ? 'bg-white' : ''}`}
                  style={active ? { elevation: 2, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 4 } : undefined}
                >
                  <Text className={`font-bold text-sm ${active ? 'text-brand-700' : 'text-ink-500'}`}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Form fields */}
          <View className="gap-4">
            <Field label="Email atau No. HP" required error={touched.email ? errors.email : null}>
              <Mail color="#94A3B8" size={18} />
              <TextInput
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (touched.email) setErrors({ ...errors, email: validateIdentifier(v) });
                }}
                onBlur={() => {
                  setTouched({ ...touched, email: true });
                  setErrors({ ...errors, email: validateIdentifier(email) });
                }}
                placeholder="kamu@email.com atau 08123456789"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="font-sans flex-1 text-sm text-ink-900"
              />
            </Field>

            <Field label="Password" required error={touched.password ? errors.password : null}>
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
                placeholder="••••••••"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPwd}
                className="font-sans flex-1 text-sm text-ink-900"
              />
              <Pressable onPress={() => setShowPwd((v) => !v)}>
                {showPwd ? <EyeOff color="#94A3B8" size={18} /> : <Eye color="#94A3B8" size={18} />}
              </Pressable>
            </Field>

            <Pressable className="self-end" onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
              <Text className="font-bold text-xs text-brand-600">Lupa password?</Text>
            </Pressable>
          </View>

          {/* Primary CTA */}
          <Pressable
            onPress={onLogin}
            disabled={loading}
            className={`mt-5 items-center rounded-2xl py-4 ${loading ? 'bg-brand-400' : 'bg-brand-600'}`}
            style={{ elevation: 3, shadowColor: '#1D4ED8', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
          >
            <Text className="font-bold text-sm text-white">
              {loading ? t('login.signing_in') : t('auth.login')}
            </Text>
          </Pressable>

          {/* Footer link */}
          <Pressable
            onPress={() => loginAs === 'freelancer'
              ? router.replace('/(auth)/cleaner-onboarding')
              : router.replace({ pathname: '/(auth)/register', params: { mode: 'customer' } })}
            className="mt-5"
            hitSlop={8}
          >
            <Text className="text-center text-[13px] text-ink-500">
              {loginAs === 'freelancer' ? 'Belum jadi mitra? ' : t('login.no_account') + ' '}
              <Text className="font-bold text-brand-600">
                {loginAs === 'freelancer' ? 'Daftar Jadi Mitra' : t('login.signup_link')}
              </Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '../../src/components/BrandLogo';
import { validatePassword } from '../../src/components/Field';
import { login } from '../../src/lib/devAuth';
import { useAuthStore } from '../../src/stores/auth';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';
import { useUserStore } from '../../src/stores/user';
import { safeBack } from '../../src/lib/safeBack';

export default function Login() {
  const router = useRouter();
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

  function validateIdentifier(v: string): string | null {
    const x = v.trim();
    if (!x) return 'Email atau No. HP wajib diisi';
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
    const isPhone = /^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(x.replace(/\s/g, ''));
    if (!isEmail && !isPhone) return 'Format harus email atau nomor HP Indonesia (08...)';
    return null;
  }

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
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
    >
      {/* Slim gradient strip - aksen halus di atas, bukan hero block besar */}
      <LinearGradient
        colors={['#1E3A8A', '#047857', '#0E7490']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: 4 }}
      />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View className="flex-row items-center px-2 py-2">
          <Pressable
            onPress={() => safeBack()}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header brand */}
        <View className="mt-4 mb-8">
          <BrandLogo size={44} showName />
          <Text
            className="font-extrabold mt-7 text-ink-900"
            style={{ fontSize: 26, lineHeight: 32, letterSpacing: -0.6 }}
          >
            Masuk ke akunmu
          </Text>
          <Text className="font-medium mt-2 text-sm text-ink-500" style={{ lineHeight: 20 }}>
            Lanjut pesan layanan bersih atau terima job sebagai mitra.
          </Text>
        </View>

        {/* Role segmented toggle - minimal underline style */}
        <View className="mb-7 flex-row border-b border-ink-200">
          {([
            { key: 'customer', label: 'Customer' },
            { key: 'freelancer', label: 'Cleaner' },
          ] as const).map((r) => {
            const active = loginAs === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setLoginAs(r.key)}
                className="flex-1 items-center pb-3"
              >
                <Text className={`font-bold text-sm ${active ? 'text-ink-900' : 'text-ink-400'}`}>
                  {r.label}
                </Text>
                {active && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      left: 0,
                      right: 0,
                      height: 2,
                      backgroundColor: '#1D4ED8',
                      borderRadius: 1,
                    }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Form fields */}
        <View className="gap-5">
          {/* Identifier */}
          <View>
            <Text className="font-semibold mb-2 text-[12px] text-ink-700">Email atau No. HP</Text>
            <View
              className={`flex-row items-center gap-2.5 rounded-xl border bg-white ${
                idError && idError.trim() ? 'border-red-400' : 'border-ink-200'
              }`}
              style={{ paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10 }}
            >
              <IdIcon color="#94A3B8" size={18} strokeWidth={2} />
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
                className="font-sans flex-1 text-[14px] text-ink-900"
              />
            </View>
            {idError && idError.trim() && (
              <Text className="font-medium mt-1.5 text-[11px] text-red-600">{idError}</Text>
            )}
          </View>

          {/* Password */}
          <View>
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-semibold text-[12px] text-ink-700">Password</Text>
              <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                <Text className="font-bold text-[12px] text-brand-600">Lupa password?</Text>
              </Pressable>
            </View>
            <View
              className={`flex-row items-center gap-2.5 rounded-xl border bg-white ${
                pwError && pwError.trim() ? 'border-red-400' : 'border-ink-200'
              }`}
              style={{ paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10 }}
            >
              <Lock color="#94A3B8" size={18} strokeWidth={2} />
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
                className="font-sans flex-1 text-[14px] text-ink-900"
              />
              <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                {showPwd ? <EyeOff color="#94A3B8" size={18} strokeWidth={2} /> : <Eye color="#94A3B8" size={18} strokeWidth={2} />}
              </Pressable>
            </View>
            {pwError && pwError.trim() && (
              <Text className="font-medium mt-1.5 text-[11px] text-red-600">{pwError}</Text>
            )}
          </View>
        </View>

        {/* Primary CTA */}
        <Pressable
          onPress={onLogin}
          disabled={loading}
          className={`mt-8 items-center rounded-xl py-4 ${loading ? 'bg-brand-400' : 'bg-brand-600'}`}
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="font-bold text-[15px] text-white">Masuk</Text>
          )}
        </Pressable>

        {/* Footer link */}
        <Pressable
          onPress={() => loginAs === 'freelancer'
            ? router.replace('/(auth)/cleaner-onboarding')
            : router.replace({ pathname: '/(auth)/register', params: { mode: 'customer' } })}
          className="mt-6"
        >
          <Text className="text-center text-[13px] text-ink-500">
            Belum punya akun?{' '}
            <Text className="font-bold text-brand-600">
              {loginAs === 'freelancer' ? 'Daftar Jadi Mitra' : 'Daftar di sini'}
            </Text>
          </Text>
        </Pressable>

        {/* T&C kecil di paling bawah */}
        <Text className="mt-10 text-center text-[10px] leading-4 text-ink-400">
          Dengan masuk, kamu setuju dengan{' '}
          <Text className="font-semibold text-ink-600">Syarat & Ketentuan</Text>
          {' '}dan{' '}
          <Text className="font-semibold text-ink-600">Kebijakan Privasi</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Mail, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '../../src/components/BrandLogo';
import { Field, validateEmail, validatePassword } from '../../src/components/Field';
import { useT } from '../../src/lib/i18n';
import { login } from '../../src/lib/devAuth';
import { useAuthStore } from '../../src/stores/auth';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useModeStore } from '../../src/stores/mode';
import { useUserStore } from '../../src/stores/user';
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

export default function Login() {
  const router = useRouter();
  const t = useT();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setMode = useModeStore((s) => s.setMode);
  const setCleanerName = useCleanerStore((s) => s.setName);
  const fetchUser = useUserStore((s) => s.fetch);

  const [loginAs, setLoginAs] = useState<'customer' | 'freelancer'>('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});

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
      // Fetch full profile from /auth/me — populates name/phone/email/photo for Profile tab
      void fetchUser();
      if (result.user.mode === 'freelancer') setCleanerName(result.user.name);
      // Toast 'Selamat datang' hanya untuk customer.
      // Cleaner: skip — KYC gate akan show context yang lebih relevant
      if (result.user.mode === 'customer') {
        toast.success(`Selamat datang, ${result.user.name}`);
      }
      // Cleaner: jangan ke (tabs) dulu — CleanerLockOverlay handle routing
      // berdasarkan KYC status (approved → tabs/jobs, else → cleaner/kyc)
      router.replace(result.user.mode === 'freelancer' ? '/cleaner/kyc' : '/(tabs)');
    } catch (e) {
      const msg = (e as Error).message;
      setErrors({ email: ' ', password: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-white">
      <LinearGradient colors={['#0B2A6F', '#1D4ED8']} style={{ height: 260 }}>
        <SafeAreaView edges={['top']}>
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
          </View>
          <View className="px-6 pt-2 pb-6">
            <BrandLogo size={56} showName />
            <Text className="font-bold mt-4 text-3xl text-white">{t('login.welcome_emoji')}</Text>
            <Text className="font-sans mt-1 text-sm text-white/85">{t('login.subtitle')}</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView className="flex-1 -mt-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mx-4 rounded-2xl bg-white p-5 shadow-sm" style={{ elevation: 6 }}>
          <View className="mb-4 flex-row rounded-xl bg-ink-100 p-1">
            {([
              { key: 'customer', label: 'Customer', desc: 'Pesan layanan bersih' },
              { key: 'freelancer', label: 'Cleaner', desc: 'Mitra cleaner' },
            ] as const).map((r) => {
              const active = loginAs === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setLoginAs(r.key)}
                  className={`flex-1 items-center rounded-lg py-2 ${active ? 'bg-white shadow-sm' : ''}`}
                  style={active ? { elevation: 2 } : undefined}
                >
                  <Text className={`font-bold text-[13px] ${active ? 'text-brand-700' : 'text-ink-500'}`}>{r.label}</Text>
                  <Text className={`font-sans text-[10px] ${active ? 'text-ink-600' : 'text-ink-400'}`}>{r.desc}</Text>
                </Pressable>
              );
            })}
          </View>
          <View className="mb-3 rounded-lg bg-blue-50 p-2.5">
            <Text className="font-sans text-[11px] text-blue-900">
              {loginAs === 'customer'
                ? 'Login sebagai Customer untuk pesan layanan, lihat history, & kelola alamat.'
                : 'Login sebagai Cleaner untuk terima job, kelola jadwal, & dompet payout.'}
            </Text>
          </View>
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

            <Pressable className="self-end" onPress={() => router.push('/(auth)/forgot-password')}>
              <Text className="font-semibold text-xs text-brand-600">Lupa password?</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onLogin}
            disabled={loading}
            className="mt-2 rounded-2xl bg-brand-600 py-4 disabled:opacity-50"
          >
            <Text className="font-bold text-center text-sm text-white">
              {loading ? t('login.signing_in') : t('auth.login')}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/(auth)/register')} className="mt-3">
            <Text className="font-sans text-center text-sm text-ink-500">
              {t('login.no_account')}{' '}
              <Text className="font-semibold text-brand-600">{t('login.signup_link')}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

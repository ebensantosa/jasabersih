import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Mail, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, validateEmail, validatePassword } from '../../src/components/Field';
import { login } from '../../src/lib/devAuth';
import { useAuthStore } from '../../src/stores/auth';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';

export default function Login() {
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setMode = useModeStore((s) => s.setMode);
  const setCleanerName = useCleanerStore((s) => s.setName);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});

  function validate(): boolean {
    const e = { email: validateEmail(email), password: validatePassword(password, 6) };
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
      setTokens(result.tokens);
      setMode(result.user.mode);
      if (result.user.mode === 'freelancer') setCleanerName(result.user.name);
      toast.success(`Selamat datang, ${result.user.name}`);
      router.replace('/(tabs)');
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
      <LinearGradient colors={['#0B2A6F', '#1D4ED8']} style={{ height: 220 }}>
        <SafeAreaView edges={['top']}>
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
          </View>
          <View className="px-6 pt-2">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <Sparkles color="white" size={24} strokeWidth={2.2} />
            </View>
            <Text className="font-bold mt-3 text-3xl text-white">Selamat Datang 👋</Text>
            <Text className="font-sans mt-1 text-sm text-white/85">
              Masuk untuk lanjut pesan jasa bersih
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView className="flex-1 -mt-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mx-4 rounded-2xl bg-white p-5 shadow-sm" style={{ elevation: 6 }}>
          <View className="gap-4">
            <Field label="Email" required error={touched.email ? errors.email : null}>
              <Mail color="#94A3B8" size={18} />
              <TextInput
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (touched.email) setErrors({ ...errors, email: validateEmail(v) });
                }}
                onBlur={() => {
                  setTouched({ ...touched, email: true });
                  setErrors({ ...errors, email: validateEmail(email) });
                }}
                placeholder="kamu@email.com"
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

            <Pressable className="self-end" onPress={() => toast.comingSoon()}>
              <Text className="font-semibold text-xs text-brand-600">Lupa password?</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onLogin}
            disabled={loading}
            className="mt-2 rounded-2xl bg-brand-600 py-4 disabled:opacity-50"
          >
            <Text className="font-bold text-center text-sm text-white">
              {loading ? 'Memproses…' : 'Masuk'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/(auth)/register')} className="mt-3">
            <Text className="font-sans text-center text-sm text-ink-500">
              Belum punya akun?{' '}
              <Text className="font-semibold text-brand-600">Daftar Sekarang</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

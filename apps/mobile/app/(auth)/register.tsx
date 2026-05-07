import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Briefcase, Mail, User } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Field,
  validateEmail,
  validateMinLength,
  validatePassword,
} from '../../src/components/Field';
import { useAuthStore } from '../../src/stores/auth';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';

type Errors = { name?: string | null; email?: string | null; password?: string | null };
type Touched = { name?: boolean; email?: boolean; password?: boolean };

export default function Register() {
  const router = useRouter();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const targetMode: 'customer' | 'freelancer' = modeParam === 'freelancer' ? 'freelancer' : 'customer';

  const setTokens = useAuthStore((s) => s.setTokens);
  const setMode = useModeStore((s) => s.setMode);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Touched>({});

  function validate(): boolean {
    const e: Errors = {
      name: validateMinLength(name, 2, 'Nama'),
      email: validateEmail(email),
      password: validatePassword(password, 8),
    };
    setErrors(e);
    setTouched({ name: true, email: true, password: true });
    return !e.name && !e.email && !e.password;
  }

  function onSubmit() {
    if (!validate()) {
      toast.error('Lengkapi data yang masih kosong/salah');
      return;
    }
    setLoading(true);
    setTokens({
      accessToken: `dev.new.${email}.${Date.now()}`,
      refreshToken: `dev-refresh.${email}`,
      expiresIn: 60 * 60 * 24 * 7,
    });
    setMode(targetMode);
    toast.success(`Akun berhasil dibuat, halo ${name}!`);
    router.replace('/(tabs)');
    setLoading(false);
  }

  const isFreelancer = targetMode === 'freelancer';

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
              {isFreelancer ? (
                <Briefcase color="white" size={24} strokeWidth={2.2} />
              ) : (
                <User color="white" size={24} strokeWidth={2.2} />
              )}
            </View>
            <Text className="font-bold mt-3 text-3xl text-white">Daftar Akun</Text>
            <Text className="font-sans mt-1 text-sm text-white/85">
              {isFreelancer ? 'Mulai jadi Mitra Cleaner' : 'Buat akun untuk mulai pesan'}
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView className="flex-1 -mt-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mx-4 rounded-2xl bg-white p-5 shadow-sm" style={{ elevation: 6 }}>
          <View className="gap-4">
            <Field label="Nama Lengkap" required error={touched.name ? errors.name : null}>
              <User color="#94A3B8" size={18} />
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (touched.name) setErrors({ ...errors, name: validateMinLength(v, 2, 'Nama') });
                }}
                onBlur={() => {
                  setTouched({ ...touched, name: true });
                  setErrors({ ...errors, name: validateMinLength(name, 2, 'Nama') });
                }}
                placeholder="Nama lengkap kamu"
                placeholderTextColor="#94A3B8"
                className="font-sans flex-1 text-sm text-ink-900"
              />
            </Field>

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

            <Field
              label="Password"
              required
              hint="Minimal 8 karakter"
              error={touched.password ? errors.password : null}
            >
              <TextInput
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (touched.password) setErrors({ ...errors, password: validatePassword(v, 8) });
                }}
                onBlur={() => {
                  setTouched({ ...touched, password: true });
                  setErrors({ ...errors, password: validatePassword(password, 8) });
                }}
                placeholder="••••••••"
                placeholderTextColor="#94A3B8"
                secureTextEntry
                className="font-sans flex-1 text-sm text-ink-900"
              />
            </Field>
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={loading}
            className="mt-5 rounded-2xl bg-brand-600 py-4 disabled:opacity-50"
          >
            <Text className="font-bold text-center text-sm text-white">
              {loading ? 'Mendaftar…' : 'Daftar'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/(auth)/login')} className="mt-3">
            <Text className="font-sans text-center text-sm text-ink-500">
              Sudah punya akun? <Text className="font-semibold text-brand-600">Masuk</Text>
            </Text>
          </Pressable>
        </View>

        <Text className="font-sans mx-6 mt-4 text-center text-[11px] text-ink-400">
          Dengan daftar, kamu setuju dengan{' '}
          <Text className="font-semibold text-brand-600" onPress={() => toast.comingSoon()}>
            Syarat & Ketentuan
          </Text>{' '}
          dan{' '}
          <Text className="font-semibold text-brand-600" onPress={() => toast.comingSoon()}>
            Kebijakan Privasi
          </Text>
          .
        </Text>
      </ScrollView>
    </View>
  );
}

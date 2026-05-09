import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Briefcase, Eye, EyeOff, Mail, Phone, User } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Field,
  validateEmail,
  validateMinLength,
  validatePassword,
} from '../../src/components/Field';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';
import { useUserStore } from '../../src/stores/user';

type Errors = { name?: string | null; email?: string | null; phone?: string | null; password?: string | null };
type Touched = { name?: boolean; email?: boolean; phone?: boolean; password?: boolean };

function validatePhoneId(v: string): string | null {
  const x = v.trim().replace(/\s/g, '');
  if (!x) return 'Nomor HP wajib diisi';
  if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(x)) return 'Format harus 08123456789 atau +628123456789';
  return null;
}

export default function Register() {
  const router = useRouter();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const targetMode: 'customer' | 'freelancer' = modeParam === 'freelancer' ? 'freelancer' : 'customer';

  const setTokens = useAuthStore((s) => s.setTokens);
  const setMode = useModeStore((s) => s.setMode);
  const fetchUser = useUserStore((s) => s.fetch);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Touched>({});

  function validate(): boolean {
    const e: Errors = {
      name: validateMinLength(name, 2, 'Nama'),
      email: validateEmail(email),
      phone: validatePhoneId(phone),
      password: validatePassword(password, 8),
    };
    setErrors(e);
    setTouched({ name: true, email: true, phone: true, password: true });
    return !e.name && !e.email && !e.phone && !e.password;
  }

  async function onSubmit() {
    if (!validate()) {
      toast.error('Lengkapi data yang masih kosong/salah');
      return;
    }
    setLoading(true);
    try {
      // Request OTP — backend kirim 6-digit code ke email user via Resend
      const reg = await api.post('/auth/register', {
        phone: phone.trim(),
        mode: targetMode,
        email: email.trim().toLowerCase(),
      });
      const data = reg.data?.data ?? reg.data;
      const emailSent: boolean = !!data?.emailSent;
      const devOtp: string | undefined = data?.devOtp;

      if (emailSent || devOtp) {
        toast.success(`Kode verifikasi dikirim ke ${email.trim().toLowerCase()}`);
        router.replace({
          pathname: '/(auth)/verify',
          params: {
            phone: phone.trim(),
            name,
            email: email.trim().toLowerCase(),
            password,
            mode: targetMode,
            ...(devOtp ? { devOtp } : {}),
          },
        });
      } else {
        toast.error('Gagal kirim email verifikasi. Cek konfigurasi Resend di admin atau hubungi support.');
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message ?? e?.message ?? 'Daftar gagal, coba lagi';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
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

            <Field label="Nomor HP" required hint="Untuk OTP & login" error={touched.phone ? errors.phone : null}>
              <Phone color="#94A3B8" size={18} />
              <TextInput
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (touched.phone) setErrors({ ...errors, phone: validatePhoneId(v) });
                }}
                onBlur={() => {
                  setTouched({ ...touched, phone: true });
                  setErrors({ ...errors, phone: validatePhoneId(phone) });
                }}
                placeholder="08123456789"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
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
                secureTextEntry={!showPwd}
                className="font-sans flex-1 text-sm text-ink-900"
              />
              <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                {showPwd ? <EyeOff color="#94A3B8" size={18} /> : <Eye color="#94A3B8" size={18} />}
              </Pressable>
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

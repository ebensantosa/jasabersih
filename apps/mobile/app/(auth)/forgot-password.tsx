import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

export default function ForgotPassword() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    if (!identifier.trim()) { toast.error('Email atau No. HP wajib diisi'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { identifier: identifier.trim() });
      const data = res.data?.data ?? res.data;
      const dev = data?.devOtp;
      if (data?.emailSent || dev) {
        toast.success(`Kode reset dikirim ke email kamu${dev ? ` (dev: ${dev})` : ''}`);
        if (dev) setOtp(dev);
        setStep(2);
      } else {
        toast.error('Tidak bisa kirim kode. Pastikan email kamu terdaftar.');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim kode');
    } finally {
      setLoading(false);
    }
  }

  async function resetSubmit() {
    if (otp.length !== 6 || newPwd.length < 8) {
      toast.error('OTP 6 digit + password baru min 8 karakter');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { identifier: identifier.trim(), otp, newPassword: newPwd });
      toast.success('Password berhasil di-reset. Silakan login.');
      router.replace('/(auth)/login');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal reset');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <View className="flex-row items-center px-3 py-2">
          <Pressable onPress={() => (step === 2 ? setStep(1) : safeBack())} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">Lupa Password</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
          {step === 1 ? (
            <>
              <View className="items-center pt-2">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                  <Mail color="#1D4ED8" size={28} strokeWidth={2.2} />
                </View>
                <Text className="font-extrabold mt-4 text-center text-xl text-ink-900">Reset Password</Text>
                <Text className="font-sans mt-1 text-center text-[12px] leading-4 text-ink-500">
                  Masukkan email atau nomor HP. Kami kirim kode reset ke email akun kamu.
                </Text>
              </View>

              <View className="mt-6">
                <Text className="font-semibold mb-1 text-[11px] text-ink-700">Email atau No. HP</Text>
                <View className="flex-row items-center gap-2 rounded-xl border border-ink-200 bg-white px-3">
                  <Mail color="#94A3B8" size={16} />
                  <TextInput
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="kamu@email.com atau 08123456789"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="font-sans flex-1 py-3 text-sm text-ink-900"
                  />
                </View>
              </View>

              <Pressable
                onPress={requestOtp}
                disabled={loading}
                className={`mt-6 rounded-2xl py-4 ${loading ? 'bg-ink-200' : 'bg-brand-600'}`}
              >
                <Text className="font-bold text-center text-sm text-white">
                  {loading ? 'Mengirim…' : 'Kirim Kode Reset'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View className="items-center pt-2">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                  <Lock color="#10B981" size={28} strokeWidth={2.2} />
                </View>
                <Text className="font-extrabold mt-4 text-center text-xl text-ink-900">Buat Password Baru</Text>
                <Text className="font-sans mt-1 text-center text-[12px] leading-4 text-ink-500">
                  Cek email kamu untuk kode 6 digit, lalu set password baru.
                </Text>
              </View>

              <View className="mt-6 gap-3">
                <View>
                  <Text className="font-semibold mb-1 text-[11px] text-ink-700">Kode 6 Digit</Text>
                  <TextInput
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    placeholder="••••••"
                    placeholderTextColor="#94A3B8"
                    maxLength={6}
                    className="font-mono rounded-xl border border-ink-200 bg-white px-4 py-3 text-center text-lg tracking-widest text-ink-900"
                  />
                </View>
                <View>
                  <Text className="font-semibold mb-1 text-[11px] text-ink-700">Password Baru</Text>
                  <View className="flex-row items-center gap-2 rounded-xl border border-ink-200 bg-white px-3">
                    <Lock color="#94A3B8" size={16} />
                    <TextInput
                      value={newPwd}
                      onChangeText={setNewPwd}
                      secureTextEntry={!show}
                      placeholder="••••••••"
                      placeholderTextColor="#94A3B8"
                      className="font-sans flex-1 py-3 text-sm text-ink-900"
                    />
                    <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
                      {show ? <EyeOff color="#94A3B8" size={18} /> : <Eye color="#94A3B8" size={18} />}
                    </Pressable>
                  </View>
                  <Text className="font-sans mt-1 text-[10px] text-ink-500">Min 8 karakter</Text>
                </View>
              </View>

              <Pressable
                onPress={resetSubmit}
                disabled={loading || otp.length !== 6 || newPwd.length < 8}
                className={`mt-6 rounded-2xl py-4 ${loading || otp.length !== 6 || newPwd.length < 8 ? 'bg-ink-200' : 'bg-brand-600'}`}
              >
                <Text className="font-bold text-center text-sm text-white">
                  {loading ? 'Memproses…' : 'Reset Password'}
                </Text>
              </Pressable>

              <Pressable onPress={requestOtp} disabled={loading} className="mt-3 items-center">
                <Text className="font-medium text-[12px] text-ink-500">Tidak terima kode? <Text className="font-semibold text-brand-600">Kirim ulang</Text></Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

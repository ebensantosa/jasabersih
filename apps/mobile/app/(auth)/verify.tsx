import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';

export default function Verify() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        phone,
        otp,
        password,
        fullName: name,
        mode: 'customer',
        ...(referralCode.trim() ? { referralCode: referralCode.trim().toUpperCase() } : {}),
      });
      setTokens(res.data.data);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Verifikasi gagal', String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-row items-center px-4 py-2">
        <Pressable onPress={() => router.back()} className="p-2">
          <ArrowLeft color="#0F172A" size={22} />
        </Pressable>
      </View>
      <View className="flex-1 px-6 pt-4">
        <Text className="text-3xl font-bold text-slate-900">Verifikasi OTP</Text>
        <Text className="mt-1 text-sm text-slate-500">
          Kode 6 digit dikirim ke <Text className="font-semibold">{phone}</Text>
        </Text>

        <View className="mt-8 gap-4">
          <TextInput
            value={otp}
            onChangeText={setOtp}
            placeholder="6-digit OTP"
            keyboardType="number-pad"
            maxLength={6}
            className="rounded-xl border border-slate-300 px-4 py-3 text-center text-lg tracking-widest"
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nama lengkap"
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Buat password (min 8 karakter)"
            secureTextEntry
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <TextInput
            value={referralCode}
            onChangeText={(v) => setReferralCode(v.toUpperCase())}
            placeholder="Kode referral (opsional) — dapat bonus"
            autoCapitalize="characters"
            className="rounded-xl border border-slate-300 px-4 py-3 font-mono"
          />
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={loading || otp.length !== 6 || password.length < 8 || name.length < 2}
          className="mt-6 rounded-xl bg-emerald-500 py-4 disabled:opacity-50"
        >
          <Text className="text-center text-base font-semibold text-white">
            {loading ? 'Memproses…' : 'Selesai & Masuk'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

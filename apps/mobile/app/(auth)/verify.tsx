import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Mail, ShieldCheck, Tag } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;

export default function Verify() {
  const router = useRouter();
  const {
    phone,
    email: emailParam,
    name: nameParam,
    password: passwordParam,
    mode: modeParam,
    devOtp,
    referralCode: referralCodeParam,
    domicileCity: domicileCityParam,
  } = useLocalSearchParams<{
    phone: string;
    email?: string;
    name?: string;
    password?: string;
    mode?: string;
    devOtp?: string;
    referralCode?: string;
    domicileCity?: string;
  }>();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setMode = useModeStore((s) => s.setMode);
  const isFreelancer = modeParam === 'freelancer';

  const [otp, setOtp] = useState(devOtp ?? '');
  const [referralCode, setReferralCode] = useState(isFreelancer ? '' : (referralCodeParam ?? ''));
  const [showReferral, setShowReferral] = useState(!isFreelancer && !!referralCodeParam);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(devOtp ? 0 : RESEND_COOLDOWN_SEC);
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function onSubmit() {
    if (otp.length !== OTP_LENGTH) {
      toast.error(`Kode harus ${OTP_LENGTH} digit`);
      return;
    }
    setLoading(true);
    try {
      const normalizedReferralCode = !isFreelancer && referralCode.trim()
        ? referralCode.trim().toUpperCase()
        : '';
      const res = await api.post('/auth/verify-otp', {
        phone,
        otp,
        password: passwordParam ?? '',
        fullName: nameParam ?? '',
        mode: isFreelancer ? 'freelancer' : 'customer',
        ...(emailParam ? { email: emailParam } : {}),
        ...(normalizedReferralCode ? { referralCode: normalizedReferralCode } : {}),
      });
      setTokens(res.data?.data ?? res.data);
      // Sync mode store dgn role yg dipilih saat register, supaya post-verify
      // navigate ke tab yg benar (cleaner -> /jobs, customer -> /home).
      // Tanpa ini, cleaner stuck di home tab customer = keliatan blank.
      const targetMode = isFreelancer ? 'freelancer' : 'customer';
      setMode(targetMode);
      // Cleaner domisili dari register form - set ke cleaner_profile via /cleaner/profile.
      // Non-blocking: kalau gagal, KYC step bisa minta ulang.
      if (targetMode === 'freelancer' && domicileCityParam) {
        void api.patch('/cleaner/profile', {
          domicileCity: domicileCityParam,
          serviceAreas: [domicileCityParam],
        }).catch(() => {});
      }
      toast.success(`Selamat datang, ${nameParam ?? 'Pengguna'}!`);
      router.replace(targetMode === 'freelancer' ? '/(tabs)/jobs' : '/(tabs)');
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message ?? (e as Error).message ?? 'Verifikasi gagal';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      await api.post('/auth/register', {
        phone,
        mode: isFreelancer ? 'freelancer' : 'customer',
        ...(emailParam ? { email: emailParam } : {}),
      });
      toast.success(`Kode baru dikirim ke ${emailParam}`);
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim ulang');
    } finally {
      setResending(false);
    }
  }

  const otpDigits = otp.padEnd(OTP_LENGTH, ' ').split('').slice(0, OTP_LENGTH);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
          <ArrowLeft color="#0F172A" size={22} />
        </Pressable>
      </View>

      <View className="flex-1 px-6">
        {/* Hero icon */}
        <View className="items-center pt-4">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
            <Mail color="#10B981" size={36} strokeWidth={2.2} />
          </View>
          <Text className="font-extrabold mt-4 text-center text-2xl text-ink-900">Cek Email Kamu</Text>
          <Text className="font-sans mt-1 text-center text-sm text-ink-600">
            Kami kirim kode 6 digit ke{'\n'}
            <Text className="font-bold text-ink-900">{emailParam ?? '-'}</Text>
          </Text>
          <Text className="font-sans mt-2 text-center text-[11px] text-ink-500">
            Cek folder Spam atau Promotions kalau gak ada di inbox
          </Text>
        </View>

        {devOtp && (
          <View className="mt-4 rounded-lg bg-amber-50 px-3 py-2">
            <Text className="font-medium text-center text-[11px] text-amber-800">
              ⓘ Dev mode - kode otomatis: <Text className="font-mono font-bold">{devOtp}</Text>
            </Text>
          </View>
        )}

        {/* OTP visual boxes (tap any → focus hidden input) */}
        <Pressable className="mt-6" onPress={() => otpInputRef.current?.focus()}>
          <View className="flex-row justify-center gap-2">
            {otpDigits.map((d, i) => {
              const filled = d.trim().length > 0;
              const isCursor = i === otp.length;
              return (
                <View
                  key={i}
                  className={`h-12 w-10 items-center justify-center rounded-lg border-2 ${
                    filled ? 'border-brand-600 bg-brand-50' : isCursor ? 'border-brand-600 bg-white' : 'border-ink-200 bg-white'
                  }`}
                >
                  <Text className="font-bold text-lg text-ink-900">{d.trim()}</Text>
                </View>
              );
            })}
          </View>
          {/* Hidden actual input */}
          <TextInput
            ref={otpInputRef}
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, OTP_LENGTH))}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
          />
        </Pressable>

        {/* Resend */}
        <View className="mt-5 flex-row items-center justify-center gap-1">
          <Text className="font-sans text-[12px] text-ink-500">Belum dapat kode?</Text>
          <Pressable onPress={onResend} disabled={cooldown > 0 || resending}>
            <Text
              className={`font-bold text-[12px] ${
                cooldown > 0 || resending ? 'text-ink-400' : 'text-brand-600'
              }`}
            >
              {resending
                ? 'Mengirim…'
                : cooldown > 0
                  ? `Kirim ulang (${cooldown}s)`
                  : 'Kirim ulang'}
            </Text>
          </Pressable>
        </View>

        {/* Referral toggle */}
        {!isFreelancer && (
          <View className="mt-6">
            {!showReferral ? (
              <Pressable
                onPress={() => setShowReferral(true)}
                className="flex-row items-center justify-center gap-1.5"
              >
                <Tag color="#1D4ED8" size={14} />
                <Text className="font-semibold text-[12px] text-brand-600">Punya kode referral?</Text>
              </Pressable>
            ) : (
              <View className="rounded-xl border border-ink-200 bg-ink-50 p-3">
                <Text className="font-semibold mb-1.5 text-[11px] text-ink-700">Kode Referral (opsional)</Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={referralCode}
                    onChangeText={(v) => setReferralCode(v.toUpperCase())}
                    placeholder="JB12345"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                    maxLength={20}
                    className="font-mono flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900"
                  />
                  <Pressable onPress={() => { setShowReferral(false); setReferralCode(''); }}>
                    <Text className="font-medium text-[11px] text-ink-500">Batal</Text>
                  </Pressable>
                </View>
                <Text className="font-sans mt-1.5 text-[10px] text-ink-500">Dapat bonus saat orderan pertama selesai</Text>
              </View>
            )}
          </View>
        )}

        <Pressable
          onPress={onSubmit}
          disabled={loading || otp.length !== OTP_LENGTH}
          className={`mt-6 flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
            loading || otp.length !== OTP_LENGTH ? 'bg-ink-200' : 'bg-brand-600'
          }`}
        >
          <ShieldCheck color="white" size={18} strokeWidth={2.4} />
          <Text className="font-bold text-sm text-white">
            {loading ? 'Memverifikasi…' : 'Verifikasi & Masuk'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

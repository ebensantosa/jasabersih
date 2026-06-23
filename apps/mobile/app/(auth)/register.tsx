import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Briefcase, Eye, EyeOff, Mail, MapPin, Phone, Plus, User } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Field,
  validateEmail,
  validateMinLength,
  validatePassword,
} from '../../src/components/Field';
import { api } from '../../src/lib/api';
import { useAppContent } from '../../src/stores/appContent';
import { useAuthStore } from '../../src/stores/auth';
import { useModeStore } from '../../src/stores/mode';
import { toast } from '../../src/stores/ui';
import { useUserStore } from '../../src/stores/user';
import { safeBack } from '../../src/lib/safeBack';

type Errors = { name?: string | null; email?: string | null; phone?: string | null; password?: string | null; city?: string | null };
type Touched = { name?: boolean; email?: boolean; phone?: boolean; password?: boolean; city?: boolean };

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
  const [referralCode, setReferralCode] = useState('');
  const [domicileCity, setDomicileCity] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showRequestCity, setShowRequestCity] = useState(false);
  const [requestCityName, setRequestCityName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Touched>({});

  const serviceAreas = useAppContent((s) => s.content.serviceAreas);
  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const a of serviceAreas) if (a.city) set.add(a.city);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [serviceAreas]);

  function validateCity(v: string): string | null {
    if (!targetMode || targetMode !== 'freelancer') return null;
    if (!v.trim()) return 'Pilih kota domisili kamu';
    return null;
  }

  async function requestNewCity() {
    const name = requestCityName.trim();
    if (name.length < 2) { toast.error('Nama kota min 2 karakter'); return; }
    try {
      await api.post('/app/city-requests', {
        city: name,
        source: 'cleaner',
        notes: 'Diminta dari halaman register cleaner',
      });
      toast.success(`Permintaan kota "${name}" dikirim. Tunggu konfirmasi admin.`);
      setShowRequestCity(false);
      setRequestCityName('');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim request');
    }
  }

  function validate(): boolean {
    const e: Errors = {
      name: validateMinLength(name, 2, 'Nama'),
      email: validateEmail(email),
      phone: validatePhoneId(phone),
      password: validatePassword(password, 8),
      city: validateCity(domicileCity),
    };
    setErrors(e);
    setTouched({ name: true, email: true, phone: true, password: true, city: true });
    return !e.name && !e.email && !e.phone && !e.password && !e.city;
  }

  async function onSubmit() {
    if (!validate()) {
      toast.error('Lengkapi data yang masih kosong/salah');
      return;
    }
    setLoading(true);
    try {
      // Request OTP - backend kirim 6-digit code ke email user via Resend
      const normalizedReferralCode = !isFreelancer && referralCode.trim()
        ? referralCode.trim().toUpperCase()
        : '';
      const reg = await api.post('/auth/register', {
        phone: phone.trim(),
        mode: targetMode,
        email: email.trim().toLowerCase(),
        ...(normalizedReferralCode ? { referralCode: normalizedReferralCode } : {}),
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
            ...(domicileCity.trim() ? { domicileCity: domicileCity.trim() } : {}),
            ...(normalizedReferralCode ? { referralCode: normalizedReferralCode } : {}),
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
  // Tema visual beda antara Customer (biru) vs Cleaner (emerald/teal) - biar sekilas user tahu lagi daftar mana
  const theme = isFreelancer
    ? { gradient: ['#065F46', '#10B981'] as const, btn: 'bg-emerald-600', accent: 'text-emerald-700', linkAccent: 'text-emerald-700', bg: 'bg-emerald-50' }
    : { gradient: ['#0B2A6F', '#1D4ED8'] as const, btn: 'bg-brand-600', accent: 'text-brand-700', linkAccent: 'text-brand-600', bg: 'bg-white' };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
    <View className={`flex-1 ${theme.bg}`} style={{ overflow: 'hidden' }}>
      <LinearGradient colors={theme.gradient} style={{ height: 240, width: '100%', alignSelf: 'stretch', overflow: 'hidden' }}>
        <SafeAreaView edges={['top']}>
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
          </View>
          <View className="px-6 pt-2">
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                {isFreelancer ? (
                  <Briefcase color="white" size={22} strokeWidth={2.2} />
                ) : (
                  <User color="white" size={22} strokeWidth={2.2} />
                )}
              </View>
              <View className="rounded-full bg-white/20 px-3 py-1">
                <Text className="font-bold text-[10px] uppercase tracking-wider text-white">
                  {isFreelancer ? 'Mitra Cleaner' : 'Customer'}
                </Text>
              </View>
            </View>
            <Text className="font-extrabold mt-4 text-3xl leading-9 text-white">
              {isFreelancer ? 'Jadi Mitra Cleaner' : 'Daftar Customer'}
            </Text>
            <Text className="font-sans mt-1.5 text-sm leading-5 text-white/85">
              {isFreelancer ? 'Kerja fleksibel, payout harian, atur jadwal sendiri' : 'Buat akun untuk mulai pesan layanan'}
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView className="flex-1 -mt-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {isFreelancer && (
          <View className="mx-4 mb-3 rounded-2xl bg-white p-3" style={{ elevation: 2 }}>
            <Text className="font-bold text-[12px] text-emerald-900">Yang kamu dapat sebagai Mitra:</Text>
            <View className="mt-1.5 gap-1">
              <Text className="font-sans text-[11px] text-ink-700">✓ Payout harian via transfer bank</Text>
              <Text className="font-sans text-[11px] text-ink-700">✓ Atur jadwal sendiri & pilih area kerja</Text>
              <Text className="font-sans text-[11px] text-ink-700">✓ Order steady dari customer terverifikasi</Text>
            </View>
          </View>
        )}
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
                maxLength={50}
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
                maxLength={100}
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
                maxLength={15}
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
                maxLength={100}
                className="font-sans flex-1 text-sm text-ink-900"
              />
              <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                {showPwd ? <EyeOff color="#94A3B8" size={18} /> : <Eye color="#94A3B8" size={18} />}
              </Pressable>
            </Field>

            {isFreelancer && (
              <Field
                label="Kota Domisili Kerja"
                required
                hint="Pilih kota tempat kamu mau terima order"
                error={touched.city ? errors.city : null}
              >
                <Pressable
                  onPress={() => setShowCityPicker(true)}
                  className="flex-1 flex-row items-center"
                  hitSlop={8}
                >
                  <MapPin color="#94A3B8" size={18} />
                  <Text className={`font-sans ml-2 flex-1 text-sm ${domicileCity ? 'text-ink-900' : 'text-ink-400'}`}>
                    {domicileCity || 'Pilih kota…'}
                  </Text>
                </Pressable>
              </Field>
            )}

            {!isFreelancer && (
              <Field label="Kode Referral (opsional)" hint="Punya kode dari teman? Dapatkan bonus untuk order pertama.">
                <TextInput
                  value={referralCode}
                  onChangeText={(v) => setReferralCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                  placeholder="Contoh: 4P2F9Z3"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                  className="font-sans flex-1 text-sm text-ink-900"
                  style={{ letterSpacing: 1 }}
                />
              </Field>
            )}
          </View>

          {/* City picker modal */}
          <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
            <Pressable onPress={() => setShowCityPicker(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
              <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' }}>
                <View className="p-5 pb-2">
                  <Text className="font-extrabold text-lg text-ink-900">Pilih Kota Domisili</Text>
                  <Text className="font-medium mt-1 text-[11px] text-ink-500">
                    Kamu hanya akan terima order dari kota ini (bisa tambah area lain setelah KYC).
                  </Text>
                </View>
                <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                  {cities.length === 0 ? (
                    <View className="mx-5 mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <Text className="font-bold text-[12px] text-amber-900">Belum ada kota aktif</Text>
                      <Text className="font-medium mt-1 text-[11px] text-amber-800">
                        Klik "Kotaku belum ada" di bawah untuk request ke admin.
                      </Text>
                    </View>
                  ) : (
                    cities.map((c, i) => (
                      <Pressable
                        key={c}
                        onPress={() => { setDomicileCity(c); setErrors({ ...errors, city: null }); setShowCityPicker(false); }}
                        className={`flex-row items-center gap-3 px-5 py-3.5 ${i < cities.length - 1 ? 'border-b border-ink-100' : ''}`}
                      >
                        <MapPin color={domicileCity === c ? '#1D4ED8' : '#94A3B8'} size={18} />
                        <Text className={`font-semibold flex-1 text-sm ${domicileCity === c ? 'text-brand-700' : 'text-ink-900'}`}>{c}</Text>
                      </Pressable>
                    ))
                  )}
                  <Pressable
                    onPress={() => { setShowCityPicker(false); setShowRequestCity(true); }}
                    className="mx-5 mt-3 flex-row items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 py-3"
                  >
                    <Plus color="#1D4ED8" size={16} />
                    <Text className="font-bold text-[12px] text-brand-700">Kotaku belum ada — Request ke admin</Text>
                  </Pressable>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Request new city modal */}
          <Modal visible={showRequestCity} transparent animationType="fade" onRequestClose={() => setShowRequestCity(false)}>
            <Pressable onPress={() => setShowRequestCity(false)} className="flex-1 items-center justify-center bg-black/50 px-6">
              <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5">
                <Text className="font-extrabold text-lg text-ink-900">Request Kota Baru</Text>
                <Text className="font-medium mt-1 text-[12px] text-ink-600">
                  Tulis nama kota kamu, admin akan review. Setelah diapprove kamu bisa langsung pilih kota ini di profile.
                </Text>
                <Field label="Nama Kota" required>
                  <MapPin color="#94A3B8" size={18} />
                  <TextInput
                    value={requestCityName}
                    onChangeText={setRequestCityName}
                    placeholder="Contoh: Surabaya"
                    placeholderTextColor="#94A3B8"
                    className="font-sans flex-1 text-sm text-ink-900"
                  />
                </Field>
                <View className="mt-4 flex-row gap-2">
                  <Pressable onPress={() => setShowRequestCity(false)} className="flex-1 rounded-xl border border-ink-200 bg-white py-3">
                    <Text className="font-bold text-center text-sm text-ink-700">Batal</Text>
                  </Pressable>
                  <Pressable onPress={requestNewCity} className="flex-1 rounded-xl bg-emerald-600 py-3">
                    <Text className="font-bold text-center text-sm text-white">Kirim Request</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          <Pressable
            onPress={onSubmit}
            disabled={loading}
            className={`mt-5 rounded-2xl ${theme.btn} py-4 disabled:opacity-50`}
          >
            <Text className="font-bold text-center text-sm text-white">
              {loading ? 'Mendaftar…' : isFreelancer ? 'Daftar Sebagai Cleaner' : 'Daftar Customer'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/(auth)/login')} className="mt-3">
            <Text className="font-sans text-center text-sm text-ink-500">
              Sudah punya akun? <Text className={`font-semibold ${theme.linkAccent}`}>Masuk</Text>
            </Text>
          </Pressable>

        </View>

        <Text className="font-sans mx-6 mt-4 text-center text-[11px] text-ink-400">
          Dengan daftar, kamu setuju dengan{' '}
          <Text className={`font-semibold ${theme.linkAccent}`} onPress={() => router.push('/account/terms')}>
            Syarat & Ketentuan
          </Text>{' '}
          dan{' '}
          <Text className={`font-semibold ${theme.linkAccent}`} onPress={() => router.push('/account/privacy')}>
            Kebijakan Privasi
          </Text>
          .
        </Text>
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

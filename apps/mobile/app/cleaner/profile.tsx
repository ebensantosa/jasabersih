import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, Star, Wrench } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { withCleanerKyc } from '../../src/components/CleanerKycGate';
import { safeBack } from '../../src/lib/safeBack';

type Profile = {
  bio: string | null;
  bringsTools: boolean;
  serviceAreas: any;
  languages: string[] | null;
  isAvailable: boolean;
  kycStatus: string;
  tier: string;
  ratingAvg: number | null;
  ratingCount: number | null;
  totalJobsDone: number;
  acceptanceRate: number | null;
  completionRate: number | null;
};

function CleanerProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // form state
  const [bio, setBio] = useState('');
  const [bringsTools, setBringsTools] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [areasText, setAreasText] = useState('');
  const [languagesText, setLanguagesText] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/cleaner/profile');
      const p = (res.data?.data ?? res.data) as Profile;
      setProfile(p);
      setBio(p.bio ?? '');
      setBringsTools(!!p.bringsTools);
      setIsAvailable(!!p.isAvailable);
      const areas = Array.isArray(p.serviceAreas) ? p.serviceAreas : (p.serviceAreas?.areas ?? []);
      setAreasText((areas as string[]).join(', '));
      setLanguagesText((p.languages ?? []).join(', '));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal load profil');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    setSaving(true);
    try {
      // bringsTools INTENTIONALLY not sent — admin-only (anti-fraud).
      await api.patch('/cleaner/profile', {
        bio,
        isAvailable,
        serviceAreas: areasText.split(',').map((s) => s.trim()).filter(Boolean),
        languages: languagesText.split(',').map((s) => s.trim()).filter(Boolean),
      });
      toast.success('Profil disimpan.');
      void load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal simpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => safeBack(router)} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">Profil Cleaner</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1D4ED8" /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* Stats card */}
            <View className="rounded-2xl bg-white p-4">
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Text className="font-bold text-base text-ink-900">Performa Kamu</Text>
                  <Text className="font-sans text-[11px] text-ink-500">Stat update otomatis tiap selesai job</Text>
                </View>
                <KycBadge status={profile?.kycStatus ?? 'pending'} />
              </View>
              <View className="mt-3 flex-row gap-3">
                <Stat icon={<Star size={14} color="#FACC15" fill="#FACC15" strokeWidth={1} />} label="Rating" value={profile?.ratingAvg != null ? `${Number(profile.ratingAvg).toFixed(2)}` : '–'} sub={`${profile?.ratingCount ?? 0} review`} />
                <Stat icon={<BadgeCheck size={14} color="#1D4ED8" />} label="Job Selesai" value={String(profile?.totalJobsDone ?? 0)} sub="all-time" />
                <Stat icon={<Wrench size={14} color="#475569" />} label="Tier" value={(profile?.tier ?? 'pending').toUpperCase()} sub="" />
              </View>
            </View>

            {/* Availability toggle */}
            <View className="flex-row items-center justify-between rounded-2xl bg-white p-4">
              <View className="flex-1">
                <Text className="font-bold text-sm text-ink-900">Aktif Terima Order</Text>
                <Text className="font-sans mt-0.5 text-[11px] text-ink-500">Matikan kalau lagi off / tidak available</Text>
              </View>
              <Switch
                value={isAvailable}
                onValueChange={setIsAvailable}
                trackColor={{ false: '#E2E8F0', true: '#1D4ED8' }}
                thumbColor="white"
              />
            </View>

            {/* Tools status — read-only, admin-controlled (anti-fraud) */}
            <View className="rounded-2xl bg-white p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-sm text-ink-900">Status Peralatan</Text>
                  <Text className="font-sans mt-0.5 text-[11px] text-ink-500">
                    {bringsTools ? 'Bawa alat sendiri (komisi lebih tinggi)' : 'Pakai alat dari kantor'}
                  </Text>
                </View>
                <View className={`rounded-full px-3 py-1 ${bringsTools ? 'bg-emerald-100' : 'bg-ink-100'}`}>
                  <Text className={`font-bold text-[10px] uppercase tracking-wider ${bringsTools ? 'text-emerald-800' : 'text-ink-600'}`}>
                    {bringsTools ? 'Bawa Alat' : 'Pakai Alat Kantor'}
                  </Text>
                </View>
              </View>
              <Text className="font-sans mt-2 text-[10px] leading-4 text-ink-400">
                Status diatur admin setelah verifikasi peralatan. Hubungi CS untuk perubahan.
              </Text>
            </View>

            <View className="rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-2 text-xs text-ink-700">Bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Cerita pengalaman & spesialisasi kamu…"
                placeholderTextColor="#94A3B8"
                multiline
                style={{ minHeight: 80, textAlignVertical: 'top' }}
                className="font-sans rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm text-ink-900"
              />
            </View>

            <View className="rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-2 text-xs text-ink-700">Area Layanan</Text>
              <TextInput
                value={areasText}
                onChangeText={setAreasText}
                placeholder="Jakarta Selatan, Kemang, Tebet"
                placeholderTextColor="#94A3B8"
                className="font-sans rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-900"
              />
              <Text className="font-sans mt-1 text-[10px] text-ink-500">Pisahkan dengan koma</Text>
            </View>

            <View className="rounded-2xl bg-white p-4">
              <Text className="font-semibold mb-2 text-xs text-ink-700">Bahasa</Text>
              <TextInput
                value={languagesText}
                onChangeText={setLanguagesText}
                placeholder="Indonesia, English, Java"
                placeholderTextColor="#94A3B8"
                className="font-sans rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-900"
              />
            </View>

            {profile?.kycStatus !== 'approved' && (
              <Pressable
                onPress={() => router.push('/cleaner/kyc')}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
              >
                <Text className="font-bold text-sm text-amber-900">Selesaikan Verifikasi KYC →</Text>
                <Text className="font-sans mt-1 text-[11px] text-amber-900">Wajib agar bisa menerima order & menarik saldo.</Text>
              </Pressable>
            )}

            <Pressable
              onPress={save}
              disabled={saving}
              className={`mt-2 items-center justify-center rounded-2xl py-3.5 ${saving ? 'bg-brand-400' : 'bg-brand-600'}`}
            >
              {saving ? <ActivityIndicator color="white" /> : <Text className="font-bold text-sm text-white">Simpan Perubahan</Text>}
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <View className="flex-1 rounded-xl bg-ink-50 p-3">
      <View className="flex-row items-center gap-1">
        {icon}
        <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">{label}</Text>
      </View>
      <Text className="font-bold mt-1 text-base text-ink-900">{value}</Text>
      {sub && <Text className="font-sans text-[10px] text-ink-500">{sub}</Text>}
    </View>
  );
}

function KycBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    approved: { bg: '#D1FAE5', color: '#047857', label: 'KYC ✓' },
    under_review: { bg: '#DBEAFE', color: '#1D4ED8', label: 'KYC Review' },
    rejected: { bg: '#FEE2E2', color: '#B91C1C', label: 'KYC Rejected' },
    pending: { bg: '#FEF3C7', color: '#B45309', label: 'KYC Pending' },
  };
  const c = cfg[status] ?? cfg.pending!;
  return (
    <View style={{ backgroundColor: c.bg }} className="rounded-full px-2.5 py-1">
      <Text style={{ color: c.color }} className="font-bold text-[10px]">{c.label}</Text>
    </View>
  );
}


export default withAuth(withCleanerKyc(CleanerProfileScreen), 'freelancer');

import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, Camera, Star, Wrench } from 'lucide-react-native';
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [reviews, setReviews] = useState<{ id: string; rating: number; review: string; createdAt: string; raterName: string | null }[]>([]);

  async function uploadPhoto() {
    try {
      const { launchImageLibraryAsync, MediaTypeOptions } = await import('expo-image-picker');
      const r = await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, quality: 1, allowsEditing: true, aspect: [1, 1] });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      setUploadingPhoto(true);
      const { compressImage, formatBytes } = await import('../../src/lib/imageCompress');
      const c = await compressImage(asset.uri);
      if (c.oversize) {
        toast.error(`Foto tetap > 5MB setelah kompresi (${formatBytes(c.size)}). Pilih foto lain.`);
        return;
      }
      const contentType = 'image/jpeg';
      const presign = await api.post('/cleaner/profile/photo-upload-url', { contentType });
      const { uploadUrl, publicUrl } = presign.data?.data ?? presign.data;
      const blob = await (await fetch(c.uri)).blob();
      const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
      if (!up.ok) throw new Error('Upload ke storage gagal');
      await api.patch('/cleaner/profile', { photoUrl: publicUrl });
      setPhotoUrl(publicUrl);
      toast.success(`Foto tersimpan (${formatBytes(c.size)})`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal upload foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

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
      // fetch /auth/me untuk dapat photo_url (cleaner_profiles gak punya kolom ini)
      try {
        const me = await api.get('/auth/me');
        const u = me.data?.data ?? me.data;
        setPhotoUrl(u?.photoUrl ?? u?.photo_url ?? null);
        // Fetch reviews
        if (u?.id) {
          const rr = await api.get(`/ratings/cleaner/${u.id}`);
          setReviews((rr.data?.data ?? rr.data ?? []) as any[]);
        }
      } catch {}
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
          <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">Profil Cleaner</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1D4ED8" /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* Foto Profil */}
            <View className="rounded-2xl bg-white p-4">
              <Text className="font-bold mb-3 text-sm text-ink-900">Foto Profil</Text>
              <View className="flex-row items-center gap-3">
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={{ width: 72, height: 72, borderRadius: 36 }} contentFit="cover" />
                ) : (
                  <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-ink-100">
                    <Camera color="#94A3B8" size={28} />
                  </View>
                )}
                <View className="flex-1">
                  <Text className="font-semibold text-sm text-ink-900">
                    {photoUrl ? 'Foto sudah ada' : 'Wajib upload foto wajah'}
                  </Text>
                  <Text className="font-medium mt-0.5 text-[11px] text-ink-500">
                    Foto asli (selfie wajah jelas, tanpa filter) wajib agar bisa online & dapat job.
                  </Text>
                  <Pressable
                    onPress={uploadPhoto}
                    disabled={uploadingPhoto}
                    className="mt-2 self-start rounded-lg bg-brand-600 px-3 py-1.5"
                  >
                    <Text className="font-bold text-[11px] text-white">{uploadingPhoto ? 'Mengupload...' : photoUrl ? 'Ganti Foto' : 'Upload Foto'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>

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

            <View className="rounded-2xl bg-white p-4">
              <Text className="font-bold mb-2 text-sm text-ink-900">Review dari Customer</Text>
              {reviews.length === 0 ? (
                <Text className="font-sans text-[12px] text-ink-500">Belum ada review. Selesaikan job dulu — customer akan kasih rating.</Text>
              ) : (
                reviews.map((rv, i) => (
                  <View key={rv.id} className={`py-3 ${i > 0 ? 'border-t border-ink-100' : ''}`}>
                    <View className="flex-row items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={12}
                          color={s <= rv.rating ? '#FACC15' : '#E2E8F0'}
                          fill={s <= rv.rating ? '#FACC15' : '#E2E8F0'}
                          strokeWidth={1}
                        />
                      ))}
                      <Text className="font-semibold ml-1 text-[11px] text-ink-700">{rv.raterName ?? 'Anonim'}</Text>
                      <Text className="font-sans ml-1 text-[10px] text-ink-400">
                        · {new Date(rv.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                    {rv.review && (
                      <Text className="font-sans mt-1 text-[12px] text-ink-700">{rv.review}</Text>
                    )}
                  </View>
                ))
              )}
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

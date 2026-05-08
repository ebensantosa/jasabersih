import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, MapPin, Star, Wrench } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../src/lib/api';
import { toast } from '../../../src/stores/ui';

type ProfileData = {
  profile: {
    id: string;
    name: string | null;
    photoUrl: string | null;
    joinedAt: string;
    bio: string | null;
    bringsTools: boolean;
    serviceAreas: any;
    languages: string[] | null;
    tier: string;
    ratingAvg: number | null;
    ratingCount: number | null;
    totalJobsDone: number;
    completionRate: number | null;
    acceptanceRate: number | null;
  };
  reviews: { rating: number; review: string; createdAt: string; raterName: string | null }[];
};

export default function CleanerPublicProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await api.get(`/cleaner/public/${id}`);
        setData((res.data?.data ?? res.data) as ProfileData);
      } catch (e: any) {
        toast.error(e?.response?.data?.error?.message ?? 'Cleaner tidak ditemukan');
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#1D4ED8" />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans text-ink-500">Cleaner tidak ditemukan.</Text>
      </SafeAreaView>
    );
  }

  const p = data.profile;
  const areas: string[] = Array.isArray(p.serviceAreas) ? p.serviceAreas : (p.serviceAreas?.areas ?? []);
  const yearsActive = Math.max(0, Math.floor((Date.now() - new Date(p.joinedAt).getTime()) / 86400000 / 365));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">Profil Cleaner</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* Hero card */}
          <View className="items-center rounded-2xl bg-white p-5">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-100">
              {p.photoUrl ? (
                <Image source={{ uri: p.photoUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
              ) : (
                <Text className="font-bold text-3xl text-brand-700">{(p.name ?? 'C')[0]}</Text>
              )}
            </View>
            <View className="mt-3 flex-row items-center gap-1">
              <Text className="font-bold text-lg text-ink-900">{p.name ?? '—'}</Text>
              <BadgeCheck color="#1D4ED8" size={18} />
            </View>
            <View className="mt-1 flex-row items-center gap-1">
              <Star color="#FACC15" fill="#FACC15" size={14} strokeWidth={1} />
              <Text className="font-bold text-sm text-ink-900">{p.ratingAvg != null ? Number(p.ratingAvg).toFixed(2) : '—'}</Text>
              <Text className="font-sans text-xs text-ink-500">({p.ratingCount ?? 0} review)</Text>
            </View>
            {yearsActive > 0 && (
              <Text className="font-sans mt-1 text-[11px] text-ink-500">
                Aktif sejak {new Date(p.joinedAt).getFullYear()} ({yearsActive} tahun)
              </Text>
            )}
          </View>

          {/* Stats */}
          <View className="flex-row gap-2">
            <Stat label="Job Selesai" value={String(p.totalJobsDone ?? 0)} sub="all-time" />
            <Stat label="Tier" value={(p.tier ?? 'pending').toUpperCase()} sub="" />
            <Stat label="Bawa Alat" value={p.bringsTools ? 'Ya' : 'Tidak'} sub={p.bringsTools ? 'lengkap' : ''} />
          </View>

          {/* Bio */}
          {p.bio && (
            <View className="rounded-2xl bg-white p-4">
              <Text className="font-bold mb-1 text-sm text-ink-900">Tentang</Text>
              <Text className="font-sans text-sm text-ink-700">{p.bio}</Text>
            </View>
          )}

          {/* Areas */}
          {areas.length > 0 && (
            <View className="rounded-2xl bg-white p-4">
              <View className="mb-2 flex-row items-center gap-1">
                <MapPin color="#1D4ED8" size={14} />
                <Text className="font-bold text-sm text-ink-900">Area Layanan</Text>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {areas.map((a, i) => (
                  <View key={i} className="rounded-full bg-brand-50 px-3 py-1">
                    <Text className="font-medium text-xs text-brand-700">{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Languages */}
          {p.languages && p.languages.length > 0 && (
            <View className="rounded-2xl bg-white p-4">
              <Text className="font-bold mb-2 text-sm text-ink-900">Bahasa</Text>
              <Text className="font-sans text-sm text-ink-700">{p.languages.join(' · ')}</Text>
            </View>
          )}

          {/* Reviews */}
          <View className="rounded-2xl bg-white p-4">
            <View className="mb-3 flex-row items-center gap-1">
              <Star color="#0F172A" size={14} />
              <Text className="font-bold text-sm text-ink-900">Review Customer ({data.reviews.length})</Text>
            </View>
            {data.reviews.length === 0 ? (
              <Text className="font-sans text-center text-xs text-ink-500">Belum ada review.</Text>
            ) : (
              <View className="space-y-3">
                {data.reviews.map((r, i) => (
                  <View key={i} className="border-t border-ink-100 pt-3 first:border-t-0 first:pt-0">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-semibold text-xs text-ink-900">{r.raterName ?? 'Customer'}</Text>
                      <View className="flex-row items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} color="#FACC15" fill={n <= r.rating ? '#FACC15' : 'transparent'} size={11} strokeWidth={1} />
                        ))}
                      </View>
                    </View>
                    {r.review && <Text className="font-sans mt-1 text-xs text-ink-700">{r.review}</Text>}
                    <Text className="font-sans mt-1 text-[10px] text-ink-400">
                      {new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white p-3">
      <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-500">{label}</Text>
      <Text className="font-bold mt-1 text-sm text-ink-900">{value}</Text>
      {sub && <Text className="font-sans text-[10px] text-ink-500">{sub}</Text>}
    </View>
  );
}

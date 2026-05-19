import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { api } from '../lib/api';
import { useT } from '../lib/i18n';

type Cleaner = {
  id: string;
  name: string | null;
  photoUrl: string | null;
  tier: string | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  totalJobsDone: number;
};

export function FeaturedCleaners() {
  const router = useRouter();
  const [list, setList] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    api.get('/cleaner/public/featured')
      .then((r) => setList(((r.data?.data ?? []) as any[]).map((c) => ({
        ...c, ratingAvg: c.ratingAvg ? Number(c.ratingAvg) : null,
        ratingCount: c.ratingCount ? Number(c.ratingCount) : 0,
        totalJobsDone: Number(c.totalJobsDone ?? 0),
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || list.length === 0) return null;

  return (
    <View className="mt-4">
      <View className="mb-2 flex-row items-center justify-between px-5">
        <Text className="font-bold text-base text-ink-900">{t('home.featured_cleaners')}</Text>
        <Text className="font-medium text-[11px] text-ink-500">{t('home.top_rated')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3 px-4 pb-1">
          {list.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: '/cleaner/public/[id]', params: { id: c.id } })}
              style={{ width: 140 }}
              className="overflow-hidden rounded-2xl bg-white p-3"
            >
              <View className="items-center">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-100">
                  {c.photoUrl ? (
                    <Image source={{ uri: c.photoUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                  ) : (
                    <Text className="font-bold text-xl text-brand-700">{(c.name ?? 'C')[0]}</Text>
                  )}
                </View>
                <Text className="font-bold mt-2 text-center text-xs text-ink-900" numberOfLines={1}>
                  {c.name ?? '—'}
                </Text>
                <View className="mt-1 flex-row items-center gap-0.5">
                  <Star color="#FACC15" fill="#FACC15" size={10} strokeWidth={1} />
                  <Text className="font-bold text-[11px] text-ink-900">{Number.isFinite(Number(c.ratingAvg)) ? Number(c.ratingAvg).toFixed(2) : '—'}</Text>
                  <Text className="font-sans text-[9px] text-ink-500">({c.ratingCount})</Text>
                </View>
                <Text className="font-medium mt-0.5 text-[10px] text-ink-500">{c.totalJobsDone} job</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

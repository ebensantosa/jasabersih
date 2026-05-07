import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, View } from 'react-native';

import { BANNERS } from '../data/catalog';
import { toast } from '../stores/ui';

const SCREEN_W = Dimensions.get('window').width;
const SIDE_PAD = 16;
const PEEK = 24; // peek next card (Tokopedia/Traveloka feel)
const GAP = 10;
const CARD_W = SCREEN_W - SIDE_PAD * 2 - PEEK;
const CARD_H = 140;
const SNAP = CARD_W + GAP;

export function BannerCarousel() {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function onTap(id: string) {
    if (id === 'b1') toast.info('Voucher HEMAT20 otomatis di-apply saat checkout');
    else if (id === 'b2') router.push('/services/full_house');
    else if (id === 'b3') router.push('/booking/wa-survey');
  }

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % BANNERS.length;
        scrollRef.current?.scrollTo({ x: next * SNAP, animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        decelerationRate="fast"
        snapToInterval={SNAP}
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD, paddingRight: SIDE_PAD + PEEK }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / SNAP);
          setActive(Math.max(0, Math.min(BANNERS.length - 1, i)));
        }}
      >
        {BANNERS.map((b, idx) => (
          <Pressable
            key={b.id}
            onPress={() => onTap(b.id)}
            style={{
              width: CARD_W,
              height: CARD_H,
              marginRight: idx === BANNERS.length - 1 ? 0 : GAP,
            }}
            className="overflow-hidden rounded-2xl"
          >
            <Image
              source={b.imageUrl}
              style={{ width: '100%', height: '100%', position: 'absolute' }}
              contentFit="cover"
            />
            <LinearGradient
              colors={['rgba(11,42,111,0.85)', 'rgba(11,42,111,0.45)', 'rgba(0,0,0,0.15)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: 'absolute', inset: 0 }}
            />
            <View className="flex-1 justify-between p-4">
              <View>
                <Text className="font-bold text-xl leading-6 text-white">{b.title}</Text>
                <Text className="font-medium mt-1 text-[11px] text-white/85">{b.subtitle}</Text>
              </View>
              <View className="self-start rounded-full bg-white px-3 py-1.5">
                <Text className="font-bold text-[11px] text-brand-700">{b.cta} →</Text>
              </View>
            </View>
            <View className="absolute bottom-2 right-3 flex-row items-center gap-1 rounded-full bg-black/30 px-2 py-1">
              {BANNERS.map((_, i) => (
                <View
                  key={i}
                  className={`h-1 rounded-full ${i === active ? 'w-3 bg-white' : 'w-1 bg-white/50'}`}
                />
              ))}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

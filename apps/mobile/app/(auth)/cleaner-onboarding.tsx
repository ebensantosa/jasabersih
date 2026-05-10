import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Calendar, DollarSign, MapPin } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const HERO = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=70';

const PERKS = [
  { icon: DollarSign, title: 'Payout Harian', desc: 'Saldo cair ke rekening / e-wallet, tarik kapan saja.' },
  { icon: Calendar, title: 'Jam Fleksibel', desc: 'Atur sendiri jadwal kerjamu, part-time atau full-time.' },
  { icon: MapPin, title: 'Pilih Area Kerja', desc: 'Hanya terima order dari kelurahan yang kamu pilih.' },
];

export default function CleanerOnboarding() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-white">
      <View className="relative h-72 w-full bg-ink-200">
        <Image source={HERO} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        <LinearGradient
          colors={['rgba(11,42,111,0.5)', 'rgba(11,42,111,0.85)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SafeAreaView edges={['top']} className="absolute left-0 right-0 top-0">
          <View className="flex-row items-center px-3 py-2">
            <Pressable
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/20"
            >
              <ArrowLeft color="white" size={22} />
            </Pressable>
          </View>
          <View className="px-6 pt-6">
            <Text className="font-bold text-3xl leading-9 text-white">
              Jadi Mitra{'\n'}Cleaner Profesional
            </Text>
            <Text className="font-sans mt-2 text-sm text-white/85">
              Kerja fleksibel, payout harian, atur jadwal sendiri.
            </Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        className="flex-1 -mt-6"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-4 rounded-2xl bg-white p-5 shadow-sm" style={{ elevation: 6 }}>
          <Text className="font-bold text-base text-ink-900">Kenapa gabung?</Text>
          <View className="mt-4 gap-4">
            {PERKS.map((p) => (
              <View key={p.title} className="flex-row gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
                  <p.icon color="#1D4ED8" size={20} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-sm text-ink-900">{p.title}</Text>
                  <Text className="font-sans mt-0.5 text-xs text-ink-500">{p.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
        <SafeAreaView edges={['bottom']}>
          <View className="p-4">
            <Pressable
              onPress={() => router.push({ pathname: '/(auth)/register', params: { mode: 'freelancer' } })}
              className="rounded-2xl bg-brand-700 py-4"
            >
              <Text className="font-bold text-center text-sm text-white">Daftar Sekarang</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

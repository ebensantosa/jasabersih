import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLocaleStore, useT } from '../../src/lib/i18n';
import { safeBack } from '../../src/lib/safeBack';

const OPTIONS: { code: 'id' | 'en'; flag: string; label: string }[] = [
  { code: 'id', flag: '🇮🇩', label: 'Bahasa Indonesia' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
];

export default function LanguageScreen() {
  const router = useRouter();
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">{t('lang.choose')}</Text>
        </View>

        <View className="m-4 overflow-hidden rounded-2xl bg-white">
          {OPTIONS.map((o, i) => (
            <Pressable
              key={o.code}
              onPress={() => setLocale(o.code)}
              className={`flex-row items-center gap-3 p-4 ${i > 0 ? 'border-t border-ink-100' : ''}`}
            >
              <Text style={{ fontSize: 24 }}>{o.flag}</Text>
              <Text className="font-semibold flex-1 text-sm text-ink-900">{o.label}</Text>
              {locale === o.code && <Check color="#1D4ED8" size={20} strokeWidth={2.4} />}
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </>
  );
}

import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Check, MapPin } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICE_CITIES } from '../../src/data/catalog';
import { useCleanerStore } from '../../src/stores/cleaner';
import { toast } from '../../src/stores/ui';

export default function CleanerAreas() {
  const router = useRouter();
  const areas = useCleanerStore((s) => s.serviceAreas);
  const toggle = useCleanerStore((s) => s.toggleArea);
  const setAreas = useCleanerStore((s) => s.setAreas);

  function save() {
    if (areas.length === 0) {
      toast.warning('Pilih minimal 1 area');
      return;
    }
    toast.success(`${areas.length} area tersimpan`);
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-white">
          <View className="flex-row items-center border-b border-ink-100 px-3 py-2">
            <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <View className="ml-1 flex-1">
              <Text className="font-bold text-base text-ink-900">Area Layananku</Text>
              <Text className="font-medium text-[11px] text-ink-500">
                {areas.length} dari {SERVICE_CITIES.length} kota dipilih
              </Text>
            </View>
            {areas.length > 0 && (
              <Pressable onPress={() => setAreas([])} className="px-2 py-1">
                <Text className="font-semibold text-xs text-danger">Reset</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <View className="rounded-2xl bg-brand-50 p-3">
            <Text className="font-semibold text-xs text-brand-900">💡 Tips</Text>
            <Text className="font-sans mt-1 text-[11px] leading-4 text-brand-900">
              Pilih kota yang kamu sanggup datangi. Kamu hanya akan menerima job dari area ini.
              Bisa update kapan saja.
            </Text>
          </View>

          <Text className="font-semibold mt-4 mb-2 text-[11px] uppercase tracking-wider text-ink-500">
            Pilih Kota
          </Text>
          <View className="overflow-hidden rounded-2xl bg-white">
            {SERVICE_CITIES.map((c, i) => {
              const active = areas.includes(c);
              return (
                <Pressable
                  key={c}
                  onPress={() => toggle(c)}
                  className={`flex-row items-center gap-3 px-4 py-3.5 ${
                    i < SERVICE_CITIES.length - 1 ? 'border-b border-ink-100' : ''
                  }`}
                >
                  <View
                    className={`h-9 w-9 items-center justify-center rounded-xl ${
                      active ? 'bg-brand-600' : 'bg-ink-100'
                    }`}
                  >
                    <MapPin color={active ? 'white' : '#64748B'} size={16} strokeWidth={2.2} />
                  </View>
                  <Text
                    className={`font-medium flex-1 text-sm ${
                      active ? 'text-brand-700' : 'text-ink-800'
                    }`}
                  >
                    {c}
                  </Text>
                  <View
                    className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                      active ? 'border-brand-600 bg-brand-600' : 'border-ink-300'
                    }`}
                  >
                    {active && <Check color="white" size={14} strokeWidth={3} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
          <SafeAreaView edges={['bottom']}>
            <View className="p-4">
              <Pressable onPress={save} className="rounded-2xl bg-brand-600 py-3.5">
                <Text className="font-bold text-center text-sm text-white">
                  Simpan ({areas.length} area)
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </>
  );
}

import { Sparkles, Sprout } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useCleaningModeStore, type CleaningMode } from '../stores/cleaningMode';

const OPTIONS: { key: CleaningMode; label: string; desc: string; icon: typeof Sparkles }[] = [
  { key: 'general', label: 'General Cleaning', desc: 'Pembersihan rutin (kotor ringan-sedang)', icon: Sprout },
  { key: 'deep',    label: 'Deep Cleaning',    desc: 'Menyeluruh: kerak, jamur, nat',            icon: Sparkles },
];

export function CleaningModeToggle({ compact = false }: { compact?: boolean }) {
  const mode = useCleaningModeStore((s) => s.mode);
  const setMode = useCleaningModeStore((s) => s.setMode);

  if (compact) {
    return (
      <View className="flex-row gap-1.5">
        {OPTIONS.map((o) => {
          const active = mode === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => setMode(o.key)}
              className={`rounded-full border px-2.5 py-1 ${active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'}`}
            >
              <Text className={`font-bold text-[10px] ${active ? 'text-white' : 'text-ink-700'}`}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text className="font-bold text-[12px] text-ink-900">Tipe Pembersihan</Text>
        <Text className="font-sans text-[10px] text-ink-500">Pilih dulu sebelum cek harga</Text>
      </View>
      <View className="flex-row gap-2">
        {OPTIONS.map((o) => {
          const active = mode === o.key;
          const Icon = o.icon;
          return (
            <Pressable
              key={o.key}
              onPress={() => setMode(o.key)}
              className={`flex-1 flex-row items-center gap-2 rounded-xl border p-2.5 ${
                active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
              }`}
            >
              <View className={`h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-brand-600' : 'bg-ink-100'}`}>
                <Icon color={active ? 'white' : '#475569'} size={16} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className={`font-bold text-[12px] ${active ? 'text-brand-700' : 'text-ink-900'}`}>{o.label}</Text>
                <Text className="font-sans text-[9px] text-ink-500" numberOfLines={1}>{o.desc}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

import { Minus, Plus } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="h-9 w-9 items-center justify-center rounded-full border border-ink-300 disabled:opacity-30"
      >
        <Minus color="#1D4ED8" size={16} strokeWidth={2.4} />
      </Pressable>
      <Text className="font-bold w-8 text-center text-base text-ink-900">{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="h-9 w-9 items-center justify-center rounded-full border border-ink-300 disabled:opacity-30"
      >
        <Plus color="#1D4ED8" size={16} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

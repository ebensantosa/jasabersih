import { Check } from 'lucide-react-native';
import { Text, View } from 'react-native';

const DOT = 28;

export function StepProgress({
  current,
  total,
  labels,
}: {
  current: number; // 1-based
  total: number;
  labels?: string[];
}) {
  return (
    <View className="bg-white px-5 pb-3 pt-1">
      {/* Dots row with connectors aligned to dot vertical center */}
      <View
        className="flex-row items-center"
        style={{ height: DOT, position: 'relative' }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <View key={i} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: DOT, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    height: DOT,
                    width: DOT,
                    borderRadius: DOT / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: done ? '#10B981' : active ? '#1D4ED8' : '#E2E8F0',
                  }}
                >
                  {done ? (
                    <Check color="white" size={14} strokeWidth={3} />
                  ) : (
                    <Text
                      style={{
                        fontFamily: 'Inter_700Bold',
                        fontSize: 12,
                        color: active ? 'white' : '#64748B',
                      }}
                    >
                      {step}
                    </Text>
                  )}
                </View>
              </View>
              {i < total - 1 && (
                <View
                  style={{
                    flex: 1,
                    height: 2,
                    marginHorizontal: 4,
                    borderRadius: 1,
                    backgroundColor: done ? '#10B981' : '#E2E8F0',
                  }}
                />
              )}
            </View>
          );
        })}
      </View>

      {labels && (
        <View className="mt-2 flex-row">
          {labels.map((l, i) => {
            const step = i + 1;
            const done = step < current;
            const active = step === current;
            return (
              <View key={l} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ width: DOT * 2.5, alignItems: 'center' }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 11,
                      fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium',
                      color: active ? '#1D4ED8' : done ? '#047857' : '#94A3B8',
                    }}
                  >
                    {l}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

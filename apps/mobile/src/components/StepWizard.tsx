import { Check } from 'lucide-react-native';
import { Text, View } from 'react-native';

/**
 * Modern progress indicator untuk multi-step booking flow.
 * - Header: nama step aktif + 'Langkah X dari Y'
 * - Segmented bar: tiap step jadi segment tipis (filled/active/pending)
 * - Labels row dengan circle indicator (check kalau done)
 * - Footer: '% selesai' subtle
 */
export function StepProgress({
  current,
  total,
  labels,
}: {
  current: number;
  total: number;
  labels?: string[];
}) {
  const percent = Math.round((current / total) * 100);
  const currentLabel = labels?.[current - 1] ?? `Langkah ${current}`;

  return (
    <View style={{ backgroundColor: 'white', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#0F172A' }}>
          {currentLabel}
        </Text>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#1D4ED8' }}>
          Langkah {current} dari {total}
        </Text>
      </View>

      {/* Segmented progress */}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          const bg = done ? '#10B981' : active ? '#1D4ED8' : '#E2E8F0';
          return (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: bg }} />
          );
        })}
      </View>

      {/* Labels with mini circle */}
      {labels && (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          {labels.map((l, i) => {
            const step = i + 1;
            const done = step < current;
            const active = step === current;
            const isLast = i === labels.length - 1;
            const justify = i === 0 ? 'flex-start' : isLast ? 'flex-end' : 'center';
            return (
              <View
                key={l}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: justify,
                  gap: 4,
                }}
              >
                {done ? (
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                    <Check color="white" size={9} strokeWidth={3.5} />
                  </View>
                ) : (
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: active ? '#1D4ED8' : 'white',
                      borderWidth: 1.5,
                      borderColor: active ? '#1D4ED8' : '#CBD5E1',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 8, color: active ? 'white' : '#94A3B8' }}>
                      {step}
                    </Text>
                  </View>
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 10,
                    fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium',
                    color: active ? '#1D4ED8' : done ? '#10B981' : '#94A3B8',
                  }}
                >
                  {l}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={{ marginTop: 6, fontSize: 9, fontFamily: 'Inter_500Medium', color: '#94A3B8', textAlign: 'right' }}>
        {percent}% selesai
      </Text>
    </View>
  );
}

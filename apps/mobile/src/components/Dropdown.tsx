import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Simple single-select dropdown for booking forms.
 * Tap → bottom-sheet modal with options. Tap option → select & close.
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Pilih...',
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between rounded-xl border border-ink-200 bg-white px-3 py-3"
      >
        <Text className={`font-semibold text-sm ${value ? 'text-ink-900' : 'text-ink-400'}`}>
          {value || placeholder}
        </Text>
        <ChevronDown color="#94A3B8" size={18} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%' }}
          >
            <SafeAreaView edges={['bottom']}>
              <View className="px-5 pb-2 pt-3">
                <View className="self-center mb-3 h-1 w-10 rounded-full bg-ink-300" />
                <Text className="font-extrabold text-base text-ink-900">{placeholder}</Text>
              </View>
              <ScrollView className="px-3">
                {options.map((opt) => {
                  const active = opt === value;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        onChange(opt);
                        setOpen(false);
                      }}
                      className={`flex-row items-center justify-between px-3 py-3.5 ${active ? 'bg-brand-50 rounded-lg' : ''}`}
                    >
                      <Text className={`font-semibold text-sm ${active ? 'text-brand-700' : 'text-ink-900'}`}>
                        {opt}
                      </Text>
                      {active && <Check color="#1D4ED8" size={18} strokeWidth={3} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

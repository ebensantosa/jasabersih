import { useRouter } from 'expo-router';
import { ChevronDown, MapPin, Plus, Tag } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAddressesStore, type SavedAddress } from '../stores/addresses';
import { toast } from '../stores/ui';

const MAX_ADDRESSES = 5;

export function AddressPickerInline({
  selectedId,
  onSelect,
  error,
}: {
  selectedId: string | null;
  onSelect: (a: SavedAddress) => void;
  error?: string | null;
}) {
  const router = useRouter();
  const list = useAddressesStore((s) => s.list);
  const selected = list.find((a) => a.id === selectedId) ?? null;
  const [open, setOpen] = useState(false);
  const atLimit = list.length >= MAX_ADDRESSES;

  if (list.length === 0) {
    return (
      <Pressable
        onPress={() => router.push('/addresses/edit')}
        className={`flex-row items-center gap-3 rounded-xl border-2 border-dashed p-4 ${
          error ? 'border-danger bg-red-50' : 'border-brand-300 bg-brand-50'
        }`}
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-600">
          <Plus color="white" size={20} strokeWidth={2.4} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-sm text-brand-700">Tambah Alamat</Text>
          <Text className="font-sans mt-0.5 text-[11px] text-ink-600">
            Belum ada alamat tersimpan. Tambah dulu ya.
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={`rounded-xl border bg-white p-3 ${
          error ? 'border-danger' : 'border-ink-200'
        }`}
      >
        {selected ? (
          <View className="flex-row items-start gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <MapPin color="#1D4ED8" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="font-bold text-sm text-ink-900">{selected.label}</Text>
                {selected.isDefault && (
                  <View className="rounded-full bg-brand-100 px-2 py-0.5">
                    <Text className="font-bold text-[9px] text-brand-700">UTAMA</Text>
                  </View>
                )}
              </View>
              <Text className="font-medium text-[11px] text-ink-600">
                {selected.recipientName} · {selected.recipientPhone}
              </Text>
              <Text className="font-sans mt-0.5 text-[11px] text-ink-500" numberOfLines={2}>
                {selected.addressLine}
              </Text>
            </View>
            <ChevronDown color="#94A3B8" size={16} />
          </View>
        ) : (
          <View className="flex-row items-center gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <MapPin color="#1D4ED8" size={18} strokeWidth={2.2} />
            </View>
            <Text className="font-medium flex-1 text-sm text-ink-500">Pilih alamat tersimpan</Text>
            <ChevronDown color="#94A3B8" size={16} />
          </View>
        )}
      </Pressable>
      {error && <Text className="font-medium mt-1 text-[11px] text-danger">{error}</Text>}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' }}
        >
          <Pressable onPress={() => {}} className="mt-auto rounded-t-3xl bg-white" style={{ maxHeight: '80%' }}>
            <SafeAreaView edges={['bottom']}>
              <View className="self-center mt-2 mb-3 h-1 w-10 rounded-full bg-ink-300" />
              <View className="flex-row items-center justify-between px-5 pb-2">
                <Text className="font-bold text-base text-ink-900">Pilih Alamat</Text>
                <Pressable
                  onPress={() => {
                    if (atLimit) {
                      toast.warning(`Maksimal ${MAX_ADDRESSES} alamat. Hapus salah satu dulu.`);
                      return;
                    }
                    setOpen(false);
                    router.push('/addresses/edit');
                  }}
                  disabled={atLimit}
                  className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${atLimit ? 'bg-ink-100' : 'bg-brand-50'}`}
                >
                  <Plus color={atLimit ? '#94A3B8' : '#1D4ED8'} size={12} strokeWidth={2.4} />
                  <Text className={`font-semibold text-xs ${atLimit ? 'text-ink-400' : 'text-brand-700'}`}>
                    {atLimit ? `Penuh (${list.length}/${MAX_ADDRESSES})` : 'Tambah'}
                  </Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingTop: 4 }}>
                {list.map((a) => {
                  const active = a.id === selectedId;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => {
                        onSelect(a);
                        setOpen(false);
                      }}
                      className={`rounded-xl border p-3 ${
                        active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'
                      }`}
                    >
                      <View className="flex-row items-center gap-2">
                        <Tag color={active ? '#1D4ED8' : '#64748B'} size={12} strokeWidth={2.4} />
                        <Text className="font-bold text-sm text-ink-900">{a.label}</Text>
                        {a.isDefault && (
                          <View className="rounded-full bg-brand-100 px-2 py-0.5">
                            <Text className="font-bold text-[9px] text-brand-700">UTAMA</Text>
                          </View>
                        )}
                      </View>
                      <Text className="font-medium mt-1 text-xs text-ink-700">
                        {a.recipientName} · {a.recipientPhone}
                      </Text>
                      <Text className="font-sans mt-0.5 text-[11px] text-ink-500" numberOfLines={2}>
                        {a.addressLine}
                      </Text>
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

import { Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { MapsIcon } from './BrandIcon';
import { LocationPicker, type PickedLocation } from './LocationPicker';

export function AddressField({
  value,
  onChange,
  coords,
  onCoordsChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  coords?: { lat: number; lng: number } | null;
  onCoordsChange?: (c: { lat: number; lng: number } | null) => void;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);

  function onPick(loc: PickedLocation) {
    onChange(loc.address);
    onCoordsChange?.({ lat: loc.lat, lng: loc.lng });
  }

  return (
    <View>
      {coords ? (
        <Pressable
          onPress={() => setOpen(true)}
          className={`flex-row items-start gap-3 rounded-xl border p-3 ${
            error ? 'border-danger' : 'border-brand-200 bg-brand-50'
          }`}
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-white">
            <MapsIcon size={28} />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-xs text-brand-700">Lokasi sudah dipilih di peta</Text>
            <Text className="font-medium mt-0.5 text-sm text-ink-800" numberOfLines={2}>
              {value}
            </Text>
            <Text className="font-sans mt-0.5 text-[10px] text-ink-400">
              {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
            </Text>
          </View>
          <Pencil color="#1D4ED8" size={14} />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          className={`flex-row items-center gap-3 rounded-xl border-2 border-dashed p-4 ${
            error ? 'border-danger bg-red-50' : 'border-brand-300 bg-brand-50'
          }`}
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
            <MapsIcon size={32} />
          </View>
          <View className="flex-1">
            <Text
              className={`font-semibold text-sm ${error ? 'text-danger' : 'text-brand-700'}`}
            >
              Pin Lokasi di Peta
            </Text>
            <Text className="font-sans mt-0.5 text-[11px] text-ink-600">
              Geser peta atau cari alamat untuk pilih lokasi
            </Text>
          </View>
        </Pressable>
      )}

      <Text className="font-semibold mb-1.5 mt-3 text-[11px] uppercase tracking-wider text-ink-500">
        Detail Tambahan (opsional)
      </Text>
      <TextInput
        value={coords ? value.split(',').slice(0, 0).join(', ') || '' : value}
        onChangeText={onChange}
        multiline
        placeholder={coords ? 'Patokan, kode pintu, lantai…' : 'Atau ketik alamat manual…'}
        placeholderTextColor="#94A3B8"
        className={`font-sans rounded-xl border bg-white px-4 py-3 text-sm ${
          error ? 'border-danger' : 'border-ink-200'
        }`}
        style={{ minHeight: 60 }}
      />
      {error && <Text className="font-medium mt-1 text-[11px] text-danger">{error}</Text>}

      <LocationPicker
        visible={open}
        initial={coords ?? undefined}
        onClose={() => setOpen(false)}
        onPick={onPick}
      />
    </View>
  );
}

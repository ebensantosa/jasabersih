import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Phone, Tag, User } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationPicker } from '../../src/components/LocationPicker';
import { Field, validateMinLength, validatePhone } from '../../src/components/Field';
import { useAddressesStore } from '../../src/stores/addresses';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { safeBack } from '../../src/lib/safeBack';

const LABEL_PRESETS = ['Rumah', 'Kantor', 'Kos', 'Apartemen', 'Lainnya'];

function EditAddress() {
  const router = useRouter();
  const { id, returnTo } = useLocalSearchParams<{ id?: string; returnTo?: string }>();
  const list = useAddressesStore((s) => s.list);
  const add = useAddressesStore((s) => s.add);
  const update = useAddressesStore((s) => s.update);

  const existing = id ? list.find((a) => a.id === id) : null;
  const isEdit = !!existing;

  const [label, setLabel] = useState(existing?.label ?? 'Rumah');
  const [recipientName, setRecipientName] = useState(existing?.recipientName ?? '');
  const [recipientPhone, setRecipientPhone] = useState(existing?.recipientPhone ?? '');
  const [addressLine, setAddressLine] = useState(existing?.addressLine ?? '');
  const [detailNote, setDetailNote] = useState(existing?.detailNote ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    existing ? { lat: existing.lat, lng: existing.lng } : null,
  );
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<{
    label?: string | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    addressLine?: string | null;
    detailNote?: string | null;
  }>({});

  function save() {
    const e = {
      label: validateMinLength(label, 2, 'Label'),
      recipientName: validateMinLength(recipientName, 2, 'Nama penerima'),
      recipientPhone: validatePhone(recipientPhone),
      addressLine: !addressLine.trim() || !coords ? 'Pin lokasi di peta dulu' : null,
      detailNote: validateMinLength(detailNote, 5, 'Detail alamat'),
    };
    setErrors(e);
    if (e.label || e.recipientName || e.recipientPhone || e.addressLine || e.detailNote) {
      toast.error('Lengkapi semua field wajib');
      return;
    }
    if (!coords) return;
    if (isEdit && existing) {
      update(existing.id, {
        label,
        recipientName,
        recipientPhone,
        addressLine,
        detailNote,
        lat: coords.lat,
        lng: coords.lng,
        isDefault,
      });
      toast.success('Alamat diperbarui');
    } else {
      add({
        label,
        recipientName,
        recipientPhone,
        addressLine,
        detailNote,
        lat: coords.lat,
        lng: coords.lng,
        isDefault,
      });
      toast.success('Alamat tersimpan');
    }
    // Kalau dipanggil dari booking flow (returnTo), redirect balik ke sana
    // biar user lanjut flow tanpa perlu start ulang dari menu.
    if (returnTo) {
      router.replace(returnTo as any);
      return;
    }
    safeBack();
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-white">
          <View className="flex-row items-center border-b border-ink-100 px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <Text className="font-bold ml-1 text-base text-ink-900">
              {isEdit ? 'Edit Alamat' : 'Tambah Alamat'}
            </Text>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {/* Label preset */}
          <Text className="font-semibold mb-2 text-[11px] uppercase tracking-wider text-ink-500">
            Label
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {LABEL_PRESETS.map((l) => {
              const active = l === label;
              return (
                <Pressable
                  key={l}
                  onPress={() => setLabel(l)}
                  className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                    active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
                  }`}
                >
                  <Tag color={active ? 'white' : '#64748B'} size={12} strokeWidth={2.4} />
                  <Text
                    className={`font-semibold text-xs ${active ? 'text-white' : 'text-ink-700'}`}
                  >
                    {l}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {label === 'Lainnya' && (
            <TextInput
              value={label === 'Lainnya' ? '' : label}
              onChangeText={setLabel}
              placeholder="Tulis label custom"
              placeholderTextColor="#94A3B8"
              maxLength={30}
              className="font-sans mt-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900"
            />
          )}

          {/* Penerima */}
          <View className="mt-4 gap-3">
            <Field label="Nama Penerima" required error={errors.recipientName}>
              <User color="#94A3B8" size={18} />
              <TextInput
                value={recipientName}
                onChangeText={setRecipientName}
                placeholder="Nama yang menerima cleaner"
                placeholderTextColor="#94A3B8"
                maxLength={50}
                className="font-sans flex-1 text-sm text-ink-900"
              />
            </Field>

            <Field label="Nomor HP" required error={errors.recipientPhone}>
              <Phone color="#94A3B8" size={18} />
              <TextInput
                value={recipientPhone}
                onChangeText={setRecipientPhone}
                placeholder="08xxxxxxxxxx"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                maxLength={15}
                className="font-sans flex-1 text-sm text-ink-900"
              />
            </Field>
          </View>

          {/* Lokasi pin */}
          <Text className="font-semibold mb-2 mt-4 text-[11px] uppercase tracking-wider text-ink-500">
            Lokasi <Text className="text-danger">*</Text>
          </Text>
          {coords ? (
            <Pressable
              onPress={() => setPickerOpen(true)}
              className={`flex-row items-start gap-3 rounded-xl border p-3 ${
                errors.addressLine ? 'border-danger bg-red-50' : 'border-brand-200 bg-brand-50'
              }`}
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-white">
                <MapPin color="#1D4ED8" size={20} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-xs text-brand-700">📍 Pin tersimpan</Text>
                <Text className="font-medium mt-0.5 text-sm text-ink-800" numberOfLines={2}>
                  {addressLine}
                </Text>
                <Text className="font-sans mt-0.5 text-[10px] text-ink-400">
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </Text>
                <Text className="font-bold mt-1 text-[11px] text-brand-600">Tap untuk ubah →</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setPickerOpen(true)}
              className={`flex-row items-center gap-3 rounded-xl border-2 border-dashed p-4 ${
                errors.addressLine ? 'border-danger bg-red-50' : 'border-brand-300 bg-brand-50'
              }`}
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-600">
                <MapPin color="white" size={20} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-sm text-brand-700">Pin Lokasi di Peta</Text>
                <Text className="font-sans mt-0.5 text-[11px] text-ink-600">
                  Geser peta atau cari alamat
                </Text>
              </View>
            </Pressable>
          )}
          {errors.addressLine && (
            <Text className="font-medium mt-1 text-[11px] text-danger">{errors.addressLine}</Text>
          )}

          {/* Detail tambahan - wajib */}
          <View className="mb-2 mt-4 flex-row items-center gap-1">
            <Text className="font-semibold text-[11px] uppercase tracking-wider text-ink-500">
              Detail Alamat
            </Text>
            <Text className="font-bold text-[11px] text-danger">*</Text>
          </View>
          <TextInput
            value={detailNote}
            onChangeText={(v) => {
              setDetailNote(v);
              if (errors.detailNote && v.trim().length >= 5)
                setErrors({ ...errors, detailNote: null });
            }}
            multiline
            placeholder="Wajib: patokan, blok, no. rumah, lantai, kode pintu, dll"
            placeholderTextColor="#94A3B8"
            maxLength={200}
            className={`font-sans rounded-xl border bg-white px-4 py-3 text-sm text-ink-900 ${
              errors.detailNote ? 'border-danger' : 'border-ink-200'
            }`}
            style={{ minHeight: 70 }}
          />
          {errors.detailNote ? (
            <Text className="font-medium mt-1 text-[11px] text-danger">{errors.detailNote}</Text>
          ) : (
            <Text className="font-sans mt-1 text-[10px] text-ink-500">
              Cleaner butuh detail spesifik, bukan cuma GPS - biar tidak kesasar.
            </Text>
          )}

          {/* Default toggle */}
          <Pressable
            onPress={() => setIsDefault(!isDefault)}
            className="mt-4 flex-row items-center justify-between rounded-xl bg-white p-4"
          >
            <View className="flex-1">
              <Text className="font-semibold text-sm text-ink-900">Jadikan alamat utama</Text>
              <Text className="font-sans text-[11px] text-ink-500">
                Otomatis terpilih saat pesan
              </Text>
            </View>
            <View
              className={`h-6 w-11 rounded-full p-0.5 ${
                isDefault ? 'bg-brand-600' : 'bg-ink-300'
              }`}
            >
              <View className={`h-5 w-5 rounded-full bg-white ${isDefault ? 'self-end' : 'self-start'}`} />
            </View>
          </Pressable>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
          <SafeAreaView edges={['bottom']}>
            <View className="p-4">
              <Pressable onPress={save} className="rounded-2xl bg-brand-600 py-3.5">
                <Text className="font-bold text-center text-sm text-white">
                  {isEdit ? 'Simpan Perubahan' : 'Simpan Alamat'}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        <LocationPicker
          visible={pickerOpen}
          initial={coords ?? undefined}
          onClose={() => setPickerOpen(false)}
          onPick={(loc) => {
            setCoords({ lat: loc.lat, lng: loc.lng });
            setAddressLine(loc.address);
            if (errors.addressLine) setErrors({ ...errors, addressLine: null });
          }}
        />
      </View>
    </>
  );
}


export default withAuth(EditAddress, 'customer');

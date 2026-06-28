import { Image } from 'expo-image';
import { Camera, CheckSquare, Square, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { uploadWithSignedUrl } from '../lib/signedUpload';
import { useAppContent } from '../stores/appContent';
import { formatRupiah } from '../data/catalog';
import { toast } from '../stores/ui';

export function UpchargeFormModal({
  bookingId,
  onClose,
  onSubmitted,
}: {
  bookingId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const addons = useAppContent((s) => s.content.addons);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const total = addons
    .filter((a) => selected.has(a.id))
    .reduce((s, a) => s + Number(a.price), 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function pickAndUpload() {
    try {
      const ImagePicker = await import('expo-image-picker');
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { toast.warning('Izin galeri ditolak'); return; }
      }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsEditing: false });
      if (r.canceled || !r.assets?.[0]) return;
      setUploading(true);
      const c = await compressImage(r.assets[0].uri);
      if (c.oversize) { toast.error('Foto >5MB setelah compress'); return; }
      const { publicUrl } = await uploadWithSignedUrl(
        async () => {
          const presign = await api.post(`/cleaner/jobs/${bookingId}/upcharge-photo-upload-url`, { contentType: 'image/jpeg' });
          return (presign.data?.data ?? presign.data) as { uploadUrl: string; publicUrl: string };
        },
        c.uri,
        'image/jpeg',
      );
      setPhotoUrl(publicUrl);
      setPhotoUri(c.uri);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal upload');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (selected.size === 0) { toast.error('Pilih minimal 1 layanan tambahan.'); return; }
    setSubmitting(true);
    try {
      await api.post(`/cleaner/jobs/${bookingId}/upcharge`, {
        addonIds: Array.from(selected),
        note: note.trim() || undefined,
        photoUrl,
      });
      toast.success('Permintaan terkirim — tunggu konfirmasi customer');
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal submit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-3xl bg-white p-5" style={{ maxHeight: '90%' }}>
          <View className="flex-row items-center justify-between">
            <Text className="font-bold text-base text-ink-900">Tambah Layanan</Text>
            <Pressable onPress={onClose}><X color="#94A3B8" size={20} /></Pressable>
          </View>
          <Text className="font-medium mt-1 text-[11px] text-ink-500">
            Pilih layanan tambahan yang diminta customer. Harga sudah flat — customer cukup setujui atau tolak.
          </Text>

          <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
            {addons.length === 0 ? (
              <View className="items-center py-6">
                <Text className="font-medium text-[12px] text-ink-400">Belum ada layanan tambahan tersedia.</Text>
              </View>
            ) : (
              <View className="gap-2">
                {addons.map((addon) => {
                  const isOn = selected.has(addon.id);
                  return (
                    <Pressable
                      key={addon.id}
                      onPress={() => toggle(addon.id)}
                      className={`flex-row items-center gap-3 rounded-xl border p-3 ${isOn ? 'border-brand-400 bg-brand-50' : 'border-ink-200 bg-white'}`}
                    >
                      {isOn
                        ? <CheckSquare color="#1D4ED8" size={20} strokeWidth={2.2} />
                        : <Square color="#94A3B8" size={20} strokeWidth={2} />}
                      <View className="flex-1">
                        <Text className={`font-semibold text-[13px] ${isOn ? 'text-brand-900' : 'text-ink-900'}`}>{addon.name}</Text>
                        {addon.description ? (
                          <Text className="font-medium mt-0.5 text-[10px] text-ink-500" numberOfLines={1}>{addon.description}</Text>
                        ) : null}
                      </View>
                      <Text className={`font-bold text-sm ${isOn ? 'text-brand-700' : 'text-ink-700'}`}>{formatRupiah(Number(addon.price))}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {selected.size > 0 && (
              <View className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex-row items-center justify-between">
                <Text className="font-semibold text-[11px] text-emerald-700">{selected.size} layanan dipilih</Text>
                <Text className="font-extrabold text-base text-emerald-900">+{formatRupiah(total)}</Text>
              </View>
            )}

            <Text className="font-semibold mt-4 text-xs text-ink-700">Catatan untuk customer (opsional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Mis. kamar mandi sudah oke, tambahin dapur juga ya..."
              multiline
              numberOfLines={2}
              maxLength={300}
              className="mt-1 rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-900"
              style={{ textAlignVertical: 'top', minHeight: 64 }}
            />

            <Text className="font-semibold mt-3 text-xs text-ink-700">Foto kondisi (opsional)</Text>
            <View className="mt-1 flex-row items-center gap-2">
              {photoUri ? (
                <View className="relative">
                  <Image source={{ uri: photoUri }} style={{ width: 80, height: 80, borderRadius: 12 }} />
                  <Pressable
                    onPress={() => { setPhotoUri(null); setPhotoUrl(null); }}
                    className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-red-600"
                  >
                    <Text className="font-bold text-[10px] text-white">×</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={pickAndUpload}
                  disabled={uploading}
                  className="h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-brand-300 bg-brand-50"
                >
                  {uploading ? <ActivityIndicator color="#1D4ED8" /> : <Camera color="#1D4ED8" size={20} />}
                  <Text className="font-medium mt-1 text-[10px] text-brand-700">{uploading ? '...' : 'Foto'}</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>

          <Pressable
            onPress={submit}
            disabled={submitting || selected.size === 0}
            className={`mt-4 items-center rounded-2xl py-3.5 ${submitting || selected.size === 0 ? 'bg-brand-300' : 'bg-brand-600'}`}
          >
            {submitting
              ? <ActivityIndicator color="white" />
              : <Text className="font-bold text-sm text-white">
                  {selected.size === 0 ? 'Pilih Layanan Dulu' : `Kirim Permintaan · +${formatRupiah(total)}`}
                </Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

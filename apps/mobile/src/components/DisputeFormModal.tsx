import * as ImagePicker from 'expo-image-picker';
import { AlertTriangle, Camera, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { uploadWithSignedUrl } from '../lib/signedUpload';
import { toast } from '../stores/ui';

const CUSTOMER_TYPES: { code: string; label: string }[] = [
  { code: 'quality', label: 'Kualitas pekerjaan kurang' },
  { code: 'no_show', label: 'Tidak datang / hilang' },
  { code: 'theft', label: 'Pencurian / kehilangan barang' },
  { code: 'payment', label: 'Masalah pembayaran' },
  { code: 'harassment', label: 'Pelecehan / kasar' },
  { code: 'other', label: 'Lainnya' },
];

const CLEANER_TYPES: { code: string; label: string }[] = [
  { code: 'customer_absent', label: 'Customer tidak ada di lokasi' },
  { code: 'address_issue', label: 'Alamat / pin tidak sesuai' },
  { code: 'access_denied', label: 'Akses lokasi ditolak / sulit masuk' },
  { code: 'scope_mismatch', label: 'Kondisi / scope tidak sesuai pesanan' },
  { code: 'unsafe_items', label: 'Barang berharga / risiko kerusakan' },
  { code: 'harassment', label: 'Pelecehan / ancaman / kasar' },
  { code: 'payment', label: 'Masalah pembayaran / charge tambahan' },
  { code: 'other', label: 'Butuh bantuan customer service' },
];

export function DisputeFormModal({
  bookingId,
  open,
  onClose,
  onSubmitted,
  isCleaner = false,
}: {
  bookingId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  isCleaner?: boolean;
}) {
  const typeOptions = isCleaner ? CLEANER_TYPES : CUSTOMER_TYPES;
  const defaultType = typeOptions[0]?.code ?? 'other';
  const [type, setType] = useState<string>(defaultType);
  const [description, setDescription] = useState('');
  const [evidenceKeys, setEvidenceKeys] = useState<{ key: string; uri: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) setType(defaultType);
  }, [open, defaultType]);

  async function pickEvidence() {
    if (evidenceKeys.length >= 5) {
      toast.warning('Maksimum 5 foto evidence.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.warning('Butuh akses galeri.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    setUploading(true);
    try {
      const contentType = asset.mimeType ?? 'image/jpeg';
      const { key } = await uploadWithSignedUrl(
        async () => {
          const urlRes = await api.post('/disputes/upload-url', { contentType });
          return (urlRes.data?.data ?? urlRes.data) as { uploadUrl: string; key: string };
        },
        asset.uri,
        contentType,
      );
      setEvidenceKeys([...evidenceKeys, { key, uri: asset.uri }]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload gagal');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (description.trim().length < 10) {
      toast.error('Deskripsi minimum 10 karakter.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/disputes', {
        bookingId,
        type,
        description: description.trim(),
        evidenceKeys: evidenceKeys.map((e) => e.key),
      });
      toast.success('Laporan terkirim. Tim kami akan review dalam 24 jam.');
      onSubmitted();
      reset();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim laporan');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setType(defaultType);
    setDescription('');
    setEvidenceKeys([]);
  }

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-3xl bg-white" style={{ maxHeight: '92%' }}>
          <View className="flex-row items-center justify-between border-b border-ink-100 px-4 py-3">
            <View className="flex-row items-center gap-2">
              <AlertTriangle color="#B91C1C" size={20} />
              <Text className="font-bold text-base text-ink-900">Laporkan Masalah</Text>
            </View>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-ink-100">
              <X color="#0F172A" size={16} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View>
              <Text className="font-semibold mb-2 text-xs text-ink-700">Jenis Masalah</Text>
              <View className="flex-row flex-wrap gap-2">
                {typeOptions.map((t) => (
                  <Pressable
                    key={t.code}
                    onPress={() => setType(t.code)}
                    className={`rounded-full border px-3 py-1.5 ${type === t.code ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                  >
                    <Text className={`font-medium text-xs ${type === t.code ? 'text-brand-700' : 'text-ink-700'}`}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text className="font-semibold mb-2 text-xs text-ink-700">Deskripsi <Text className="text-red-500">*</Text></Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={isCleaner
                  ? 'Jelaskan kendala di lapangan, kondisi aktual, dan bantuan yang kamu butuhkan (min 10 karakter)…'
                  : 'Ceritakan detail masalah yang kamu alami (min 10 karakter)…'}
                placeholderTextColor="#94A3B8"
                multiline
                style={{ minHeight: 100, textAlignVertical: 'top' }}
                className="font-sans rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm text-ink-900"
              />
              <Text className="font-sans mt-1 text-[10px] text-ink-500">{description.length}/2000</Text>
            </View>

            <View>
              <Text className="font-semibold mb-2 text-xs text-ink-700">Foto Bukti (opsional, max 5)</Text>
              <View className="flex-row flex-wrap gap-2">
                {evidenceKeys.map((e, i) => (
                  <View key={i} className="relative">
                    <Image source={{ uri: e.uri }} style={{ width: 70, height: 70, borderRadius: 8 }} />
                    <Pressable
                      onPress={() => setEvidenceKeys(evidenceKeys.filter((_, idx) => idx !== i))}
                      className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-red-600"
                    >
                      <X color="white" size={12} />
                    </Pressable>
                  </View>
                ))}
                {evidenceKeys.length < 5 && (
                  <Pressable
                    onPress={pickEvidence}
                    disabled={uploading}
                    className="h-[70px] w-[70px] items-center justify-center rounded-lg border border-dashed border-ink-300 bg-ink-50"
                  >
                    {uploading ? <ActivityIndicator size="small" /> : <Camera color="#64748B" size={20} />}
                  </Pressable>
                )}
              </View>
            </View>

            <View className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="font-bold text-[11px] text-amber-900">📌 Penting</Text>
              <Text className="font-sans mt-1 text-[11px] text-amber-900">
                {isCleaner
                  ? 'Gunakan laporan ini untuk kendala kerja yang benar-benar terjadi di lapangan. Pastikan deskripsi jujur dan bukti relevan.'
                  : 'Laporan palsu dapat ditolak dan berakibat strike di akun kamu. Pastikan deskripsi jujur dan bukti relevan.'}
                {'\n'}SLA admin response: 24 jam.
              </Text>
            </View>
          </ScrollView>

          <View className="flex-row gap-2 border-t border-ink-100 p-4">
            <Pressable onPress={onClose} className="flex-1 items-center justify-center rounded-xl bg-ink-100 py-3">
              <Text className="font-semibold text-sm text-ink-700">Batal</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={submitting || description.length < 10}
              className={`flex-1 items-center justify-center rounded-xl py-3 ${submitting || description.length < 10 ? 'bg-red-300' : 'bg-red-600'}`}
            >
              {submitting ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-sm text-white">Kirim Laporan</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

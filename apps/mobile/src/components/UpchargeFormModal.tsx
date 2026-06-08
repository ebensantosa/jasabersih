import { Image } from 'expo-image';
import { Camera, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
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
  const [amountStr, setAmountStr] = useState('');
  const [preview, setPreview] = useState<{ cleanerShare: number; platformFee: number; pct: number } | null>(null);
  const [reason, setReason] = useState('');

  // Debounced preview commission saat user ketik nominal
  useEffect(() => {
    const amt = parseInt(amountStr.replace(/[^\d]/g, ''), 10);
    if (!amt || amt <= 0) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.post(`/cleaner/jobs/${bookingId}/upcharge-preview`, { amount: amt });
        setPreview((r.data?.data ?? r.data) as any);
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [amountStr, bookingId]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function pickAndUpload() {
    try {
      const ImagePicker = await import('expo-image-picker');
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { toast.warning('Izin galeri ditolak'); return; }
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false,
      });
      if (r.canceled || !r.assets?.[0]) return;
      setUploading(true);
      const { compressImage } = await import('../lib/imageCompress');
      const c = await compressImage(r.assets[0].uri);
      if (c.oversize) { toast.error('Foto >5MB setelah compress'); return; }
      const presign = await api.post(`/cleaner/jobs/${bookingId}/upcharge-photo-upload-url`, { contentType: 'image/jpeg' });
      const { uploadUrl, publicUrl } = presign.data?.data ?? presign.data;
      const blob = await (await fetch(c.uri)).blob();
      const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!up.ok) throw new Error('Upload gagal');
      setPhotoUrl(publicUrl);
      setPhotoUri(c.uri);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal upload');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const amount = parseInt(amountStr.replace(/[^\d]/g, ''), 10);
    if (!amount || amount <= 0) { toast.error('Nominal harus > 0'); return; }
    if (reason.trim().length < 10) { toast.error('Alasan min 10 karakter'); return; }
    setSubmitting(true);
    try {
      await api.post(`/cleaner/jobs/${bookingId}/upcharge`, { amount, reason: reason.trim(), photoUrl });
      toast.success('Permintaan terkirim - tunggu approval customer');
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
            <Text className="font-bold text-base text-ink-900">Minta Charge Tambahan</Text>
            <Pressable onPress={onClose}><X color="#94A3B8" size={20} /></Pressable>
          </View>
          <Text className="font-medium mt-1 text-[11px] text-ink-500">
            Kondisi lebih kotor dari yang dipilih customer. Customer akan dapat notif untuk approve/reject.
          </Text>

          <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
            <Text className="font-semibold text-xs text-ink-700">Nominal Tambahan (Rp)</Text>
            <TextInput
              value={amountStr}
              onChangeText={(v) => setAmountStr(v.replace(/[^\d]/g, ''))}
              placeholder="mis. 50000"
              keyboardType="numeric"
              className="mt-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900"
            />

            {preview && (
              <View className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <Text className="font-semibold text-[10px] uppercase tracking-wider text-emerald-700">Yang Kamu Terima</Text>
                <Text className="font-extrabold mt-1 text-lg text-emerald-800">Rp {Number(preview.cleanerShare).toLocaleString('id-ID')}</Text>
                <Text className="font-medium mt-1 text-[10px] text-emerald-700">Akan masuk ke saldo setelah disetujui customer.</Text>
              </View>
            )}

            <Text className="font-semibold mt-3 text-xs text-ink-700">Alasan (min 10 karakter)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Mis. tingkat kotor jauh lebih parah, banyak noda lemak di dapur..."
              multiline
              numberOfLines={3}
              className="mt-1 rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-900"
              style={{ textAlignVertical: 'top', minHeight: 80 }}
            />

            <Text className="font-semibold mt-3 text-xs text-ink-700">Foto Bukti (opsional, rekomendasi)</Text>
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
            disabled={submitting}
            className={`mt-4 items-center rounded-2xl py-3.5 ${submitting ? 'bg-brand-400' : 'bg-brand-600'}`}
          >
            {submitting ? <ActivityIndicator color="white" /> : <Text className="font-bold text-sm text-white">Kirim Permintaan</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

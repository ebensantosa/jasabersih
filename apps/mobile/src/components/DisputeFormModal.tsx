import * as ImagePicker from 'expo-image-picker';
import { AlertTriangle, Camera, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { uploadWithSignedUrl } from '../lib/signedUpload';
import { toast } from '../stores/ui';

const CUSTOMER_TYPES = [
  { code: 'quality', label: 'Hasil kerja kurang rapi', note: 'Contoh: debu masih tersisa atau hasil belum sesuai pesanan.' },
  { code: 'no_show', label: 'Cleaner tidak datang / hilang', note: 'Contoh: cleaner tidak hadir atau meninggalkan lokasi tanpa kabar.' },
  { code: 'theft', label: 'Kehilangan barang / dugaan pencurian', note: 'Contoh: ada barang hilang atau dicurigai diambil.' },
  { code: 'payment', label: 'Masalah pembayaran', note: 'Contoh: nominal tidak sesuai atau ada kendala tagihan.' },
  { code: 'harassment', label: 'Pelecehan / perilaku kasar', note: 'Contoh: kata-kata kasar, ancaman, atau tindakan tidak pantas.' },
  { code: 'other', label: 'Lainnya', note: 'Gunakan jika kategori di atas belum sesuai.' },
] as const;

const CLEANER_TYPES = [
  { code: 'customer_absent', label: 'Pelanggan tidak ada di lokasi', note: 'Contoh: sudah sampai tetapi tidak ada yang bisa dihubungi.' },
  { code: 'address_issue', label: 'Alamat atau pin lokasi tidak sesuai', note: 'Contoh: titik lokasi meleset, alamat berbeda, atau akses tidak ditemukan.' },
  { code: 'access_denied', label: 'Akses lokasi ditolak / sulit masuk', note: 'Contoh: satpam menahan akses, pintu terkunci, atau masuk lokasi terhambat.' },
  { code: 'scope_mismatch', label: 'Kondisi lapangan tidak sesuai pesanan', note: 'Contoh: ruangan jauh lebih kotor, ada area tambahan, atau kebutuhan di luar pesanan.' },
  { code: 'unsafe_items', label: 'Barang berharga / risiko kerusakan', note: 'Contoh: ada barang rentan pecah, kabel berbahaya, atau kondisi tidak aman.' },
  { code: 'harassment', label: 'Pelecehan / ancaman / perilaku kasar', note: 'Contoh: kata-kata kasar, ancaman, atau tindakan tidak pantas.' },
  { code: 'payment', label: 'Masalah pembayaran / charge tambahan', note: 'Contoh: customer menolak charge tambahan atau pembayaran bermasalah.' },
  { code: 'other', label: 'Butuh bantuan customer service', note: 'Gunakan jika kendala tidak cocok dengan kategori lain.' },
] as const;

type ReportType = (typeof CUSTOMER_TYPES)[number]['code'] | (typeof CLEANER_TYPES)[number]['code'];

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
  const options = useMemo(() => (isCleaner ? CLEANER_TYPES : CUSTOMER_TYPES), [isCleaner]);
  const defaultType = options[0]?.code ?? 'other';
  const [type, setType] = useState<ReportType>(defaultType as ReportType);
  const [description, setDescription] = useState('');
  const [evidenceKeys, setEvidenceKeys] = useState<{ key: string; uri: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setType(defaultType as ReportType);
      setDescription('');
      setEvidenceKeys([]);
    }
  }, [open, defaultType]);

  async function pickEvidence() {
    if (evidenceKeys.length >= 5) {
      toast.warning('Maksimum 5 foto bukti.');
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
      setEvidenceKeys((prev) => [...prev, { key, uri: asset.uri }]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload gagal');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (description.trim().length < 10) {
      toast.error('Deskripsi minimal 10 karakter.');
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
      toast.success('Laporan terkirim. Tim kami akan meninjau dalam 24 jam.');
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal mengirim laporan');
    } finally {
      setSubmitting(false);
    }
  }

  const pageTitle = isCleaner ? 'Laporkan Kendala' : 'Laporkan Masalah';
  const introTitle = isCleaner ? 'Kendala di lokasi?' : 'Ada masalah pada pesanan?';
  const introBody = isCleaner
    ? 'Gunakan formulir ini untuk melaporkan kendala yang benar-benar terjadi di lokasi. Pilih kategori yang paling sesuai, lalu jelaskan kronologinya.'
    : 'Gunakan formulir ini jika ada masalah pada hasil kerja, perilaku cleaner, atau pembayaran. Pilih kategori yang paling sesuai, lalu jelaskan kronologinya.';
  const placeholder = isCleaner
    ? 'Contoh: pelanggan tidak ada di lokasi, alamat tidak sesuai, akses tertutup, atau kondisi lapangan berbeda dari pesanan...'
    : 'Contoh: hasil kerja kurang rapi, cleaner tidak datang, ada perilaku yang tidak pantas, atau masalah pembayaran...';

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-3xl bg-white" style={{ maxHeight: '92%' }}>
          <View className="flex-row items-center justify-between border-b border-ink-100 px-4 py-3">
            <View className="flex-row items-center gap-2">
              <AlertTriangle color="#B91C1C" size={20} />
              <Text className="font-bold text-base text-ink-900">{pageTitle}</Text>
            </View>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-ink-100">
              <X color="#0F172A" size={16} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View className="rounded-2xl bg-amber-50 p-4">
              <View className="flex-row items-start gap-2">
                <ShieldInfo />
                <View className="flex-1">
                  <Text className="font-bold text-sm text-amber-900">Voucher Rp 50.000</Text>
                  <Text className="font-sans mt-1 text-[11px] leading-4 text-amber-900">{introBody}</Text>
                </View>
              </View>
            </View>

            <View className="rounded-2xl bg-white p-4">
              <Text className="font-bold mb-1 text-sm text-ink-900">{introTitle}</Text>
              <Text className="font-sans mb-3 text-[11px] leading-4 text-ink-500">
                Kalau yang dilaporkan adalah kendala cleaner, pilih kategori yang paling mendekati. Kalau masalahnya ada di customer atau lokasi, pilih yang sesuai lalu jelaskan detailnya.
              </Text>
              <View className="gap-2">
                {options.map((item) => {
                  const active = type === item.code;
                  return (
                    <Pressable
                      key={item.code}
                      onPress={() => setType(item.code as ReportType)}
                      className={`flex-row items-start gap-3 rounded-xl border p-3 ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}
                    >
                      <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full border-2 ${active ? 'border-brand-600 bg-brand-600' : 'border-ink-300'}`}>
                        {active && <View className="h-2 w-2 rounded-full bg-white" />}
                      </View>
                      <View className="flex-1">
                        <Text className={`font-bold text-sm ${active ? 'text-brand-700' : 'text-ink-900'}`}>{item.label}</Text>
                        <Text className="font-sans mt-0.5 text-[11px] text-ink-500">{item.note}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="rounded-2xl bg-white p-4">
              <Text className="font-bold mb-1 text-sm text-ink-900">Detail kronologi</Text>
              <Text className="font-sans mb-2 text-[11px] leading-4 text-ink-500">
                Tulis singkat dan jelas:
                {'\n'}- Kapan kejadian terjadi
                {'\n'}- Siapa yang terlibat
                {'\n'}- Apa yang terjadi
                {'\n'}- Langkah yang sudah kamu ambil
                {'\n'}- Bukti pendukung jika ada
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={placeholder}
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={2000}
                style={{ minHeight: 100, textAlignVertical: 'top' }}
                className="font-sans rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm text-ink-900"
              />
              <Text className="font-sans mt-1 text-[10px] text-ink-500">{description.length}/2000</Text>
            </View>

            <View className="rounded-2xl bg-white p-4">
              <Text className="font-bold mb-2 text-sm text-ink-900">Foto bukti (opsional, maks 5)</Text>
              <View className="flex-row flex-wrap gap-2">
                {evidenceKeys.map((e, i) => (
                  <View key={i} className="relative">
                    <Image source={{ uri: e.uri }} style={{ width: 70, height: 70, borderRadius: 8 }} />
                    <Pressable
                      onPress={() => setEvidenceKeys((prev) => prev.filter((_, idx) => idx !== i))}
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
              <Text className="font-bold text-[11px] text-amber-900">Penting</Text>
              <Text className="font-sans mt-1 text-[11px] text-amber-900">
                {isCleaner
                  ? 'Gunakan laporan ini hanya untuk kendala kerja yang benar-benar terjadi di lapangan. Pastikan deskripsi jujur dan bukti relevan.'
                  : 'Laporan palsu dapat ditolak dan bisa berakibat sanksi pada akun kamu. Pastikan deskripsi jujur dan bukti relevan.'}
                {'\n'}Waktu tanggapan admin maksimal 24 jam.
              </Text>
            </View>
          </ScrollView>

          <View className="flex-row gap-2 border-t border-ink-100 p-4">
            <Pressable onPress={onClose} className="flex-1 items-center justify-center rounded-xl bg-ink-100 py-3">
              <Text className="font-semibold text-sm text-ink-700">Batal</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={submitting || description.trim().length < 10}
              className={`flex-1 items-center justify-center rounded-xl py-3 ${submitting || description.trim().length < 10 ? 'bg-red-300' : 'bg-red-600'}`}
            >
              {submitting ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-sm text-white">Kirim Laporan</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ShieldInfo() {
  return (
    <View className="h-8 w-8 items-center justify-center rounded-full bg-amber-100">
      <AlertTriangle color="#B45309" size={18} />
    </View>
  );
}

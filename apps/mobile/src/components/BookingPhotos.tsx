import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Download, Lock, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { toast } from '../stores/ui';

type Photo = { id: string; photoType: 'before' | 'after' | 'damage'; url: string; uploadedAt: string };

export function BookingPhotos({ bookingId, isCleaner, status }: { bookingId: string; isCleaner: boolean; status: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState<'before' | 'after' | 'damage' | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  // Damage requires reason text - input modal before pick photo.
  const [damageReason, setDamageReason] = useState('');
  const [damageInputOpen, setDamageInputOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get(`/cleaner/jobs/${bookingId}/photos`);
      setPhotos((r.data?.data ?? []) as Photo[]);
    } catch { /* silent */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [bookingId]);

  const beforePhotosCount = photos.filter((p) => p.photoType === 'before').length;

  async function pickAndUpload(type: 'before' | 'after' | 'damage') {
    // Guard: after harus setelah before (urutan flow yg benar)
    if (type === 'after' && beforePhotosCount === 0) {
      toast.warning('Upload foto SEBELUM dulu, baru bisa upload foto SESUDAH.');
      return;
    }
    // Damage: wajib isi deskripsi alasan dulu sebelum pick foto.
    if (type === 'damage' && damageReason.trim().length < 10) {
      setDamageInputOpen(true);
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) { toast.warning('Butuh akses kamera/galeri.'); return; }
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 1 }).catch(() => null) ??
      await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    setUploading(type);
    try {
      // Compress dulu (max 1600px, JPEG 0.7) - cleaner sering upload via 4G, irit data
      const { compressImage, formatBytes } = await import('../lib/imageCompress');
      const compressed = await compressImage(asset.uri);
      if (compressed.oversize) throw new Error(`Foto terlalu besar (${formatBytes(compressed.size)} > 5MB). Coba foto ulang.`);

      const r = await api.post(`/cleaner/jobs/${bookingId}/photo-upload-url`, { photoType: type, contentType: 'image/jpeg' });
      const { uploadUrl, key } = r.data?.data ?? r.data;
      const fileRes = await fetch(compressed.uri);
      const blob = await fileRes.blob();
      const putRes = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'content-type': 'image/jpeg' } });
      if (!putRes.ok) throw new Error(`Upload gagal (HTTP ${putRes.status}). Cek koneksi.`);
      await api.post(`/cleaner/jobs/${bookingId}/photos`, {
        photoType: type,
        storagePath: key,
        ...(type === 'damage' ? { description: damageReason.trim() } : {}),
      });
      toast.success(`Foto ${type === 'before' ? 'sebelum' : type === 'after' ? 'sesudah' : 'kerusakan'} ter-upload (${formatBytes(compressed.size)})`);
      if (type === 'damage') setDamageReason('');
      void load();
    } catch (e: any) {
      const status = e?.response?.status;
      let msg = e?.response?.data?.error?.message ?? e?.message ?? 'Upload gagal';
      if (status === 413) msg = 'Foto terlalu besar.';
      else if (status === 415) msg = 'Format tidak didukung. JPG/PNG/WebP saja.';
      else if (status >= 500) msg = 'Server error. Coba lagi.';
      toast.error(msg);
    } finally { setUploading(null); }
  }

  // Samakan dengan backend:
  // - before sudah boleh di-upload saat matched / on_the_way sebelum cleaner tap "Mulai Kerja"
  // - after wajib setelah before, biasanya saat in_progress / completed
  // - damage tetap boleh selama job aktif
  const canManagePhotos = isCleaner && ['matched', 'on_the_way', 'in_progress', 'completed'].includes(status);
  const beforePhotos = photos.filter((p) => p.photoType === 'before');
  const afterPhotos = photos.filter((p) => p.photoType === 'after');
  const damagePhotos = photos.filter((p) => p.photoType === 'damage');

  if (!canManagePhotos && photos.length === 0) return null;

  // Hint contextual untuk cleaner
  const needBefore = isCleaner && ['matched', 'on_the_way', 'in_progress'].includes(status) && beforePhotos.length === 0;
  const needAfter = isCleaner && ['in_progress', 'completed'].includes(status) && beforePhotos.length > 0 && afterPhotos.length === 0;
  const beforeLocked = !isCleaner || !['matched', 'on_the_way', 'in_progress', 'completed'].includes(status);
  // After locked sampai before ada minimal 1 dan job sudah mulai dikerjakan
  const afterLocked = !isCleaner || beforePhotos.length === 0 || !['in_progress', 'completed'].includes(status);
  const damageLocked = !isCleaner || !['matched', 'on_the_way', 'in_progress', 'completed'].includes(status);

  return (
    <View className="rounded-2xl bg-white p-4">
      <Text className="font-bold mb-3 text-sm text-ink-900">Foto Pekerjaan</Text>

      {needBefore && (
        <View className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <Text className="font-bold text-[11px] text-amber-900">Step 1: Upload foto SEBELUM</Text>
          <Text className="font-sans mt-0.5 text-[10px] leading-4 text-amber-800">
            Foto kondisi area sebelum dibersihkan (minimal 1). Tombol "Sesudah" akan terbuka setelah upload "Sebelum".
          </Text>
        </View>
      )}
      {needAfter && (
        <View className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <Text className="font-bold text-[11px] text-emerald-900">Step 2: Upload foto SESUDAH</Text>
          <Text className="font-sans mt-0.5 text-[10px] leading-4 text-emerald-800">
            Foto hasil pekerjaan sebagai bukti job selesai (minimal 1). Wajib sebelum tandai "Selesai".
          </Text>
        </View>
      )}

      {beforePhotos.length > 0 && <PhotoRow label="Sebelum" photos={beforePhotos} onPress={setPreview} />}
      {afterPhotos.length > 0 && <PhotoRow label="Sesudah" photos={afterPhotos} onPress={setPreview} />}
      {damagePhotos.length > 0 && <PhotoRow label="Kerusakan" photos={damagePhotos} onPress={setPreview} />}

      {preview && <PhotoPreviewModal url={preview} onClose={() => setPreview(null)} />}
      {damageInputOpen && (
        <DamageReasonModal
          value={damageReason}
          onChange={setDamageReason}
          onCancel={() => { setDamageReason(''); setDamageInputOpen(false); }}
          onConfirm={() => {
            if (damageReason.trim().length < 10) {
              toast.warning('Min 10 karakter');
              return;
            }
            setDamageInputOpen(false);
            void pickAndUpload('damage');
          }}
        />
      )}

      {photos.length === 0 && !canManagePhotos && !loading && (
        <Text className="font-sans text-center text-xs text-ink-500">Belum ada foto.</Text>
      )}

      {canManagePhotos && (
        <View className="mt-3 flex-row gap-2 border-t border-ink-100 pt-3">
          <UploadBtn label="Sebelum" loading={uploading === 'before'} onPress={() => pickAndUpload('before')} variant={needBefore ? 'primary' : undefined} locked={beforeLocked} />
          <UploadBtn label="Sesudah" loading={uploading === 'after'} onPress={() => pickAndUpload('after')} variant={needAfter ? 'primary' : undefined} locked={afterLocked} />
          <UploadBtn label="Kerusakan" loading={uploading === 'damage'} onPress={() => pickAndUpload('damage')} variant="warning" locked={damageLocked} />
        </View>
      )}
    </View>
  );
}

function PhotoRow({ label, photos, onPress }: { label: string; photos: Photo[]; onPress: (url: string) => void }) {
  return (
    <View className="mb-3">
      <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-ink-500">{label} ({photos.length})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {photos.map((p) => (
            <Pressable key={p.id} onPress={() => onPress(p.url)}>
              <Image source={{ uri: p.url }} style={{ width: 100, height: 100, borderRadius: 8 }} contentFit="cover" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// Fullscreen preview + download button. Pakai expo-file-system + MediaLibrary
// supaya foto bisa di-save ke gallery user.
function PhotoPreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const Linking = await import('expo-linking');
      await Linking.openURL(url);
      toast.success('Buka di browser - tahan & pilih "Simpan gambar"');
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal buka foto');
    } finally {
      setDownloading(false);
    }
  }
  return (
    <Modal transparent statusBarTranslucent visible animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={{ uri: url }} style={{ width: '95%', height: '75%' }} contentFit="contain" />
        <View className="absolute bottom-12 flex-row gap-3">
          <Pressable onPress={download} disabled={downloading} className="flex-row items-center gap-2 rounded-full bg-white px-4 py-2.5">
            {downloading ? <ActivityIndicator size="small" color="#1D4ED8" /> : <Download color="#1D4ED8" size={16} strokeWidth={2.4} />}
            <Text className="font-bold text-sm text-brand-700">{downloading ? 'Menyimpan…' : 'Simpan ke Galeri'}</Text>
          </Pressable>
          <Pressable onPress={onClose} className="h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <X color="white" size={20} />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// Modal input deskripsi kerusakan. Wajib min 10 char sebelum bisa pick foto.
function DamageReasonModal({ value, onChange, onCancel, onConfirm }: {
  value: string; onChange: (v: string) => void; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal transparent statusBarTranslucent visible animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View className="w-full rounded-2xl bg-white p-5">
          <Text className="font-bold text-base text-ink-900">Deskripsi Kerusakan</Text>
          <Text className="font-sans mt-1 text-[12px] text-ink-600">
            Jelaskan apa yang rusak / hilang & kondisinya. Foto saja gak cukup untuk admin review sengketa.
          </Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            multiline
            textAlignVertical="top"
            placeholder="Contoh: vas keramik di meja ruang tamu terjatuh saat angkat karpet, bagian leher pecah. Tidak ada barang lain yang rusak."
            placeholderTextColor="#94A3B8"
            className="font-sans mt-3 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-900"
            style={{ minHeight: 110 }}
          />
          <Text className="font-medium mt-1 text-[10px] text-ink-400">{value.length} / min 10 karakter</Text>
          <View className="mt-4 flex-row gap-2">
            <Pressable onPress={onCancel} className="flex-1 items-center rounded-xl border border-ink-300 py-3">
              <Text className="font-semibold text-sm text-ink-700">Batal</Text>
            </Pressable>
            <Pressable onPress={onConfirm} className="flex-1 items-center rounded-xl bg-brand-600 py-3">
              <Text className="font-bold text-sm text-white">Lanjut Pilih Foto</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function UploadBtn({ label, loading, onPress, variant, locked }: { label: string; loading: boolean; onPress: () => void; variant?: 'warning' | 'primary'; locked?: boolean }) {
  const cls = locked
    ? 'bg-ink-100 border-ink-200'
    : variant === 'warning'
      ? 'bg-amber-50 border-amber-200'
      : variant === 'primary'
        ? 'bg-brand-600 border-brand-700'
        : 'bg-brand-50 border-brand-200';
  const fg = locked
    ? 'text-ink-400'
    : variant === 'warning' ? 'text-amber-700' : variant === 'primary' ? 'text-white' : 'text-brand-700';
  const iconColor = locked
    ? '#94A3B8'
    : variant === 'warning' ? '#B45309' : variant === 'primary' ? '#FFFFFF' : '#1D4ED8';
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || locked}
      className={`flex-1 flex-row items-center justify-center gap-1 rounded-xl border ${cls} px-3 py-2.5 ${loading ? 'opacity-50' : ''}`}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? 'white' : undefined} />
        : locked
          ? <Lock size={12} color={iconColor} />
          : <Camera size={14} color={iconColor} />}
      <Text className={`font-semibold text-xs ${fg}`}>{label}</Text>
    </Pressable>
  );
}

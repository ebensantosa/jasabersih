import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle2, Download, Lock, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { useVisiblePoll } from '../lib/useVisiblePoll';

import { api } from '../lib/api';
import { useBookingsStore } from '../stores/bookings';
import { compressImage, formatBytes } from '../lib/imageCompress';
import { uploadWithSignedUrl } from '../lib/signedUpload';
import { toast } from '../stores/ui';

type Photo = { id: string; photoType: 'before' | 'after' | 'damage'; url: string; uploadedAt: string };

export function BookingPhotos({
  bookingId,
  isCleaner,
  status,
  onSummaryChange,
}: {
  bookingId: string;
  isCleaner: boolean;
  status: string;
  onSummaryChange?: (summary: { beforeCount: number; afterCount: number; damageCount: number }) => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState<'before' | 'after' | 'damage' | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [damageReason, setDamageReason] = useState('');
  const [showDamageSection, setShowDamageSection] = useState(false);

  const reloadSignal = useBookingsStore((s) => s.reloadSignal[bookingId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/cleaner/jobs/${bookingId}/photos`);
      const nextPhotos = (r.data?.data ?? []) as Photo[];
      setPhotos(nextPhotos);
      onSummaryChange?.({
        beforeCount: nextPhotos.filter((p) => p.photoType === 'before').length,
        afterCount: nextPhotos.filter((p) => p.photoType === 'after').length,
        damageCount: nextPhotos.filter((p) => p.photoType === 'damage').length,
      });
      // Auto-show damage section if damage photos already exist
      if (nextPhotos.some((p) => p.photoType === 'damage')) setShowDamageSection(true);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [bookingId, onSummaryChange]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (reloadSignal) void load(); }, [reloadSignal, load]);

  const activeStatuses = ['matched', 'on_the_way', 'in_progress'];
  const isActive = !!status && activeStatuses.includes(status);
  useVisiblePoll(load, 60_000, isActive);

  const beforePhotos = photos.filter((p) => p.photoType === 'before');
  const afterPhotos = photos.filter((p) => p.photoType === 'after');
  const damagePhotos = photos.filter((p) => p.photoType === 'damage');
  const beforePhotosCount = beforePhotos.length;

  const canManagePhotos = isCleaner && status === 'in_progress';
  const MAX_PHOTOS_PER_TYPE = 10;
  const beforeLocked = !canManagePhotos || beforePhotos.length >= MAX_PHOTOS_PER_TYPE;
  const afterLocked = !canManagePhotos || beforePhotosCount === 0 || afterPhotos.length >= MAX_PHOTOS_PER_TYPE;
  const damageLocked = !canManagePhotos || damagePhotos.length >= MAX_PHOTOS_PER_TYPE;

  const needBefore = canManagePhotos && beforePhotosCount === 0;
  const needAfter = canManagePhotos && beforePhotosCount > 0 && afterPhotos.length === 0;
  const activeStep = needBefore ? 'before' : needAfter ? 'after' : null;

  if (!canManagePhotos && photos.length === 0) return null;

  async function pickAndUpload(type: 'before' | 'after' | 'damage') {
    if (type === 'after' && beforePhotosCount === 0) {
      toast.warning('Upload foto SEBELUM dulu, baru bisa upload foto SESUDAH.');
      return;
    }
    if (type === 'damage' && damageReason.trim().length < 10) {
      toast.warning('Isi deskripsi kerusakan dulu (min 10 karakter).');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) { toast.warning('Butuh akses kamera/galeri.'); return; }
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 1 }).catch(() => null) ??
      await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    setUploading(type);
    try {
      const compressed = await compressImage(asset.uri);
      if (compressed.oversize) throw new Error(`Foto terlalu besar (${formatBytes(compressed.size)} > 5MB). Coba foto ulang.`);

      const { key } = await uploadWithSignedUrl(
        async () => {
          const r = await api.post(`/cleaner/jobs/${bookingId}/photo-upload-url`, { photoType: type, contentType: 'image/jpeg' });
          return (r.data?.data ?? r.data) as { uploadUrl: string; key: string };
        },
        compressed.uri,
        'image/jpeg',
      );
      await api.post(`/cleaner/jobs/${bookingId}/photos`, {
        photoType: type,
        storagePath: key,
        ...(type === 'damage' ? { description: damageReason.trim() } : {}),
      });
      toast.success(`Foto ${type === 'before' ? 'kondisi awal' : type === 'after' ? 'hasil kerja' : 'kerusakan'} ter-upload (${formatBytes(compressed.size)})`);
      void load();
    } catch (e: any) {
      const s = e?.response?.status;
      let msg = e?.response?.data?.error?.message ?? e?.message ?? 'Upload gagal';
      if (s === 413) msg = 'Foto terlalu besar.';
      else if (s === 415) msg = 'Format tidak didukung. JPG/PNG/WebP saja.';
      else if (s >= 500) msg = 'Server error. Coba lagi.';
      toast.error(msg);
    } finally { setUploading(null); }
  }

  async function deletePhoto(photo: Photo) {
    if (deletingId) return;
    setDeletingId(photo.id);
    try {
      await api.delete(`/cleaner/jobs/${bookingId}/photos/${photo.id}`);
      setPhotos((cur) => cur.filter((item) => item.id !== photo.id));
      toast.success('Foto berhasil dihapus');
      void load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal hapus foto');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <View className="rounded-2xl bg-white p-4">
      <Text className="font-bold mb-3 text-sm text-ink-900">Catatan Kondisi</Text>

      {/* Contextual hint */}
      {isCleaner && canManagePhotos && (
        <View className="mb-3 rounded-2xl border border-brand-100 bg-brand-50 p-3">
          <Text className="font-bold text-xs uppercase tracking-wider text-brand-700">Langkah berikutnya</Text>
          {activeStep === 'before' ? (
            <>
              <Text className="mt-1 text-sm font-bold text-ink-900">Catat kondisi awal area</Text>
              <Text className="mt-1 text-[11px] leading-4 text-ink-700">
                Ambil minimal 1 foto kondisi area sebelum dikerjakan. Setelah itu tombol hasil kerja akan terbuka.
              </Text>
            </>
          ) : activeStep === 'after' ? (
            <>
              <Text className="mt-1 text-sm font-bold text-ink-900">Kondisi awal sudah tersimpan</Text>
              <Text className="mt-1 text-[11px] leading-4 text-ink-700">
                Sekarang lanjut ambil foto hasil kerja. Setelah itu job sudah siap ditandai selesai.
              </Text>
            </>
          ) : (
            <View className="mt-1 flex-row items-center gap-2">
              <CheckCircle2 color="#047857" size={16} strokeWidth={2.4} />
              <Text className="flex-1 text-[11px] leading-4 text-emerald-800">
                Kondisi awal dan hasil kerja sudah lengkap.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Kondisi Awal section ── */}
      <View className="mb-4">
        <Text className="font-semibold mb-2 text-xs uppercase tracking-wider text-ink-500">
          Kondisi Awal {beforePhotos.length > 0 ? `(${beforePhotos.length})` : ''}
        </Text>

        {needBefore && (
          <View className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <Text className="font-bold text-[11px] text-amber-900">Kondisi awal belum dicatat</Text>
            <Text className="font-sans mt-0.5 text-[10px] leading-4 text-amber-800">
              Ambil foto kondisi area sebelum dibersihkan. Tombol hasil kerja terbuka setelah kondisi awal tersimpan.
            </Text>
          </View>
        )}

        {beforePhotos.length > 0 && (
          <PhotoGrid
            photos={beforePhotos}
            onPress={setPreview}
            canDelete={canManagePhotos}
            deletingId={deletingId}
            onDelete={deletePhoto}
          />
        )}

        {canManagePhotos && !beforeLocked && (
          <Pressable
            onPress={() => pickAndUpload('before')}
            disabled={uploading === 'before'}
            className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-2.5"
          >
            {uploading === 'before'
              ? <ActivityIndicator size="small" color="#1D4ED8" />
              : <Camera size={15} color="#1D4ED8" strokeWidth={2.2} />}
            <Text className="font-semibold text-sm text-brand-700">
              {beforePhotos.length === 0 ? 'Foto Kondisi Awal' : 'Tambah Foto'}
            </Text>
          </Pressable>
        )}

        {/* Damage toggle — only for cleaner during in_progress */}
        {canManagePhotos && (
          <View className="mt-3 border-t border-ink-100 pt-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="font-semibold text-sm text-ink-900">Ada kerusakan sebelumnya</Text>
                <Text className="font-sans text-[11px] leading-4 text-ink-500 mt-0.5">
                  Dokumentasikan kondisi rusak yang sudah ada sebelum kamu mulai kerja
                </Text>
              </View>
              <Switch
                value={showDamageSection}
                onValueChange={(v) => setShowDamageSection(v)}
                trackColor={{ false: '#E2E8F0', true: '#BFDBFE' }}
                thumbColor={showDamageSection ? '#1D4ED8' : '#94A3B8'}
              />
            </View>

            {showDamageSection && (
              <View className="mt-3">
                <View className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 mb-2">
                  <Text className="font-medium text-[11px] leading-4 text-amber-800">
                    💡 Foto area rusak bersamaan dengan foto kondisi awal — ini melindungi kamu dari klaim palsu customer.
                  </Text>
                </View>
                <TextInput
                  value={damageReason}
                  onChangeText={setDamageReason}
                  multiline
                  textAlignVertical="top"
                  placeholder="Jelaskan kerusakannya... (min 10 karakter)"
                  placeholderTextColor="#94A3B8"
                  className="font-sans rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm text-ink-900 mb-2"
                  style={{ minHeight: 72 }}
                />
                {damagePhotos.length > 0 && (
                  <View className="mb-2">
                    <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-ink-500">
                      Foto Kerusakan ({damagePhotos.length})
                    </Text>
                    <PhotoGrid
                      photos={damagePhotos}
                      onPress={setPreview}
                      canDelete={canManagePhotos}
                      deletingId={deletingId}
                      onDelete={deletePhoto}
                    />
                  </View>
                )}
                {!damageLocked && (
                  <Pressable
                    onPress={() => pickAndUpload('damage')}
                    disabled={uploading === 'damage'}
                    className="flex-row items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-2.5"
                  >
                    {uploading === 'damage'
                      ? <ActivityIndicator size="small" color="#B45309" />
                      : <Camera size={15} color="#B45309" strokeWidth={2.2} />}
                    <Text className="font-semibold text-sm text-amber-700">
                      {damagePhotos.length === 0 ? 'Foto Kerusakan' : 'Tambah Foto Kerusakan'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {/* Read-only: damage photos for customer/completed */}
        {!canManagePhotos && damagePhotos.length > 0 && (
          <View className="mt-3 border-t border-ink-100 pt-3">
            <Text className="font-semibold mb-1 text-[11px] uppercase tracking-wider text-amber-700">
              Rusak Sebelumnya ({damagePhotos.length})
            </Text>
            <PhotoGrid
              photos={damagePhotos}
              onPress={setPreview}
              canDelete={false}
              deletingId={null}
              onDelete={() => {}}
            />
          </View>
        )}
      </View>

      {/* ── Hasil Kerja section ── */}
      <View className="border-t border-ink-100 pt-4">
        <Text className="font-semibold mb-2 text-xs uppercase tracking-wider text-ink-500">
          Hasil Kerja {afterPhotos.length > 0 ? `(${afterPhotos.length})` : ''}
        </Text>

        {needAfter && (
          <View className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
            <Text className="font-bold text-[11px] text-emerald-900">Hasil kerja belum dicatat</Text>
            <Text className="font-sans mt-0.5 text-[10px] leading-4 text-emerald-800">
              Ambil foto hasil akhir pekerjaan. Wajib sebelum tandai job selesai.
            </Text>
          </View>
        )}

        {afterPhotos.length > 0 && (
          <PhotoGrid
            photos={afterPhotos}
            onPress={setPreview}
            canDelete={canManagePhotos}
            deletingId={deletingId}
            onDelete={deletePhoto}
          />
        )}

        {canManagePhotos && (
          <Pressable
            onPress={() => pickAndUpload('after')}
            disabled={uploading === 'after' || afterLocked}
            className={`mt-2 flex-row items-center justify-center gap-2 rounded-xl border py-2.5 ${afterLocked && beforePhotosCount === 0 ? 'border-ink-200 bg-ink-100' : 'border-emerald-300 bg-emerald-50'}`}
          >
            {uploading === 'after'
              ? <ActivityIndicator size="small" color="#047857" />
              : afterLocked && beforePhotosCount === 0
                ? <Lock size={14} color="#94A3B8" />
                : <Camera size={15} color="#047857" strokeWidth={2.2} />}
            <Text className={`font-semibold text-sm ${afterLocked && beforePhotosCount === 0 ? 'text-ink-400' : 'text-emerald-700'}`}>
              {afterPhotos.length === 0 ? 'Foto Hasil Kerja' : 'Tambah Foto'}
            </Text>
          </Pressable>
        )}

        {canManagePhotos && afterLocked && beforePhotosCount === 0 && (
          <Text className="font-sans mt-1 text-center text-[10px] text-ink-400">
            Upload foto kondisi awal dulu
          </Text>
        )}
      </View>

      {photos.length === 0 && !canManagePhotos && !loading && (
        <Text className="font-sans text-center text-xs text-ink-500">Belum ada foto.</Text>
      )}

      {preview && <PhotoPreviewModal url={preview} onClose={() => setPreview(null)} />}
    </View>
  );
}

function PhotoGrid({
  photos,
  onPress,
  canDelete,
  deletingId,
  onDelete,
}: {
  photos: Photo[];
  onPress: (url: string) => void;
  canDelete?: boolean;
  deletingId?: string | null;
  onDelete?: (photo: Photo) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} removeClippedSubviews={false}>
      <View className="flex-row gap-2 pb-1">
        {photos.map((p) => (
          <View key={p.id} style={{ width: 100, height: 100 }}>
            <Pressable onPress={() => onPress(p.url)}>
              <Image source={{ uri: p.url }} style={{ width: 100, height: 100, borderRadius: 8 }} contentFit="cover" />
            </Pressable>
            {canDelete && onDelete && (
              <Pressable
                onPress={() => onDelete(p)}
                disabled={deletingId === p.id}
                className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/65"
              >
                {deletingId === p.id ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Trash2 color="white" size={14} strokeWidth={2.4} />
                )}
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

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

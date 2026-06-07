import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, Bell, Briefcase, Calendar, ChevronRight, ClipboardCheck, FileText, MapPin, Power, RefreshCw, Settings, Wallet } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { formatScheduleWithTz } from '../../src/lib/datetime';
import { CleanerKycGate } from '../../src/components/CleanerKycGate';
import { formatRupiah } from '../../src/data/catalog';
import { calculateCleanerEarning, calculateCleanerShare } from '../../src/stores/cleanerWallet';
import { useCleanerStore } from '../../src/stores/cleaner';
import { useNotifications } from '../../src/stores/notifications';
import { toast } from '../../src/stores/ui';

type AvailableJob = {
  id: string;
  pricingMode: string;
  addressLine: string;
  scheduledAt: string;
  cleanerPayout: number | null;
  serviceName: string | null;
};

type ActiveJob = {
  id: string;
  status: string;
  serviceName: string | null;
  scheduledAt: string;
  cleanerPayout?: number | null;
};

export default function Jobs() {
  return (
    <CleanerKycGate>
      <JobsScreen />
    </CleanerKycGate>
  );
}

function JobsScreen() {
  const router = useRouter();

  const [available, setAvailable] = useState<AvailableJob[]>([]);
  const [active, setActive] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const cleanerAreas = useCleanerStore((s) => s.serviceAreas);
  const noAreaPicked = cleanerAreas.length === 0;
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const bringsTools = useCleanerStore((s) => s.bringsTools);

  // Sync initial online state dari server
  useEffect(() => {
    api.get('/cleaner/profile').then((r) => {
      const d = r.data?.data ?? r.data;
      setOnline(!!d?.isAvailable);
    }).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [a, ac] = await Promise.all([
        api.get('/cleaner/jobs/available'),
        api.get('/cleaner/jobs/active'),
      ]);
      setAvailable(((a.data?.data ?? []) as any[]).map((j: any) => ({ ...j, cleanerPayout: j.cleanerPayout ? Number(j.cleanerPayout) : null })));
      setActive(((ac.data?.data ?? []) as any[]).map((j: any) => ({ ...j })));
    } catch {
      // silent
    } finally { setLoading(false); }
  }

  useFocusEffect(useCallback(() => { void load(); }, []));

  async function toggleOnline() {
    const next = !online;
    if (next && noAreaPicked) {
      toast.warning('Pilih kota / area kerja kamu dulu sebelum Online.');
      router.push('/cleaner/areas');
      return;
    }
    try {
      await api.patch('/cleaner/profile', { isAvailable: next });
      setOnline(next);
      toast.success(next ? 'Status: Online — siap terima job' : 'Status: Offline');
      try {
        const { Track } = await import('../../src/lib/analytics');
        if (next) Track.cleanerOnline(); else Track.cleanerOffline();
      } catch {}
    } catch (e: any) {
      const code = e?.response?.data?.error?.code ?? e?.response?.data?.code;
      if (code === 'NEED_PROFILE_PHOTO') {
        setShowPhotoModal(true);
        return;
      }
      toast.error(e?.response?.data?.error?.message ?? 'Gagal ubah status');
    }
  }

  async function uploadProfilePhoto() {
    try {
      const { launchImageLibraryAsync, MediaTypeOptions } = await import('expo-image-picker');
      const r = await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, quality: 1, allowsEditing: true, aspect: [1, 1] });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      setUploadingPhoto(true);
      const { compressImage, formatBytes } = await import('../../src/lib/imageCompress');
      const c = await compressImage(asset.uri);
      if (c.oversize) {
        toast.error(`Foto tetap > 5MB setelah kompresi (${formatBytes(c.size)}). Pilih foto lain.`);
        return;
      }
      const contentType = 'image/jpeg';
      const presign = await api.post('/cleaner/profile/photo-upload-url', { contentType });
      const { uploadUrl, publicUrl } = presign.data?.data ?? presign.data;
      const blob = await (await fetch(c.uri)).blob();
      const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
      if (!up.ok) throw new Error('Upload ke storage gagal');
      await api.patch('/cleaner/profile', { photoUrl: publicUrl });
      toast.success(`Foto tersimpan (${formatBytes(c.size)})`);
      setShowPhotoModal(false);
      await api.patch('/cleaner/profile', { isAvailable: true });
      setOnline(true);
      toast.success('Status: Online — siap terima job');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Gagal upload foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function accept(id: string) {
    if (!online) {
      toast.warning('Aktifkan mode Online dulu sebelum ambil job.');
      return;
    }
    try {
      await api.post(`/cleaner/jobs/${id}/accept`);
      toast.success('Job berhasil diambil!');
      try {
        const { Track } = await import('../../src/lib/analytics');
        Track.jobAccepted(id);
      } catch {}
      void load();
      router.push({ pathname: '/booking/[id]', params: { id } });
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal accept');
      void load();
    }
  }

  return (
    <View className="flex-1 bg-ink-50">
      <SafeAreaView edges={['top']} className="bg-white">
        <View className="border-b border-ink-100 px-4 pb-3 pt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-bold text-xl text-ink-900">Job Board</Text>
              <Text className="font-sans mt-0.5 text-xs text-ink-500">{available.length} job tersedia</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <NotifBell />
              <Pressable onPress={() => router.push('/cleaner/areas')} className="flex-row items-center gap-1 rounded-full bg-brand-50 px-3 py-2">
                <Settings color="#1D4ED8" size={14} strokeWidth={2.4} />
                <Text className="font-semibold text-xs text-brand-700">Area</Text>
              </Pressable>
            </View>
          </View>

          {noAreaPicked && (
            <Pressable
              onPress={() => router.push('/cleaner/areas')}
              className="mt-3 flex-row items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3"
            >
              <Text className="text-base">📍</Text>
              <View className="flex-1">
                <Text className="font-extrabold text-xs text-amber-900">Pilih kota / area kerjamu</Text>
                <Text className="font-medium mt-0.5 text-[10px] text-amber-800">
                  Wajib pilih dulu sebelum bisa Online & terima job. Tap di sini.
                </Text>
              </View>
              <Text className="font-bold text-amber-900">›</Text>
            </Pressable>
          )}

          <Pressable
            onPress={toggleOnline}
            disabled={noAreaPicked}
            className={`mt-3 flex-row items-center gap-2 rounded-xl border p-2.5 ${noAreaPicked ? 'border-ink-100 bg-ink-50 opacity-60' : online ? 'border-success bg-emerald-50' : 'border-ink-200 bg-white'}`}
          >
            <View className={`h-9 w-9 items-center justify-center rounded-xl ${online ? 'bg-success' : 'bg-ink-200'}`}>
              <Power color="white" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-xs text-ink-900">{online ? 'Online' : 'Offline'}</Text>
              <Text className="font-medium text-[10px] text-ink-500">
                {online ? 'Siap terima job realtime' : 'Tidak akan terima notif job baru'}
              </Text>
            </View>
            <View className={`h-6 w-11 rounded-full p-0.5 ${online ? 'bg-success' : 'bg-ink-300'}`}>
              <View className={`h-5 w-5 rounded-full bg-white ${online ? 'self-end' : 'self-start'}`} />
            </View>
          </Pressable>

        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        {active.length > 0 && (
          <View className="mb-3 rounded-2xl p-3" style={{ backgroundColor: '#D1FAE5' }}>
            <Text className="font-semibold text-[11px] uppercase tracking-wider" style={{ color: '#047857' }}>
              🔥 Job Aktif ({active.length})
            </Text>
            <View className="mt-2 gap-2">
              {active.map((j) => (
                <Pressable
                  key={j.id}
                  onPress={() => router.push({ pathname: '/booking/[id]', params: { id: j.id } })}
                  className="flex-row items-center gap-2 rounded-xl bg-white p-3"
                >
                  <View className="flex-1">
                    <Text className="font-semibold text-sm text-ink-900">{j.serviceName ?? 'Layanan'}</Text>
                    <Text className="font-medium text-[11px]" style={{ color: '#047857' }}>
                      {j.status === 'matched' ? 'Dijadwalkan' :
                       j.status === 'on_the_way' || j.status === 'cleaner_otw' ? 'Otw lokasi' :
                       j.status === 'in_progress' || j.status === 'started' ? 'Sedang dikerjakan' : j.status}
                    </Text>
                    <Text className="font-sans mt-0.5 text-[10px] text-ink-500">
                      {formatScheduleWithTz(j.scheduledAt, (j as any).addressLine)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <ChevronRight color="#94A3B8" size={14} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {loading && available.length === 0 ? (
          <View className="items-center justify-center py-20"><ActivityIndicator color="#1D4ED8" /></View>
        ) : available.length === 0 ? (
          <View className="items-center justify-center py-16">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
              <Briefcase color="#1D4ED8" size={36} strokeWidth={2} />
            </View>
            <Text className="font-bold mt-4 text-lg text-ink-900">Belum ada job</Text>
            <Text className="font-sans mt-1 text-center text-sm text-ink-500">
              {online ? 'Cek kembali nanti — job baru akan muncul otomatis.' : 'Aktifkan Online dulu untuk terima job.'}
            </Text>
            <Pressable onPress={() => void load()} className="mt-4 flex-row items-center gap-1 rounded-lg bg-brand-50 px-4 py-2">
              <RefreshCw color="#1D4ED8" size={14} />
              <Text className="font-semibold text-xs text-brand-700">Refresh</Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-3">
            {available.map((b) => {
              // Cleaner cuma lihat bagiannya — totalAmount tidak di-expose dari backend.
              const earning = b.cleanerPayout ?? 0;
              return (
                <View key={b.id} className="rounded-2xl bg-white p-3">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <Text className="font-semibold text-sm text-ink-900">{b.serviceName ?? 'Layanan'}</Text>
                      <Text className="font-medium text-[11px] text-brand-600">
                        {b.pricingMode === 'package' ? 'Paket Tetap' : b.pricingMode === 'hourly' ? 'Per Jam' : b.pricingMode}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="font-medium text-[10px] uppercase tracking-wider text-ink-400">Bagianmu</Text>
                      <Text className="font-bold text-sm text-emerald-700">{formatRupiah(earning)}</Text>
                    </View>
                  </View>
                  <View className="mt-2 flex-row items-center gap-1">
                    <Calendar color="#94A3B8" size={11} />
                    <Text className="font-sans text-[11px] text-ink-500">
                      {formatScheduleWithTz(b.scheduledAt, (b as any).addressLine)}
                    </Text>
                  </View>
                  <View className="mt-0.5 flex-row items-start gap-1">
                    <MapPin color="#94A3B8" size={11} style={{ marginTop: 2 }} />
                    <Text className="font-sans flex-1 text-[11px] text-ink-500" numberOfLines={2}>{b.addressLine}</Text>
                  </View>

                  <View className="mt-3 flex-row gap-2 border-t border-ink-100 pt-3">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1">
                        <Wallet color="#047857" size={12} />
                        <Text className="font-sans text-[10px] text-ink-500">Kamu dapat</Text>
                      </View>
                      <View className="flex-row items-baseline gap-1">
                        <Text className="font-bold text-base text-success">{formatRupiah(earning)}</Text>
                        {bringsTools && <Text className="font-medium text-[10px] text-ink-500">+ pakai alat</Text>}
                      </View>
                    </View>
                    <Pressable
                      onPress={() => accept(b.id)}
                      className="flex-row items-center gap-1 rounded-xl bg-brand-600 px-4 py-2"
                    >
                      <Text className="font-bold text-xs text-white">Ambil Job</Text>
                      <ChevronRight color="white" size={14} strokeWidth={2.4} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={showPhotoModal} transparent animationType="fade" onRequestClose={() => setShowPhotoModal(false)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-sm rounded-2xl bg-white p-5">
            <View className="items-center">
              <Text className="text-4xl">📸</Text>
              <Text className="font-extrabold mt-2 text-base text-ink-900 text-center">Upload Foto Profil Dulu</Text>
              <Text className="font-medium mt-1.5 text-center text-[12px] text-ink-600">
                Customer perlu lihat wajah cleaner-nya buat trust. Pakai foto asli (selfie wajah jelas, tanpa filter).
              </Text>
            </View>
            <View className="mt-5 flex-row gap-2">
              <Pressable
                onPress={() => setShowPhotoModal(false)}
                className="flex-1 items-center rounded-xl border border-ink-300 py-3"
              >
                <Text className="font-semibold text-sm text-ink-700">Nanti</Text>
              </Pressable>
              <Pressable
                onPress={uploadProfilePhoto}
                disabled={uploadingPhoto}
                className="flex-1 items-center rounded-xl bg-brand-600 py-3"
              >
                <Text className="font-bold text-sm text-white">{uploadingPhoto ? 'Mengupload...' : 'Upload Foto'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}


function NotifBell() {
  const router = useRouter();
  const { unreadCount, fetch } = useNotifications();
  useEffect(() => { void fetch(); }, []);
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      className="relative h-9 w-9 items-center justify-center rounded-full bg-brand-50"
    >
      <Bell color="#1D4ED8" size={16} strokeWidth={2.4} />
      {unreadCount > 0 && (
        <View className="absolute -right-0.5 -top-0.5 h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1">
          <Text className="font-bold text-[9px] text-white">{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

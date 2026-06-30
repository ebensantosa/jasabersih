import { Image } from 'expo-image';
import { Camera, Minus, Plus, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import { uploadWithSignedUrl } from '../lib/signedUpload';
import { useApiAddons, useApiServices, useAppContent } from '../stores/appContent';
import { formatRupiah } from '../data/catalog';
import { toast } from '../stores/ui';

type Item = { id: string; name: string; price: number; isPackage?: boolean };

const EXCLUDED_SERVICE_CODES = new Set([
  'kamar_km_dalam', 'ruko', 'kantor', 'apartemen', 'full_house',
  'paket_bundle', 'subscription', 'general_cleaning', 'deep_cleaning',
  'kos', 'konsultasi', 'pasca_renovasi',
]);

function isSpecialUnit(desc: string | null | undefined) {
  const d = (desc ?? '').toLowerCase();
  return d.includes('per m²') || d.includes('/m²') || d.includes('per panel') || d.includes('per lubang') || d.includes('per daun');
}

function QtyRow({ item, qty, onChange }: { item: Item; qty: number; onChange: (n: number) => void }) {
  const active = qty > 0;
  return (
    <View className={`flex-row items-center gap-3 rounded-xl border p-3 ${active ? 'border-brand-400 bg-brand-50' : 'border-ink-200 bg-white'}`}>
      <View className="flex-1">
        <Text className={`font-semibold text-[13px] ${active ? 'text-brand-900' : 'text-ink-900'}`}>{item.name}</Text>
        <Text className={`font-medium mt-0.5 text-[11px] ${active ? 'text-brand-600' : 'text-ink-500'}`}>
          {formatRupiah(item.price)} / item{item.isPackage ? ' · Layanan utama' : ''}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => onChange(Math.max(0, qty - 1))}
          disabled={qty === 0}
          style={{
            width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
            backgroundColor: qty === 0 ? '#F1F5F9' : '#EFF6FF',
          }}
        >
          <Minus color={qty === 0 ? '#94A3B8' : '#1D4ED8'} size={14} strokeWidth={2.4} />
        </Pressable>
        <Text style={{ width: 24, textAlign: 'center', fontWeight: '700', fontSize: 14, color: active ? '#1D4ED8' : '#64748B' }}>
          {qty}
        </Text>
        <Pressable
          onPress={() => onChange(qty + 1)}
          style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF' }}
        >
          <Plus color="#1D4ED8" size={14} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

export function UpchargeFormModal({
  bookingId,
  onClose,
  onSubmitted,
}: {
  bookingId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const apiAddons = useApiAddons();
  const apiServices = useApiServices();
  const allPackages = useAppContent((s) => s.content.packages);

  const addons = useMemo<Item[]>(
    () =>
      apiAddons
        .filter((a) => !isSpecialUnit(a.description))
        .map((a) => ({ id: a.id, name: a.name, price: Number(a.price) })),
    [apiAddons],
  );

  const services = useMemo<Item[]>(
    () =>
      apiServices
        .filter((s: any) => !EXCLUDED_SERVICE_CODES.has(String(s.code ?? '')))
        .flatMap((s: any) => {
          const pkg = allPackages.find((p: any) => p.serviceId === s.id);
          if (!pkg || Number(pkg.price ?? 0) === 0) return [];
          if (pkg?.scope && typeof pkg.scope === 'object' && (pkg.scope as any).perMeter) return [];
          return [{ id: pkg.id, name: s.name, price: Number(pkg.price), isPackage: true }];
        }),
    [apiServices, allPackages],
  );

  // qty per item id — 0 means not selected
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cleanerShare, setCleanerShare] = useState<{ share: number; pct: number } | null>(null);

  const allItems = useMemo(() => [...services, ...addons], [services, addons]);

  const total = allItems.reduce((s, a) => s + (qtys[a.id] ?? 0) * a.price, 0);
  const totalQty = Object.values(qtys).reduce((s, q) => s + q, 0);

  function setQty(id: string, n: number) {
    setQtys((prev) => ({ ...prev, [id]: Math.max(0, n) }));
  }

  // Fetch cleaner's commission split from server when total changes
  useEffect(() => {
    if (total === 0) { setCleanerShare(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.post(`/cleaner/jobs/${bookingId}/upcharge-preview`, { amount: total });
        const d = r.data?.data ?? r.data;
        setCleanerShare({ share: Number(d.cleanerShare ?? 0), pct: Number(d.pct ?? 40) });
      } catch { setCleanerShare(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [total, bookingId]);

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
    if (totalQty === 0) { toast.error('Pilih minimal 1 layanan.'); return; }
    setSubmitting(true);
    const addonQtys = addons
      .filter((a) => (qtys[a.id] ?? 0) > 0)
      .map((a) => ({ id: a.id, qty: qtys[a.id]! }));
    const packageQtys = services
      .filter((s) => (qtys[s.id] ?? 0) > 0)
      .map((s) => ({ id: s.id, qty: qtys[s.id]! }));
    try {
      await api.post(`/cleaner/jobs/${bookingId}/upcharge`, {
        addonQtys: addonQtys.length > 0 ? addonQtys : undefined,
        packageQtys: packageQtys.length > 0 ? packageQtys : undefined,
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
            Pilih jumlah tiap layanan. Customer setujui atau tolak sebelum kamu lanjut.
          </Text>

          <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
            {services.length > 0 && (
              <>
                <Text className="font-bold mb-2 text-[11px] uppercase tracking-wider text-ink-500">Layanan Utama</Text>
                <View className="gap-2 mb-4">
                  {services.map((item) => (
                    <QtyRow key={item.id} item={item} qty={qtys[item.id] ?? 0} onChange={(n) => setQty(item.id, n)} />
                  ))}
                </View>
              </>
            )}

            {addons.length > 0 && (
              <>
                <Text className="font-bold mb-2 text-[11px] uppercase tracking-wider text-ink-500">Layanan Tambahan</Text>
                <View className="gap-2">
                  {addons.map((item) => (
                    <QtyRow key={item.id} item={item} qty={qtys[item.id] ?? 0} onChange={(n) => setQty(item.id, n)} />
                  ))}
                </View>
              </>
            )}

            {services.length === 0 && addons.length === 0 && (
              <View className="items-center py-6">
                <Text className="font-medium text-[12px] text-ink-400">Belum ada layanan tersedia.</Text>
              </View>
            )}

            {total > 0 && (
              <View className="mt-4 rounded-xl bg-ink-50 border border-ink-200 p-3 gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold text-[11px] text-ink-600">Total dibayar customer</Text>
                  <Text className="font-extrabold text-base text-ink-900">+{formatRupiah(total)}</Text>
                </View>
                {cleanerShare != null ? (
                  <View className="flex-row items-center justify-between">
                    <Text className="font-medium text-[11px] text-emerald-700">Kamu terima ({cleanerShare.pct}%)</Text>
                    <Text className="font-bold text-sm text-emerald-700">+{formatRupiah(cleanerShare.share)}</Text>
                  </View>
                ) : (
                  <ActivityIndicator size="small" color="#059669" style={{ alignSelf: 'flex-start', marginTop: 2 }} />
                )}
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
            <View className="mt-1 flex-row items-center gap-2 mb-2">
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
            disabled={submitting || totalQty === 0}
            className={`mt-4 items-center rounded-2xl py-3.5 ${submitting || totalQty === 0 ? 'bg-brand-300' : 'bg-brand-600'}`}
          >
            {submitting
              ? <ActivityIndicator color="white" />
              : <Text className="font-bold text-sm text-white">
                  {totalQty === 0 ? 'Pilih Layanan Dulu' : `Kirim Permintaan · +${formatRupiah(total)}`}
                </Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

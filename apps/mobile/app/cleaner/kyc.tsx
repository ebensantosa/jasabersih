import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, Clock, AlertCircle, X, BadgeCheck, Upload } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { safeBack } from '../../src/lib/safeBack';

type DocType = 'ktp' | 'bank_book';

const DOC_INFO: Record<DocType, { label: string; hint: string }> = {
  ktp: { label: 'Foto KTP', hint: 'Foto KTP jelas, semua sisi terlihat, tidak buram' },
  bank_book: { label: 'Buku Tabungan', hint: 'Halaman pertama buku tabungan (nama + no rekening jelas)' },
};

type DocItem = {
  id: string;
  docType: DocType;
  status: 'pending' | 'approved' | 'rejected' | null;
  uploadedAt: string;
  rejectedReason: string | null;
  previewUrl?: string | null;
};

type StatusResponse = {
  kycStatus: string;
  rejectionReason: string | null;
  documents: DocItem[];
  requiredDocTypes: readonly DocType[];
};

function CleanerKycScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocType | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/cleaner/kyc/status');
      setStatus(res.data?.data ?? res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal load status KYC');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function pickAndUpload(docType: DocType) {
    // Ask permission
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.warning('Butuh akses galeri untuk upload dokumen.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    // Validate format upfront
    const mime = asset.mimeType ?? 'image/jpeg';
    if (!/^image\/(jpe?g|png|webp)$/i.test(mime)) {
      toast.error('Format tidak didukung. Pakai JPG/PNG/WebP saja.');
      return;
    }

    setUploading(docType);
    try {
      // 1. Compress + resize (target max 1600px, quality 0.7) - irit bandwidth & R2 storage
      const { compressImage, formatBytes } = await import('../../src/lib/imageCompress');
      const compressed = await compressImage(asset.uri);
      if (compressed.oversize) {
        throw new Error(`File masih terlalu besar (${formatBytes(compressed.size)} > 5MB) walau sudah dikompres. Coba foto ulang atau crop dulu.`);
      }

      // 2. Get signed URL (force JPEG biar konsisten)
      const urlRes = await api.post('/cleaner/kyc/upload-url', {
        docType,
        contentType: 'image/jpeg',
      });
      const { uploadWithSignedUrl } = await import('../../src/lib/signedUpload');
      const { key } = await uploadWithSignedUrl(
        async () => (urlRes.data?.data ?? urlRes.data) as { uploadUrl: string; key: string },
        compressed.uri,
        'image/jpeg',
      );

      // 4. Register doc
      await api.post('/cleaner/kyc/documents', { docType, storagePath: key });
      toast.success(`${DOC_INFO[docType].label} terupload (${formatBytes(compressed.size)})`);
      await load();
    } catch (e: any) {
      const apiMsg = e?.response?.data?.error?.message;
      const status = e?.response?.status;
      let msg = apiMsg ?? e?.message ?? 'Upload gagal - coba lagi';
      if (status === 413) msg = 'File terlalu besar. Coba kompres atau pilih foto lain.';
      else if (status === 415) msg = 'Format tidak didukung. Pakai JPG/PNG/WebP saja.';
      else if (status >= 500) msg = 'Server error. Coba lagi dalam beberapa saat.';
      else if (e?.message?.includes('Network')) msg = 'Koneksi internet bermasalah. Cek WiFi/data.';
      toast.error(msg);
    } finally {
      setUploading(null);
    }
  }

  const docByType = (t: DocType): DocItem | undefined => status?.documents.find((d) => d.docType === t);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <View className="flex-1">
            <Text className="font-bold text-base text-ink-900">Verifikasi KYC</Text>
            <Text className="font-sans text-[11px] text-ink-500">Wajib upload 3 dokumen sebelum aktif</Text>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#1D4ED8" />
          </View>
        ) : status?.kycStatus === 'under_review' ? (
          <ReviewPendingView onRefresh={load} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <StatusBanner status={status?.kycStatus ?? 'pending'} reason={status?.rejectionReason ?? null} />

            {(['ktp', 'bank_book'] as DocType[]).map((t) => {
              const doc = docByType(t);
              const info = DOC_INFO[t];
              const isUploading = uploading === t;
              return (
                <View key={t} className="rounded-2xl bg-white p-4">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="font-bold text-sm text-ink-900">{info.label}</Text>
                      <Text className="font-sans mt-1 text-[11px] text-ink-500">{info.hint}</Text>
                    </View>
                    <DocStatusBadge status={doc?.status ?? null} />
                  </View>

                  {doc?.previewUrl && (
                    <View className="mt-3">
                      <Image
                        source={{ uri: doc.previewUrl }}
                        style={{ width: '100%', height: 180, borderRadius: 12, backgroundColor: '#F1F5F9' }}
                        contentFit="cover"
                      />
                    </View>
                  )}

                  {doc?.status === 'rejected' && doc.rejectedReason && (
                    <View className="mt-3 flex-row gap-2 rounded-md border border-red-200 bg-red-50 p-2">
                      <AlertCircle size={14} color="#B91C1C" />
                      <Text className="font-sans flex-1 text-[11px] text-red-800">{doc.rejectedReason}</Text>
                    </View>
                  )}

                  {(() => {
                    const overallReview = status?.kycStatus === 'under_review';
                    const isApproved = doc?.status === 'approved';
                    const locked = isApproved || overallReview;
                    return (
                      <Pressable
                        onPress={() => pickAndUpload(t)}
                        disabled={isUploading || locked}
                        className={`mt-3 flex-row items-center justify-center gap-2 rounded-xl py-3 ${
                          isApproved ? 'bg-ink-100' :
                          overallReview ? 'bg-ink-100' :
                          doc?.status === 'pending' ? 'bg-brand-50 border border-brand-200' :
                          'bg-brand-600'
                        } ${isUploading ? 'opacity-60' : ''}`}
                      >
                        {isUploading ? (
                          <ActivityIndicator color={locked ? '#0F172A' : 'white'} size="small" />
                        ) : isApproved ? (
                          <Check size={16} color="#047857" />
                        ) : overallReview ? (
                          <Clock size={16} color="#475569" />
                        ) : doc ? (
                          <Upload size={16} color="#1D4ED8" />
                        ) : (
                          <Camera size={16} color="white" />
                        )}
                        <Text className={`font-semibold text-sm ${
                          isApproved ? 'text-ink-700' :
                          overallReview ? 'text-ink-500' :
                          doc?.status === 'pending' ? 'text-brand-700' :
                          'text-white'
                        }`}>
                          {isUploading ? 'Uploading…' :
                           isApproved ? 'Sudah Disetujui' :
                           overallReview ? 'Menunggu Review Admin' :
                           doc ? 'Ganti Foto' : 'Upload Foto'}
                        </Text>
                      </Pressable>
                    );
                  })()}
                </View>
              );
            })}

            <View className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="font-bold text-xs text-amber-900">⚠ Penting</Text>
              <Text className="font-sans mt-1 text-[11px] text-amber-900">
                • Pastikan foto jelas, tidak buram, semua tulisan terbaca{'\n'}
                • Foto KTP tidak boleh di-edit / cropped sebagian{'\n'}
                • Selfie + KTP: wajah & KTP harus terlihat jelas dalam satu frame{'\n'}
                • Buku tabungan: nama harus sesuai KTP{'\n'}
                • Review admin biasanya 1×24 jam kerja
              </Text>
            </View>

            {/* Submit button - enabled hanya kalau 3 doc terupload + status masih pending */}
            {(() => {
              const uploadedCount = (['ktp', 'bank_book'] as DocType[])
                .filter((t) => docByType(t)).length;
              const canSubmit = uploadedCount === 2 && status?.kycStatus === 'pending';
              const alreadyReview = status?.kycStatus === 'under_review';
              if (alreadyReview) return null;
              return (
                <Pressable
                  onPress={async () => {
                    if (!canSubmit) {
                      toast.warning(`Lengkapi semua dokumen dulu (${uploadedCount}/3 ter-upload)`);
                      return;
                    }
                    try {
                      await api.post('/cleaner/kyc/submit');
                      toast.success('KYC berhasil disubmit. Tunggu review admin.');
                      await load();
                    } catch (e: any) {
                      toast.error(e?.response?.data?.error?.message ?? 'Gagal submit');
                    }
                  }}
                  disabled={!canSubmit}
                  className={`mt-1 flex-row items-center justify-center gap-2 rounded-2xl py-4 ${canSubmit ? 'bg-brand-600' : 'bg-ink-200'}`}
                  style={canSubmit ? { elevation: 4 } : undefined}
                >
                  <Check color="white" size={18} strokeWidth={2.4} />
                  <Text className="font-bold text-sm text-white">
                    {canSubmit ? 'Submit untuk Review Admin' : `Submit (${uploadedCount}/3 dokumen)`}
                  </Text>
                </Pressable>
              );
            })()}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function StatusBanner({ status, reason }: { status: string; reason: string | null }) {
  const variants: Record<string, { icon: any; color: string; bg: string; border: string; label: string; sub: string }> = {
    pending: { icon: Clock, color: '#B45309', bg: '#FEF3C7', border: '#FCD34D', label: 'Belum lengkap', sub: 'Upload semua 3 dokumen untuk submit ke review.' },
    under_review: { icon: Clock, color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD', label: 'Dalam review admin', sub: 'Tim kami akan verifikasi dalam 1×24 jam kerja.' },
    approved: { icon: BadgeCheck, color: '#047857', bg: '#D1FAE5', border: '#6EE7B7', label: 'Disetujui ✓', sub: 'KYC kamu sudah aktif. Selamat menerima order!' },
    rejected: { icon: X, color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5', label: 'Ditolak', sub: reason ?? 'Silakan upload ulang dengan foto yang lebih jelas.' },
  };
  const v = variants[status] ?? variants.pending!;
  const Icon = v.icon;
  return (
    <View style={{ borderColor: v.border }} className="flex-row gap-3 rounded-2xl border-2 p-4" >
      <View style={{ backgroundColor: v.bg }} className="h-10 w-10 items-center justify-center rounded-full">
        <Icon size={20} color={v.color} />
      </View>
      <View className="flex-1">
        <Text style={{ color: v.color }} className="font-bold text-sm">{v.label}</Text>
        <Text className="font-sans mt-0.5 text-[11px] text-ink-700">{v.sub}</Text>
      </View>
    </View>
  );
}

function DocStatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' | null }) {
  if (!status) return <View className="rounded-full bg-ink-100 px-2 py-0.5"><Text className="font-medium text-[10px] text-ink-600">belum upload</Text></View>;
  if (status === 'approved') return <View className="rounded-full bg-success/10 px-2 py-0.5"><Text className="font-medium text-[10px] text-success">disetujui</Text></View>;
  if (status === 'rejected') return <View className="rounded-full bg-red-100 px-2 py-0.5"><Text className="font-medium text-[10px] text-red-700">ditolak</Text></View>;
  return <View className="rounded-full bg-amber-100 px-2 py-0.5"><Text className="font-medium text-[10px] text-amber-800">menunggu review</Text></View>;
}


function ReviewPendingView({ onRefresh }: { onRefresh: () => void | Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 32, alignItems: 'center', flexGrow: 1 }}>
        <View style={{ height: 96, width: 96, borderRadius: 48, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
          <Clock color="#1D4ED8" size={42} strokeWidth={2.2} />
        </View>
        <Text style={{ fontFamily: 'Inter_800ExtraBold', fontSize: 22, color: '#0F172A', marginTop: 20, textAlign: 'center' }}>
          Sedang Dalam Review
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#475569', marginTop: 8, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 }}>
          Tim admin sedang verifikasi dokumen KYC kamu. Biasanya selesai dalam{' '}
          <Text style={{ fontFamily: 'Inter_700Bold', color: '#0F172A' }}>1×24 jam kerja</Text>.
          Notifikasi akan dikirim begitu hasilnya keluar.
        </Text>

        <View style={{ marginTop: 28, width: '100%', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#0F172A', marginBottom: 10 }}>Apa yang dicek admin?</Text>
          {[
            'Foto KTP jelas, tidak buram, semua tulisan terbaca',
            'Selfie + KTP: wajah & KTP terlihat jelas dalam satu frame',
            'Buku tabungan: nama sesuai KTP',
            'KTP masih aktif & usia 18+',
          ].map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <Text style={{ color: '#1D4ED8', fontSize: 12 }}>•</Text>
              <Text style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: '#475569', lineHeight: 18 }}>{line}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={onRefresh}
          style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#EFF6FF' }}
        >
          <Clock color="#1D4ED8" size={14} strokeWidth={2.4} />
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#1D4ED8' }}>Cek Status Lagi</Text>
        </Pressable>

        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#94A3B8', marginTop: 16, textAlign: 'center' }}>
          Ada kendala? Hubungi CS via WhatsApp dari halaman bantuan.
        </Text>
      </ScrollView>
    </View>
  );
}

export default withAuth(CleanerKycScreen);

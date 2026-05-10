import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BadgeCheck, Briefcase, ClipboardCheck, FileText, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../lib/api';

/**
 * Wrap cleaner-only screens. Block access sampai kyc_status='approved'.
 * Tampilkan landing dengan checklist + CTA ke /cleaner/kyc.
 */
export function CleanerKycGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/cleaner/profile');
        const p = res.data?.data ?? res.data;
        setKycStatus(p?.kycStatus ?? 'pending');
      } catch {
        setKycStatus('pending');
      }
    })();
  }, []);

  // Optimistic: kalau lagi loading, asumsi belum approved → langsung render gate.
  // Kalau API confirm approved, swap ke children. No flash spinner.
  if (kycStatus === 'approved') return <>{children}</>;

  const isPending = kycStatus === 'pending';
  const isReview = kycStatus === 'under_review';
  const isRejected = kycStatus === 'rejected';
  const theme = isRejected
    ? { gradient: ['#7F1D1D', '#DC2626'] as const, label: 'KYC Ditolak' }
    : isReview
      ? { gradient: ['#1E40AF', '#3B82F6'] as const, label: 'KYC Sedang Direview' }
      : { gradient: ['#92400E', '#F59E0B'] as const, label: 'KYC Belum Lengkap' };

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <LinearGradient colors={theme.gradient} style={{ paddingBottom: 36 }}>
        <SafeAreaView edges={['top']}>
          <View style={{ paddingHorizontal: 24, paddingTop: 24, alignItems: 'center' }}>
            <View style={{ height: 80, width: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <BadgeCheck color="white" size={40} strokeWidth={2.2} />
            </View>
            <Text style={{ fontFamily: 'Inter_800ExtraBold', fontSize: 22, color: 'white', marginTop: 16, textAlign: 'center' }}>{theme.label}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
              Akses cleaner terbuka setelah KYC kamu disetujui admin.
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 16, elevation: 2, marginTop: -16 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#0F172A' }}>Yang perlu kamu lengkapi</Text>
          <View style={{ marginTop: 12, gap: 10 }}>
            <Item icon={FileText} label="Foto KTP (jelas, tidak buram)" />
            <Item icon={ClipboardCheck} label="Selfie pegang KTP" />
            <Item icon={Wallet} label="Buku tabungan (untuk payout)" />
            <Item icon={Briefcase} label="Quiz dasar (10 soal)" />
          </View>
        </View>
        {isPending && (
          <Pressable onPress={() => router.push('/cleaner/kyc')} style={{ marginTop: 16, backgroundColor: '#1D4ED8', paddingVertical: 14, borderRadius: 16 }}>
            <Text style={{ color: 'white', textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 14 }}>Mulai Lengkapi KYC</Text>
          </Pressable>
        )}
        {isReview && (
          <View style={{ marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#EFF6FF' }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#1E40AF' }}>Tim admin sedang review dokumen kamu — biasanya 1×24 jam kerja. Notifikasi akan dikirim saat selesai.</Text>
          </View>
        )}
        {isRejected && (
          <Pressable onPress={() => router.push('/cleaner/kyc')} style={{ marginTop: 16, backgroundColor: '#DC2626', paddingVertical: 14, borderRadius: 16 }}>
            <Text style={{ color: 'white', textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 14 }}>Lihat Alasan & Upload Ulang</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Item({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ height: 32, width: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
        <Icon color="#475569" size={16} strokeWidth={2.2} />
      </View>
      <Text style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, color: '#0F172A' }}>{label}</Text>
    </View>
  );
}

/** HOC variant for default-export wrapping. */
export function withCleanerKyc<P extends object>(Component: React.ComponentType<P>) {
  return function GatedCleaner(props: P) {
    return (
      <CleanerKycGate>
        <Component {...props} />
      </CleanerKycGate>
    );
  };
}

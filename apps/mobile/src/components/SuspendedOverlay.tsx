import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Clock, Mail, MessageCircle, ShieldAlert, ShieldX, Trash2 } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConfig } from '../stores/appContent';
import { useAuthStore } from '../stores/auth';
import { useSuspendedStore } from '../stores/suspended';

export function SuspendedOverlay() {
  const router = useRouter();
  const kind = useSuspendedStore((s) => s.kind);
  const reason = useSuspendedStore((s) => s.reason);
  const until = useSuspendedStore((s) => s.until);
  const clear = useSuspendedStore((s) => s.clear);
  const logout = useAuthStore((s) => s.logout);
  const waNumber = useConfig('contact.whatsapp', '6281234567890');
  const csEmail = useConfig('contact.email', 'cs@jasabersih.com');

  const visible = !!kind;

  if (!visible) return null;

  const isBanned = kind === 'banned';
  const isDeleted = kind === 'deleted';

  const theme = isDeleted
    ? { gradient: ['#475569', '#334155'] as const, accent: '#475569', accentBg: '#F1F5F9', Icon: Trash2, label: 'Akun Dihapus' }
    : isBanned
      ? { gradient: ['#7F1D1D', '#DC2626'] as const, accent: '#DC2626', accentBg: '#FEE2E2', Icon: ShieldX, label: 'Akun Diblokir' }
      : { gradient: ['#92400E', '#F59E0B'] as const, accent: '#F59E0B', accentBg: '#FEF3C7', Icon: ShieldAlert, label: 'Akun Disuspend' };

  const untilDate = until ? new Date(until) : null;
  const untilValid = untilDate && !isNaN(untilDate.getTime());
  const untilLabel = untilValid
    ? untilDate!.toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  // Hitung sisa waktu suspend (untuk progress + countdown)
  let remainingDays: number | null = null;
  if (untilValid) {
    const ms = untilDate!.getTime() - Date.now();
    remainingDays = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }

  function openWa() {
    const msg = encodeURIComponent(`Halo CS JasaBersih, akun saya ${kind} dan saya butuh bantuan.\n\nAlasan: ${reason ?? '-'}\n\nMohon ditinjau ulang.`);
    Linking.openURL(`https://wa.me/${waNumber}?text=${msg}`).catch(() => {});
  }
  function openEmail() {
    Linking.openURL(`mailto:${csEmail}?subject=${encodeURIComponent('Banding ' + theme.label)}&body=${encodeURIComponent(`Akun saya: ${kind}\nAlasan: ${reason ?? '-'}\n\nMohon bantuan untuk meninjau ulang.`)}`).catch(() => {});
  }

  function logoutAndClose() {
    logout();
    clear();
    router.replace('/(tabs)');
  }

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => {}} presentationStyle="overFullScreen">
      <View style={{ flex: 1, backgroundColor: 'white' }}>
        <LinearGradient colors={theme.gradient} style={{ paddingBottom: 48 }}>
          <SafeAreaView edges={['top']}>
            <View className="items-center px-6 pt-8 pb-2">
              <View
                className="h-24 w-24 items-center justify-center rounded-full bg-white/15"
                style={{ borderWidth: 4, borderColor: 'rgba(255,255,255,0.25)' }}
              >
                <theme.Icon color="white" size={44} strokeWidth={2.2} />
              </View>
              <Text className="font-extrabold mt-5 text-center text-2xl text-white">{theme.label}</Text>
              <Text className="font-sans mt-2 text-center text-[13px] leading-5 text-white/85">
                {isDeleted
                  ? 'Akun kamu sudah dihapus dan tidak dapat diakses lagi.'
                  : isBanned
                    ? 'Akun kamu diblokir secara permanen dari layanan JasaBersih.'
                    : untilLabel
                      ? 'Akun kamu disuspend sementara - bisa aktif kembali setelah masa suspend berakhir.'
                      : 'Akun kamu sedang disuspend sementara.'}
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} className="-mt-8">
          {/* Countdown card */}
          {!isDeleted && !isBanned && untilLabel && (
            <View className="rounded-2xl bg-white p-4 shadow-sm" style={{ elevation: 6 }}>
              <View className="flex-row items-center gap-2">
                <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: theme.accentBg }}>
                  <Clock color={theme.accent} size={20} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-[10px] uppercase tracking-wider" style={{ color: theme.accent }}>
                    Aktif kembali pada
                  </Text>
                  <Text className="font-bold text-sm text-ink-900">{untilLabel}</Text>
                  {remainingDays !== null && (
                    <Text className="font-sans mt-0.5 text-[11px] text-ink-500">
                      {remainingDays === 0 ? 'Hari ini juga' : `Sekitar ${remainingDays} hari lagi`}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Reason card */}
          {reason && (
            <View
              className="mt-3 rounded-2xl border p-4"
              style={{ backgroundColor: theme.accentBg, borderColor: theme.accent + '40' }}
            >
              <Text className="font-bold text-[10px] uppercase tracking-wider" style={{ color: theme.accent }}>
                Alasan
              </Text>
              <Text className="font-sans mt-1.5 text-[13px] leading-5 text-ink-800">{reason}</Text>
            </View>
          )}

          {/* Bantuan section */}
          {!isDeleted && (
            <View className="mt-4 rounded-2xl bg-ink-50 p-4">
              <Text className="font-bold text-sm text-ink-900">Mau banding atau klarifikasi?</Text>
              <Text className="font-sans mt-1 text-[12px] leading-4 text-ink-600">
                Hubungi tim CS kami. Sertakan nomor HP/email akun + bukti pendukung (foto/kronologi).
              </Text>

              <Pressable
                onPress={openWa}
                className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5"
                style={{ elevation: 2 }}
              >
                <MessageCircle color="white" size={18} strokeWidth={2.4} />
                <Text className="font-bold text-sm text-white">Chat CS via WhatsApp</Text>
              </Pressable>

              <Pressable
                onPress={openEmail}
                className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-ink-300 bg-white py-3.5"
              >
                <Mail color="#475569" size={18} strokeWidth={2.4} />
                <Text className="font-bold text-sm text-ink-700">Email CS</Text>
              </Pressable>

              <Text className="font-sans mt-3 text-center text-[10px] text-ink-400">
                Response time: 1×24 jam (hari kerja)
              </Text>
            </View>
          )}

          {/* What happens next */}
          {(isDeleted || isBanned) && (
            <View className="mt-4 rounded-2xl bg-ink-50 p-4">
              <Text className="font-bold text-sm text-ink-900">Apa selanjutnya?</Text>
              <View className="mt-2 gap-1.5">
                <Text className="font-sans text-[12px] text-ink-600">• Kamu tidak bisa login atau akses fitur apapun</Text>
                <Text className="font-sans text-[12px] text-ink-600">• Riwayat booking & wallet ke-lock untuk audit</Text>
                {isBanned && (
                  <Text className="font-sans text-[12px] text-ink-600">• Bisa banding via email CS dengan bukti pendukung</Text>
                )}
              </View>
            </View>
          )}

          <Pressable onPress={logoutAndClose} className="mt-6 items-center py-3">
            <Text className="font-medium text-[12px] text-ink-500">
              {isDeleted || isBanned ? 'Logout & Kembali ke Beranda' : 'Logout & Coba Lain Waktu'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

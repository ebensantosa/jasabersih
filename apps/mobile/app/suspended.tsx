import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Mail, MessageCircle, ShieldAlert } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '../src/stores/auth';
import { useConfig } from '../src/stores/appContent';

export default function SuspendedScreen() {
  const router = useRouter();
  const { reason, until, kind } = useLocalSearchParams<{ reason?: string; until?: string; kind?: 'suspended' | 'banned' | 'deleted' }>();
  const logout = useAuthStore((s) => s.logout);
  const waNumber = useConfig('contact.whatsapp', '6285124363374');
  const csEmail = useConfig('contact.email', 'cs@jasabersih.com');

  const isBanned = kind === 'banned';
  const isDeleted = kind === 'deleted';
  const title = isDeleted ? 'Akun Dihapus' : isBanned ? 'Akun Diblokir' : 'Akun Disuspend';
  const headerColor = isDeleted ? '#475569' : isBanned ? '#DC2626' : '#F59E0B';

  const untilDate = until ? new Date(until) : null;
  const untilLabel = untilDate && !isNaN(untilDate.getTime())
    ? untilDate.toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  function openWa() {
    const msg = encodeURIComponent(`Halo CS JasaBersih, akun saya ${kind} dan saya butuh bantuan. Alasan: ${reason ?? '-'}`);
    Linking.openURL(`https://wa.me/${waNumber}?text=${msg}`).catch(() => {});
  }
  function openEmail() {
    Linking.openURL(`mailto:${csEmail}?subject=${encodeURIComponent('Banding ' + title)}&body=${encodeURIComponent(`Akun saya: ${kind}\nAlasan: ${reason ?? '-'}\n\nMohon bantuan untuk meninjau ulang.`)}`).catch(() => {});
  }

  function logoutNow() {
    logout();
    router.replace('/(tabs)');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <View style={{ height: 12, backgroundColor: headerColor }} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
          <View className="items-center pt-6">
            <View
              className="h-24 w-24 items-center justify-center rounded-full"
              style={{ backgroundColor: headerColor + '20' }}
            >
              <ShieldAlert color={headerColor} size={48} strokeWidth={2} />
            </View>
            <Text className="font-extrabold mt-5 text-center text-2xl text-ink-900">{title}</Text>
            <Text className="font-sans mt-2 text-center text-sm text-ink-600 leading-5">
              {isDeleted
                ? 'Akun kamu telah dihapus dan tidak dapat diakses lagi.'
                : isBanned
                  ? 'Akun kamu diblokir secara permanen dari layanan JasaBersih.'
                  : untilLabel
                    ? `Akun kamu disuspend sampai ${untilLabel}.`
                    : 'Akun kamu sedang disuspend sementara.'}
            </Text>
          </View>

          {reason && (
            <View
              className="mt-6 rounded-2xl border p-4"
              style={{ borderColor: headerColor + '40', backgroundColor: headerColor + '10' }}
            >
              <Text className="font-bold text-[11px] uppercase tracking-wider" style={{ color: headerColor }}>
                Alasan
              </Text>
              <Text className="font-sans mt-1 text-[13px] leading-5 text-ink-800">{reason}</Text>
            </View>
          )}

          {!isDeleted && (
            <View className="mt-6 rounded-2xl bg-ink-50 p-4">
              <Text className="font-bold text-sm text-ink-900">Mau banding atau klarifikasi?</Text>
              <Text className="font-sans mt-1 text-[12px] leading-4 text-ink-600">
                Hubungi tim CS kami. Sertakan nomor HP/email akun + bukti pendukung.
              </Text>

              <Pressable
                onPress={openWa}
                className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3"
              >
                <MessageCircle color="white" size={18} />
                <Text className="font-bold text-sm text-white">Chat CS via WhatsApp</Text>
              </Pressable>

              <Pressable
                onPress={openEmail}
                className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-ink-300 bg-white py-3"
              >
                <Mail color="#475569" size={18} />
                <Text className="font-bold text-sm text-ink-700">Email CS</Text>
              </Pressable>
            </View>
          )}

          <View className="flex-1" />

          <Pressable
            onPress={logoutNow}
            className="mt-6 items-center py-3"
          >
            <Text className="font-medium text-[12px] text-ink-500">Logout & Kembali ke Beranda</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

import { Stack } from 'expo-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUserStore } from '../../src/stores/user';
import { withAuth } from '../../src/components/AuthGate';
import { safeBack } from '../../src/lib/safeBack';

function EditProfile() {
  const profile = useUserStore((s) => s.profile);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
          <Pressable onPress={() => safeBack('/(tabs)/profile')} className="h-10 w-10 items-center justify-center -ml-2">
            <ArrowLeft size={22} color="#0F172A" />
          </Pressable>
          <Text className="font-bold text-base text-ink-900">Profil Akun</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View className="rounded-2xl bg-white p-4">
            <View className="rounded-lg bg-ink-50 px-3 py-2.5">
              <Text className="text-[10px] uppercase tracking-wider text-ink-500">Nama Lengkap</Text>
              <Text className="font-bold mt-0.5 text-sm text-ink-900">{profile?.name ?? '-'}</Text>
            </View>

            <View className="mt-2 rounded-lg bg-ink-50 px-3 py-2.5">
              <Text className="text-[10px] uppercase tracking-wider text-ink-500">Email</Text>
              <Text className="font-bold mt-0.5 text-sm text-ink-900">{profile?.email ?? '-'}</Text>
            </View>

            <View className="mt-2 rounded-lg bg-ink-50 px-3 py-2.5">
              <Text className="text-[10px] uppercase tracking-wider text-ink-500">Nomor HP</Text>
              <Text className="font-bold mt-0.5 text-sm text-ink-900">{profile?.phone ?? '-'}</Text>
            </View>
          </View>

          <View className="flex-row items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <ShieldCheck color="#B45309" size={16} strokeWidth={2.4} />
            <View className="flex-1">
              <Text className="font-bold text-[12px] text-amber-900">Data akun hanya bisa diubah oleh admin</Text>
              <Text className="font-medium mt-0.5 text-[11px] leading-4 text-amber-900">
                Untuk ganti nama, email, atau nomor HP, silakan hubungi CS via WhatsApp. Ini untuk keamanan akun &amp; mencegah penyalahgunaan.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

export default withAuth(EditProfile);

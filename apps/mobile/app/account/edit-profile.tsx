import { Stack } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { toast } from '../../src/stores/ui';
import { useUserStore } from '../../src/stores/user';
import { withAuth } from '../../src/components/AuthGate';
import { safeBack } from '../../src/lib/safeBack';

function EditProfile() {
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setEmail(profile.email ?? '');
    }
  }, [profile]);

  async function save() {
    if (name.trim().length < 2) { toast.error('Nama min 2 karakter'); return; }
    setSaving(true);
    try {
      const r = await api.patch('/auth/me', { name: name.trim(), email: email.trim() || null });
      const updated = r.data?.data ?? r.data;
      setProfile(updated);
      toast.success('Profil tersimpan');
      safeBack('/(tabs)/profile');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal simpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
          <Pressable onPress={() => safeBack('/(tabs)/profile')} className="h-10 w-10 items-center justify-center -ml-2">
            <ArrowLeft size={22} color="#0F172A" />
          </Pressable>
          <Text className="font-bold text-base text-ink-900">Edit Profil</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
          <View className="rounded-2xl bg-white p-4">
            <Text className="font-semibold mb-1 text-xs text-ink-700">Nama Lengkap</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nama lengkap"
              className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900"
            />

            <Text className="font-semibold mb-1 mt-3 text-xs text-ink-700">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900"
            />

            <View className="mt-3 rounded-lg bg-ink-50 px-3 py-2">
              <Text className="text-[10px] text-ink-500">Nomor HP</Text>
              <Text className="font-medium text-sm text-ink-700">{profile?.phone ?? '—'}</Text>
              <Text className="mt-0.5 text-[10px] text-ink-400">Hubungi CS untuk ganti nomor HP</Text>
            </View>
          </View>

        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
          <SafeAreaView edges={['bottom']}>
            <View className="p-4">
              <Pressable
                onPress={save}
                disabled={saving}
                className={`items-center justify-center rounded-2xl py-3.5 ${saving ? 'bg-brand-400' : 'bg-brand-600'}`}
              >
                {saving ? <ActivityIndicator color="white" /> : <Text className="font-bold text-sm text-white">Simpan Perubahan</Text>}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaView>
    </>
  );
}

export default withAuth(EditProfile);

import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withAuth } from '../../src/components/AuthGate';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { toast } from '../../src/stores/ui';
import { safeBack } from '../../src/lib/safeBack';

function ChangePassword() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [show, setShow] = useState({ a: false, b: false, c: false });
  const [loading, setLoading] = useState(false);

  const valid = currentPwd.length >= 1 && newPwd.length >= 8 && newPwd === confirmPwd;
  const mismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;

  async function submit() {
    if (!valid) {
      toast.error(mismatch ? 'Konfirmasi password tidak cocok' : 'Lengkapi field, password baru min 8 karakter');
      return;
    }
    if (currentPwd === newPwd) {
      toast.error('Password baru harus beda dengan password lama');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: currentPwd, newPassword: newPwd });
      toast.success('Password berhasil diganti. Silakan login ulang.');
      logout();
      router.replace('/(auth)/login');
    } catch (e: any) {
      const code = e?.response?.data?.error?.code;
      const msg = code === 'WRONG_PASSWORD'
        ? 'Password lama yang kamu masukkan salah'
        : e?.response?.data?.error?.message ?? 'Gagal ganti password';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="flex-row items-center gap-2 border-b border-ink-100 bg-white px-3 py-2">
          <Pressable onPress={() => safeBack(router)} className="h-10 w-10 items-center justify-center">
            <ArrowLeft color="#0F172A" size={22} />
          </Pressable>
          <Text className="font-bold flex-1 text-base text-ink-900">Ganti Password</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <View className="items-center pt-2">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-50">
              <ShieldCheck color="#1D4ED8" size={28} strokeWidth={2.2} />
            </View>
            <Text className="font-bold mt-3 text-center text-base text-ink-900">Amankan akun kamu</Text>
            <Text className="font-sans mt-1 text-center text-[12px] leading-4 text-ink-500">
              Setelah ganti password, semua device lain akan auto-logout.
            </Text>
          </View>

          <View className="mt-6 gap-3">
            <PwdField
              label="Password Lama"
              value={currentPwd}
              onChange={setCurrentPwd}
              show={show.a}
              toggle={() => setShow({ ...show, a: !show.a })}
            />
            <PwdField
              label="Password Baru"
              value={newPwd}
              onChange={setNewPwd}
              show={show.b}
              toggle={() => setShow({ ...show, b: !show.b })}
              hint="Min 8 karakter"
            />
            <PwdField
              label="Konfirmasi Password Baru"
              value={confirmPwd}
              onChange={setConfirmPwd}
              show={show.c}
              toggle={() => setShow({ ...show, c: !show.c })}
              error={mismatch ? 'Tidak cocok dengan password baru' : null}
            />
          </View>

          <Pressable
            onPress={submit}
            disabled={!valid || loading}
            className={`mt-6 rounded-2xl py-4 ${!valid || loading ? 'bg-ink-200' : 'bg-brand-600'}`}
          >
            <Text className="font-bold text-center text-sm text-white">
              {loading ? 'Memproses…' : 'Simpan Password Baru'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function PwdField({ label, value, onChange, show, toggle, hint, error }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; toggle: () => void;
  hint?: string; error?: string | null;
}) {
  return (
    <View>
      <Text className="font-semibold mb-1 text-[11px] text-ink-700">{label}</Text>
      <View className={`flex-row items-center gap-2 rounded-xl border bg-white px-3 ${error ? 'border-error' : 'border-ink-200'}`}>
        <Lock color="#94A3B8" size={16} />
        <TextInput
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          placeholder="••••••••"
          placeholderTextColor="#94A3B8"
          className="font-sans flex-1 py-3 text-sm text-ink-900"
        />
        <Pressable onPress={toggle} hitSlop={8}>
          {show ? <EyeOff color="#94A3B8" size={18} /> : <Eye color="#94A3B8" size={18} />}
        </Pressable>
      </View>
      {(hint || error) && (
        <Text className={`font-sans mt-1 text-[10px] ${error ? 'text-error' : 'text-ink-500'}`}>
          {error || hint}
        </Text>
      )}
    </View>
  );
}

export default withAuth(ChangePassword);

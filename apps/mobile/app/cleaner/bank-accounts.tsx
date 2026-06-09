import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, Building2, CheckCircle2, Plus, Star, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { withCleanerKyc } from '../../src/components/CleanerKycGate';
import { Dropdown } from '../../src/components/Dropdown';
import { ToastHost } from '../../src/components/Toast';
import { safeBack } from '../../src/lib/safeBack';

type BankAccount = {
  id: string;
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
  isVerified: boolean;
  isDefault: boolean;
  verifiedAt: string | null;
};

// Kode bank pakai Flip standard (lowercase). Lihat: https://docs.flip.id/#operation/getbankinfo
const BANKS = [
  { code: 'bca', label: 'BCA' },
  { code: 'mandiri', label: 'Mandiri' },
  { code: 'bni', label: 'BNI' },
  { code: 'bri', label: 'BRI' },
  { code: 'cimb', label: 'CIMB Niaga' },
  { code: 'permata', label: 'Permata' },
  { code: 'bsi', label: 'BSI' },
  { code: 'danamon', label: 'Danamon' },
  { code: 'mega', label: 'Mega' },
  { code: 'panin', label: 'Panin' },
  { code: 'ocbc', label: 'OCBC NISP' },
  { code: 'uob', label: 'UOB' },
  { code: 'maybank', label: 'Maybank' },
  { code: 'btn', label: 'BTN' },
  { code: 'btpn', label: 'BTPN' },
  { code: 'bca_syr', label: 'BCA Syariah' },
  { code: 'muamalat', label: 'Muamalat' },
  { code: 'sinarmas', label: 'Sinarmas' },
  { code: 'bukopin', label: 'Bukopin' },
  { code: 'dki', label: 'Bank DKI' },
  { code: 'jago', label: 'Jago' },
  { code: 'jenius', label: 'Jenius (BTPN)' },
  { code: 'seabank', label: 'SeaBank' },
  { code: 'neo', label: 'Neo Commerce' },
  { code: 'allo', label: 'Allo Bank' },
  { code: 'blu', label: 'Blu (BCA Digital)' },
  { code: 'mestika', label: 'Mestika' },
  { code: 'jatim', label: 'Bank Jatim' },
  { code: 'jateng', label: 'Bank Jateng' },
  { code: 'jabar', label: 'BJB' },
  { code: 'sumut', label: 'Bank Sumut' },
  { code: 'kalbar', label: 'Bank Kalbar' },
  { code: 'sulselbar', label: 'Bank Sulselbar' },
  { code: 'gopay', label: 'GoPay' },
  { code: 'ovo', label: 'OVO' },
  { code: 'dana', label: 'DANA' },
  { code: 'shopeepay', label: 'ShopeePay' },
  { code: 'linkaja', label: 'LinkAja' },
];

function CleanerBankAccounts() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/cleaner/bank-accounts');
      setAccounts((r.data?.data ?? r.data ?? []) as BankAccount[]);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal load rekening');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setDefault(id: string) {
    try {
      await api.patch(`/cleaner/bank-accounts/${id}/set-default`);
      toast.success('Rekening default diatur');
      void load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal');
    }
  }

  async function remove(acc: BankAccount) {
    Alert.alert('Hapus Rekening', `Hapus ${acc.bankCode.toUpperCase()} ${acc.accountNumber}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/cleaner/bank-accounts/${acc.id}`);
            toast.success('Rekening dihapus');
            void load();
          } catch (e: any) {
            toast.error(e?.response?.data?.error?.message ?? 'Gagal hapus');
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-white border-b border-ink-100">
          <View className="flex-row items-center px-3 py-3">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <Text className="ml-1 text-base font-bold text-ink-900">Rekening Bank</Text>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View className="rounded-xl bg-blue-50 border border-blue-200 p-3 flex-row gap-2">
            <BadgeCheck color="#1D4ED8" size={18} />
            <Text className="flex-1 text-xs text-blue-900 leading-5">
              Tambah rekening atas nama kamu. Sistem akan verifikasi otomatis ke bank.
              Hanya rekening verified yang bisa dipakai untuk penarikan otomatis.
            </Text>
          </View>

          {loading ? (
            <View className="py-12 items-center"><ActivityIndicator color="#1D4ED8" /></View>
          ) : accounts.length === 0 ? (
            <View className="py-12 items-center">
              <Building2 color="#94A3B8" size={48} />
              <Text className="mt-3 text-sm text-ink-500">Belum ada rekening</Text>
            </View>
          ) : (
            accounts.map((acc) => (
              <View key={acc.id} className="bg-white rounded-xl border border-ink-100 p-4">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 rounded-full bg-blue-100 items-center justify-center">
                    <Building2 color="#1D4ED8" size={20} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-ink-900">{acc.bankCode.toUpperCase()}</Text>
                    <Text className="text-xs text-ink-500 mt-0.5">{acc.accountNumber}</Text>
                  </View>
                  {acc.isVerified && (
                    <View className="flex-row items-center gap-1 bg-emerald-50 px-2 py-1 rounded-full">
                      <CheckCircle2 color="#059669" size={14} />
                      <Text className="text-[11px] font-semibold text-emerald-700">Verified</Text>
                    </View>
                  )}
                </View>
                <Text className="mt-2 text-sm text-ink-700">{acc.accountHolderName}</Text>
                <View className="flex-row gap-2 mt-3">
                  {!acc.isDefault ? (
                    <Pressable onPress={() => setDefault(acc.id)} className="flex-row items-center gap-1 bg-ink-100 px-3 py-1.5 rounded-lg">
                      <Star color="#0F172A" size={14} />
                      <Text className="text-xs font-semibold text-ink-900">Jadikan Utama</Text>
                    </Pressable>
                  ) : (
                    <View className="flex-row items-center gap-1 bg-amber-100 px-3 py-1.5 rounded-lg">
                      <Star color="#D97706" size={14} fill="#D97706" />
                      <Text className="text-xs font-semibold text-amber-700">Default</Text>
                    </View>
                  )}
                  <Pressable onPress={() => remove(acc)} className="flex-row items-center gap-1 bg-rose-50 px-3 py-1.5 rounded-lg ml-auto">
                    <Trash2 color="#DC2626" size={14} />
                    <Text className="text-xs font-semibold text-rose-700">Hapus</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          <Pressable
            onPress={() => setAddModal(true)}
            className="mt-2 flex-row items-center justify-center gap-2 bg-blue-600 rounded-xl py-4"
          >
            <Plus color="white" size={20} />
            <Text className="text-white font-bold text-base">Tambah Rekening</Text>
          </Pressable>
        </ScrollView>
      </View>

      <AddBankModal visible={addModal} onClose={() => setAddModal(false)} onDone={() => { setAddModal(false); void load(); }} />
    </>
  );
}

function AddBankModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [bankCode, setBankCode] = useState('bca');
  const [accountNumber, setAccountNumber] = useState('');
  const [verifying, setVerifying] = useState(false);

  async function submit() {
    if (!/^\d{6,20}$/.test(accountNumber)) {
      toast.warning('Nomor rekening harus 6-20 digit angka');
      return;
    }
    setVerifying(true);
    try {
      const r = await api.post('/cleaner/bank-accounts', { bankCode, accountNumber });
      const data = r.data?.data ?? r.data;
      toast.success(`Verified: ${data.accountHolderName}`);
      onDone();
      setAccountNumber('');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal verifikasi rekening');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ToastHost />
      <Pressable onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <Pressable onPress={(e) => e.stopPropagation()} className="bg-white rounded-t-3xl p-5 pb-8">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-ink-900">Tambah Rekening</Text>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center">
              <X color="#475569" size={20} />
            </Pressable>
          </View>

          <Text className="text-sm font-semibold text-ink-700 mb-2">Bank</Text>
          <View className="mb-4">
            <Dropdown
              options={BANKS.map((b) => b.label)}
              value={BANKS.find((b) => b.code === bankCode)?.label ?? ''}
              onChange={(label) => {
                const found = BANKS.find((b) => b.label === label);
                if (found) setBankCode(found.code);
              }}
              placeholder="Pilih bank"
            />
          </View>

          <Text className="text-sm font-semibold text-ink-700 mb-2">Nomor Rekening</Text>
          <TextInput
            value={accountNumber}
            onChangeText={(t) => setAccountNumber(t.replace(/\D/g, ''))}
            placeholder="contoh: 1234567890"
            keyboardType="number-pad"
            maxLength={20}
            className="border border-ink-200 rounded-xl px-4 py-3 text-base"
          />

          <Text className="text-xs text-ink-500 mt-3 leading-5">
            ℹ️ Pastikan rekening atas nama kamu sendiri. Sistem akan otomatis cek nama lewat bank.
          </Text>

          <Pressable
            onPress={submit}
            disabled={verifying}
            className={`mt-5 rounded-xl py-4 flex-row items-center justify-center gap-2 ${
              verifying ? 'bg-ink-300' : 'bg-blue-600'
            }`}
          >
            {verifying && <ActivityIndicator color="white" />}
            <Text className="text-white font-bold text-base">
              {verifying ? 'Memverifikasi...' : 'Verifikasi & Simpan'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default withAuth(withCleanerKyc(CleanerBankAccounts));

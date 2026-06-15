import { Stack, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, BadgeCheck, Building2, CheckCircle2, Plus, Smartphone, Star, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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

// Bank + e-wallet pakai Flip code standard (lowercase).
// Coverage: konvensional besar, syariah, BPD regional, digital bank, e-wallet.
const BANKS = [
  // Bank konvensional besar (paling populer)
  { code: 'bca', label: 'BCA' },
  { code: 'mandiri', label: 'Mandiri' },
  { code: 'bni', label: 'BNI' },
  { code: 'bri', label: 'BRI' },
  { code: 'cimb', label: 'CIMB Niaga' },
  { code: 'permata', label: 'Permata' },
  { code: 'bsi', label: 'BSI' },
  { code: 'danamon', label: 'Danamon' },
  { code: 'mega', label: 'Mega' },
  { code: 'btn', label: 'BTN' },
  { code: 'panin', label: 'Panin' },
  { code: 'ocbc', label: 'OCBC NISP' },
  { code: 'uob', label: 'UOB' },
  { code: 'maybank', label: 'Maybank' },
  { code: 'btpn', label: 'BTPN' },
  { code: 'sinarmas', label: 'Sinarmas' },
  { code: 'bukopin', label: 'Bukopin' },
  // Bank syariah
  { code: 'bca_syr', label: 'BCA Syariah' },
  { code: 'muamalat', label: 'Muamalat' },
  { code: 'btn_syr', label: 'BTN Syariah' },
  { code: 'mega_syr', label: 'Mega Syariah' },
  // BPD (regional)
  { code: 'dki', label: 'Bank DKI' },
  { code: 'jatim', label: 'Bank Jatim' },
  { code: 'jateng', label: 'Bank Jateng' },
  { code: 'jabar', label: 'BJB (Jabar)' },
  { code: 'jogja', label: 'Bank Jogja' },
  { code: 'bali', label: 'Bank BPD Bali' },
  { code: 'aceh', label: 'Bank Aceh' },
  { code: 'sumut', label: 'Bank Sumut' },
  { code: 'sumsel', label: 'Bank Sumsel Babel' },
  { code: 'sumbar', label: 'Bank Nagari (Sumbar)' },
  { code: 'riau', label: 'Bank Riau Kepri' },
  { code: 'kalbar', label: 'Bank Kalbar' },
  { code: 'kalsel', label: 'Bank Kalsel' },
  { code: 'kaltim', label: 'Bank Kaltimtara' },
  { code: 'sulselbar', label: 'Bank Sulselbar' },
  { code: 'sulteng', label: 'Bank Sulteng' },
  { code: 'sulut', label: 'Bank SulutGo' },
  { code: 'maluku', label: 'Bank Maluku' },
  { code: 'nusa_tenggara_barat', label: 'Bank NTB Syariah' },
  { code: 'nusa_tenggara_timur', label: 'Bank NTT' },
  { code: 'papua', label: 'Bank Papua' },
  // Digital bank
  { code: 'jago', label: 'Jago' },
  { code: 'jenius', label: 'Jenius (BTPN)' },
  { code: 'seabank', label: 'SeaBank' },
  { code: 'neo', label: 'Neo Commerce' },
  { code: 'allo', label: 'Allo Bank' },
  { code: 'blu', label: 'Blu (BCA Digital)' },
  { code: 'mestika', label: 'Mestika' },
  // E-wallet (Flip support disbursement langsung ke wallet)
  { code: 'gopay', label: 'GoPay' },
  { code: 'ovo', label: 'OVO' },
  { code: 'dana', label: 'DANA' },
  { code: 'shopeepay', label: 'ShopeePay' },
  { code: 'linkaja', label: 'LinkAja' },
];

const EWALLET_CODES = new Set(['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja']);

function isEwalletCode(code: string): boolean {
  return EWALLET_CODES.has(code);
}

function CleanerBankAccounts() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  // Confirm delete modal state: simpan account yg mau di-hapus.
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      await api.patch(`/cleaner/bank-accounts/${id}/default`);
      toast.success('Rekening utama di-update');
      void load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal set default');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/cleaner/bank-accounts/${deleteTarget.id}`);
      toast.success('Rekening dihapus');
      setDeleteTarget(null);
      void load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal hapus');
    } finally {
      setDeleting(false);
    }
  }

  // Set target -> trigger Modal confirm popup (custom, jalan di semua platform).
  function remove(acc: BankAccount) {
    setDeleteTarget(acc);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-white">
          <View className="flex-row items-center gap-2 px-2 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <Text className="ml-1 text-base font-bold text-ink-900">Rekening &amp; E-Wallet</Text>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View className="rounded-xl bg-blue-50 border border-blue-200 p-3 flex-row gap-2">
            <BadgeCheck color="#1D4ED8" size={18} />
            <Text className="flex-1 text-xs text-blue-900 leading-5">
              Tambah rekening bank atau e-wallet atas nama kamu. Sistem akan verifikasi otomatis via Flip.
              Hanya tujuan verified yang bisa dipakai untuk penarikan otomatis.
            </Text>
          </View>

          {loading ? (
            <View className="py-12 items-center"><ActivityIndicator color="#1D4ED8" /></View>
          ) : accounts.length === 0 ? (
            <View className="py-12 items-center">
              <Building2 color="#94A3B8" size={48} />
              <Text className="mt-3 text-sm text-ink-500">Belum ada rekening / e-wallet</Text>
            </View>
          ) : (
            accounts.map((acc) => {
              const ewallet = isEwalletCode(acc.bankCode);
              return (
                <View key={acc.id} className="bg-white rounded-xl border border-ink-100 p-4">
                  <View className="flex-row items-center gap-3">
                    <View className={`h-10 w-10 rounded-full items-center justify-center ${ewallet ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                      {ewallet ? <Smartphone color="#059669" size={20} /> : <Building2 color="#1D4ED8" size={20} />}
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-bold text-ink-900">
                        {acc.bankCode.toUpperCase()}
                        {ewallet && <Text className="text-[10px] font-bold text-emerald-700"> · E-WALLET</Text>}
                      </Text>
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
              );
            })
          )}

          <Pressable
            onPress={() => setAddModal(true)}
            className="mt-2 flex-row items-center justify-center gap-2 bg-blue-600 rounded-xl py-4"
          >
            <Plus color="white" size={20} />
            <Text className="text-white font-bold text-base">Tambah Tujuan Penarikan</Text>
          </Pressable>
        </ScrollView>
      </View>

      <AddBankModal visible={addModal} onClose={() => setAddModal(false)} onDone={() => { setAddModal(false); void load(); }} />

      {/* Custom confirm popup utk delete - jalan di semua platform (web + native) */}
      <DeleteConfirmModal
        target={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

// Confirm popup utk delete bank/e-wallet. Custom Modal jalan di web + native.
function DeleteConfirmModal({
  target,
  deleting,
  onCancel,
  onConfirm,
}: {
  target: BankAccount | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!target) return null;
  const isEwallet = EWALLET_CODES.has(target.bankCode);
  return (
    <Modal transparent statusBarTranslucent visible animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-2xl bg-white p-5"
          style={{ elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16 }}
        >
          <View className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle color="#DC2626" size={26} strokeWidth={2.4} />
            </View>
            <Text className="font-extrabold mt-3 text-center text-base text-ink-900">
              Hapus {isEwallet ? 'E-Wallet' : 'Rekening'}?
            </Text>
            <Text className="font-medium mt-1.5 text-center text-[12px] text-ink-600">
              <Text className="font-bold text-ink-900">{target.bankCode.toUpperCase()}</Text>
              {' - '}
              {target.accountNumber}
              {'\n'}
              <Text className="text-ink-500">{target.accountHolderName}</Text>
            </Text>
            <Text className="font-sans mt-2 text-center text-[11px] text-ink-400">
              {isEwallet ? 'E-wallet' : 'Rekening'} ini akan dihapus dari daftar tujuan penarikan kamu.
            </Text>
          </View>
          <View style={{ marginTop: 20, flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={onCancel}
              disabled={deleting}
              style={{
                flex: 1,
                alignItems: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#CBD5E1',
                paddingVertical: 12,
                backgroundColor: '#FFFFFF',
              }}
            >
              <Text style={{ fontWeight: '600', fontSize: 14, color: '#334155' }}>Batal</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={deleting}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderRadius: 12,
                paddingVertical: 12,
                backgroundColor: '#DC2626',
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting && <ActivityIndicator size="small" color="#FFFFFF" />}
              <Text style={{ fontWeight: '700', fontSize: 14, color: '#FFFFFF' }}>
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AddBankModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [destinationType, setDestinationType] = useState<'bank' | 'ewallet'>('bank');
  const [bankCode, setBankCode] = useState('bca');
  const [accountNumber, setAccountNumber] = useState('');
  const [verifying, setVerifying] = useState(false);

  const isEwallet = isEwalletCode(bankCode);
  const filteredOptions = BANKS.filter((b) => destinationType === 'ewallet' ? isEwalletCode(b.code) : !isEwalletCode(b.code));

  function onTypeChange(t: 'bank' | 'ewallet') {
    setDestinationType(t);
    const first = BANKS.find((b) => t === 'ewallet' ? isEwalletCode(b.code) : !isEwalletCode(b.code));
    if (first) setBankCode(first.code);
    setAccountNumber('');
  }

  async function submit() {
    if (isEwallet) {
      const cleaned = accountNumber.replace(/\D/g, '').replace(/^62/, '0');
      if (!/^08[1-9]\d{7,11}$/.test(cleaned)) {
        toast.warning('Nomor HP harus format 08xxx (10-13 digit)');
        return;
      }
    } else {
      if (!/^\d{6,20}$/.test(accountNumber)) {
        toast.warning('Nomor rekening harus 6-20 digit angka');
        return;
      }
    }
    setVerifying(true);
    try {
      const r = await api.post('/cleaner/bank-accounts', { bankCode, accountNumber });
      const data = r.data?.data ?? r.data;
      toast.success(`Verified: ${data.accountHolderName}`);
      onDone();
      setAccountNumber('');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal verifikasi');
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
            <Text className="text-lg font-bold text-ink-900">Tambah Tujuan Penarikan</Text>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center">
              <X color="#475569" size={20} />
            </Pressable>
          </View>

          {/* Toggle Bank vs E-Wallet */}
          <View className="mb-4 flex-row rounded-xl bg-ink-100 p-1">
            {([
              { key: 'bank', label: 'Bank', icon: Building2 },
              { key: 'ewallet', label: 'E-Wallet', icon: Smartphone },
            ] as const).map((t) => {
              const active = destinationType === t.key;
              const Icon = t.icon;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => onTypeChange(t.key)}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${active ? 'bg-white' : ''}`}
                  style={active ? { elevation: 2 } : undefined}
                >
                  <Icon color={active ? '#1D4ED8' : '#94A3B8'} size={14} strokeWidth={2.4} />
                  <Text className={`font-bold text-[13px] ${active ? 'text-brand-700' : 'text-ink-500'}`}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-sm font-semibold text-ink-700 mb-2">
            {isEwallet ? 'Pilih E-Wallet' : 'Pilih Bank'}
          </Text>
          <View className="mb-4">
            <Dropdown
              options={filteredOptions.map((b) => b.label)}
              value={filteredOptions.find((b) => b.code === bankCode)?.label ?? ''}
              onChange={(label) => {
                const found = filteredOptions.find((b) => b.label === label);
                if (found) setBankCode(found.code);
              }}
              placeholder={isEwallet ? 'Pilih e-wallet' : 'Pilih bank'}
            />
          </View>

          <Text className="text-sm font-semibold text-ink-700 mb-2">
            {isEwallet ? 'Nomor HP Terdaftar' : 'Nomor Rekening'}
          </Text>
          <TextInput
            value={accountNumber}
            onChangeText={(t) => setAccountNumber(t.replace(/\D/g, ''))}
            placeholder={isEwallet ? 'contoh: 08123456789' : 'contoh: 1234567890'}
            keyboardType="number-pad"
            maxLength={isEwallet ? 15 : 20}
            className="border border-ink-200 rounded-xl px-4 py-3 text-base"
          />

          <Text className="text-xs text-ink-500 mt-3 leading-5">
            {isEwallet
              ? 'Nomor HP harus terdaftar di e-wallet kamu. Sistem akan verifikasi otomatis.'
              : 'Pastikan rekening atas nama kamu sendiri. Sistem akan otomatis cek nama lewat bank.'}
          </Text>

          <Pressable
            onPress={submit}
            disabled={verifying}
            className={`mt-5 rounded-xl py-4 flex-row items-center justify-center gap-2 ${
              verifying ? 'bg-blue-300' : 'bg-blue-600'
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

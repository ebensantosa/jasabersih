import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, Building2, CheckCircle2, Plus, Wallet } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaintenanceBanner } from '../../src/components/MaintenanceBanner';
import { withAuth } from '../../src/components/AuthGate';
import { formatRupiah } from '../../src/data/catalog';
import { api } from '../../src/lib/api';
import { safeBack } from '../../src/lib/safeBack';
import { toast } from '../../src/stores/ui';

type VerifiedAccount = {
  id: string;
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
  isVerified: boolean;
  isDefault: boolean;
};

type WalletData = {
  balance: number;
  minWithdrawal?: number;
  pendingWithdrawalAmount?: number;
  pendingWithdrawalCount?: number;
};

const QUICK_AMOUNTS = [50_000, 100_000, 250_000, 500_000];

function WithdrawCustomer() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletData>({ balance: 0, minWithdrawal: 50000, pendingWithdrawalAmount: 0, pendingWithdrawalCount: 0 });
  const [verifiedAccounts, setVerifiedAccounts] = useState<VerifiedAccount[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  const [successModal, setSuccessModal] = useState<{ amount: number; autoDisburse: boolean } | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, accountsRes, bankHealthRes] = await Promise.all([
        api.get('/customer/wallet'),
        api.get('/customer/bank-accounts'),
        api.get('/payments/bank-health').catch(() => ({ data: { data: [] } })),
      ]);
      const walletData = (walletRes.data?.data ?? walletRes.data) as WalletData;
      const accounts = ((accountsRes.data?.data ?? accountsRes.data ?? []) as VerifiedAccount[]).filter((a) => a.isVerified);
      const healthList: { code: string; status: 'normal' | 'delayed' | 'down' }[] = bankHealthRes.data?.data ?? bankHealthRes.data ?? [];
      const healthMap = new Map(healthList.map((b) => [String(b.code).toLowerCase(), b.status]));
      const availableAccounts = accounts.filter((a) => healthMap.get(a.bankCode.toLowerCase()) !== 'down');
      setWallet({
        balance: Number(walletData.balance ?? 0),
        minWithdrawal: Number(walletData.minWithdrawal ?? 50000),
        pendingWithdrawalAmount: Number(walletData.pendingWithdrawalAmount ?? 0),
        pendingWithdrawalCount: Number(walletData.pendingWithdrawalCount ?? 0),
      });
      setVerifiedAccounts(accounts);
      setSelectedBankAccountId((current) => {
        if (current && availableAccounts.some((a) => a.id === current)) return current;
        return availableAccounts.find((a) => a.isDefault)?.id ?? availableAccounts[0]?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null;
      });
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal load data penarikan');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const minWithdrawal = Number(wallet.minWithdrawal ?? 50000);
  const amount = Number(amountStr.replace(/\D/g, '')) || 0;
  const selectedAccount = verifiedAccounts.find((a) => a.id === selectedBankAccountId) ?? null;
  const hasPendingWithdrawal = Number(wallet.pendingWithdrawalCount ?? 0) > 0;

  const amountError = useMemo(() => {
    if (amount === 0) return null;
    if (hasPendingWithdrawal) return 'Masih ada penarikan yang sedang diproses';
    if (amount < minWithdrawal) return `Minimum tarik ${formatRupiah(minWithdrawal)}`;
    if (amount > wallet.balance) return 'Jumlah melebihi saldo';
    return null;
  }, [amount, hasPendingWithdrawal, minWithdrawal, wallet.balance]);

  function submit() {
    if (!selectedBankAccountId) {
      toast.error('Pilih rekening tersimpan dulu.');
      return;
    }
    if (hasPendingWithdrawal) {
      toast.error('Masih ada penarikan yang sedang diproses.');
      return;
    }
    if (amount < minWithdrawal) {
      toast.error(`Minimum tarik ${formatRupiah(minWithdrawal)}`);
      return;
    }
    if (amount > wallet.balance) {
      toast.error('Jumlah melebihi saldo yang tersedia');
      return;
    }
    setConfirmModal(true);
  }

  async function doSubmit() {
    setConfirmModal(false);
    setSubmitting(true);
    try {
      const r = await api.post('/customer/withdrawal', { amount, bankAccountId: selectedBankAccountId });
      const data = r.data?.data ?? r.data;
      setSuccessModal({ amount, autoDisburse: !!data?.autoDisburse });
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal tarik saldo');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Confirmation Modal */}
      <Modal visible={confirmModal} transparent animationType="fade" onRequestClose={() => setConfirmModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 17, color: '#0F172A', marginBottom: 8 }}>Konfirmasi Penarikan</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#475569', marginBottom: 4 }}>
              Jumlah: <Text style={{ fontFamily: 'Inter_700Bold', color: '#0F172A' }}>{formatRupiah(amount)}</Text>
            </Text>
            {selectedAccount && (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#475569', marginBottom: 16 }}>
                Tujuan: {selectedAccount.bankCode.toUpperCase()} · {selectedAccount.accountNumber} a.n. {selectedAccount.accountHolderName}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setConfirmModal(false)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1' }}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#475569' }}>Batal</Text>
              </Pressable>
              <Pressable
                onPress={() => { void doSubmit(); }}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: '#1D4ED8' }}
              >
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: 'white' }}>Ya, Tarik</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={!!successModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', maxWidth: 340 }}>
            <View style={{ backgroundColor: '#D1FAE5', borderRadius: 999, padding: 20, marginBottom: 16 }}>
              <CheckCircle2 color="#059669" size={48} />
            </View>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0F172A', marginBottom: 8 }}>Penarikan Berhasil!</Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 22, color: '#1D4ED8', marginBottom: 12 }}>{formatRupiah(successModal?.amount ?? 0)}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 24 }}>
              {successModal?.autoDisburse
                ? 'Dana sedang diproses ke rekening tujuan. Tiba dalam beberapa menit.'
                : 'Permintaan penarikan diterima. Admin akan memproses segera.'}
            </Text>
            <Pressable
              onPress={() => { setSuccessModal(null); router.replace('/account/wallet'); }}
              style={{ backgroundColor: '#1D4ED8', borderRadius: 16, paddingVertical: 14, width: '100%', alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: 'white' }}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-brand-700">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => safeBack('/account/wallet')} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
            <View className="ml-1 flex-1">
              <Text className="text-base font-bold text-white">Tarik Saldo</Text>
              <Text className="text-[11px] font-medium text-white/75">Saldo: {formatRupiah(wallet.balance)}</Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
          <View className="mb-3">
            <MaintenanceBanner />
          </View>

          <View className="rounded-2xl bg-white p-4">
            <View className="flex-row items-center gap-2">
              <Wallet color="#1D4ED8" size={18} />
              <Text className="text-sm font-bold text-ink-900">Info Saldo</Text>
            </View>
            <Text className="mt-2 text-2xl font-extrabold text-ink-900">{formatRupiah(wallet.balance)}</Text>
            <Text className="mt-1 text-xs text-ink-500">Minimum penarikan {formatRupiah(minWithdrawal)}.</Text>
            {(wallet.pendingWithdrawalAmount ?? 0) > 0 && (
              <Text className="mt-1 text-xs text-amber-700">
                {formatRupiah(wallet.pendingWithdrawalAmount ?? 0)} sedang diproses. Tunggu selesai dulu sebelum kirim penarikan baru.
              </Text>
            )}
          </View>

          <View className="mt-3 rounded-2xl bg-white p-4">
            <View className="mb-3 flex-row items-center gap-2">
              <BadgeCheck color="#059669" size={18} />
              <Text className="text-sm font-bold text-ink-900">Rekening Tersimpan</Text>
            </View>
            {loading ? (
              <View className="items-center py-8"><ActivityIndicator color="#1D4ED8" /></View>
            ) : verifiedAccounts.length === 0 ? (
              <View className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="text-xs leading-5 text-amber-900">Belum ada rekening verified. Tambah dulu agar penarikan bisa diproses otomatis.</Text>
                <Pressable onPress={() => router.push('/account/bank-accounts')} className="mt-3 self-start rounded-lg bg-amber-600 px-3 py-2">
                  <Text className="text-xs font-bold text-white">Tambah Rekening</Text>
                </Pressable>
              </View>
            ) : (
              <View className="gap-2">
                {verifiedAccounts.map((acc) => {
                  const selected = selectedBankAccountId === acc.id;
                  const accountIsEwallet = ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].includes(acc.bankCode.toLowerCase());
                  return (
                    <Pressable key={acc.id} onPress={() => setSelectedBankAccountId(acc.id)} className={`flex-row items-center gap-3 rounded-xl border p-3 ${selected ? 'border-blue-500 bg-blue-50' : 'border-ink-200 bg-white'}`}>
                      <View className={`h-9 w-9 items-center justify-center rounded-full ${selected ? 'bg-blue-600' : 'bg-blue-100'}`}>
                        <Building2 color={selected ? 'white' : '#1D4ED8'} size={18} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-sm font-bold text-ink-900">{acc.bankCode.toUpperCase()}</Text>
                          {accountIsEwallet && (
                            <Text className="text-[10px] font-semibold text-emerald-700">E-Wallet</Text>
                          )}
                          {acc.isDefault && <Text className="text-[10px] font-semibold text-amber-600">Default</Text>}
                        </View>
                        <Text className="text-xs text-ink-600">{acc.accountNumber} - {acc.accountHolderName}</Text>
                      </View>
                      {selected && <CheckCircle2 color="#1D4ED8" size={20} />}
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => router.push('/account/bank-accounts')} className="mt-1 flex-row items-center justify-center gap-1 py-2">
                  <Plus color="#1D4ED8" size={14} />
                  <Text className="text-xs font-bold text-blue-700">Tambah / kelola rekening</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View className="mt-3 rounded-2xl bg-white p-4">
            <Text className="mb-2 text-sm font-bold text-ink-900">Jumlah Penarikan</Text>
            <Text className="mb-3 text-xs leading-5 text-ink-500">
              Kamu bisa mulai tarik saldo dari <Text className="font-bold text-ink-700">Rp 50.000</Text>.
            </Text>
            <View className="flex-row items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3">
              <Text className="text-base font-bold text-ink-700">Rp</Text>
              <TextInput
                value={amountStr}
                onChangeText={(v) => {
                  const clean = v.replace(/\D/g, '');
                  setAmountStr(clean ? Number(clean).toLocaleString('id-ID') : '');
                }}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                maxLength={12}
                className="flex-1 text-lg font-bold text-ink-900"
              />
            </View>
            {amountError && <Text className="mt-1 text-[11px] font-medium text-danger">{amountError}</Text>}

            <Text className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-500">Cepat</Text>
            <View className="flex-row flex-wrap gap-2">
              {QUICK_AMOUNTS.map((quick) => (
                <Pressable key={quick} onPress={() => setAmountStr(quick.toLocaleString('id-ID'))} className="rounded-full border border-ink-200 bg-white px-3 py-2">
                  <Text className="text-xs font-semibold text-ink-700">{formatRupiah(quick)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

        <View className="border-t border-ink-100 bg-white px-4 py-3">
          <Pressable
            onPress={submit}
            disabled={submitting || !selectedBankAccountId || amount <= 0 || !!amountError || hasPendingWithdrawal}
            className={`items-center rounded-2xl py-4 ${submitting || !selectedBankAccountId || amount <= 0 || !!amountError || hasPendingWithdrawal ? 'bg-ink-300' : 'bg-blue-600'}`}
          >
            {submitting ? <ActivityIndicator color="white" /> : <Text className="text-sm font-bold text-white">Kirim Penarikan</Text>}
          </Pressable>
        </View>
      </View>
    </>
  );
}

export default withAuth(WithdrawCustomer, 'customer');

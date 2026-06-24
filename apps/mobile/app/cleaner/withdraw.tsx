import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, Building2, CheckCircle2, CreditCard, Plus, User, Wallet, Zap } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, validateMinLength } from '../../src/components/Field';
import { MaintenanceBanner } from '../../src/components/MaintenanceBanner';
import { formatRupiah } from '../../src/data/catalog';
import { api } from '../../src/lib/api';
import { MIN_WITHDRAW, useCleanerWalletStore } from '../../src/stores/cleanerWallet';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { withCleanerKyc } from '../../src/components/CleanerKycGate';
import { safeBack } from '../../src/lib/safeBack';

type VerifiedAccount = {
  id: string;
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
  isVerified: boolean;
  isDefault: boolean;
};

const METHODS = [
  { code: 'bca', label: 'BCA', kind: 'bank' },
  { code: 'mandiri', label: 'Mandiri', kind: 'bank' },
  { code: 'bni', label: 'BNI', kind: 'bank' },
  { code: 'bri', label: 'BRI', kind: 'bank' },
  { code: 'gopay', label: 'GoPay', kind: 'ewallet' },
  { code: 'ovo', label: 'OVO', kind: 'ewallet' },
  { code: 'dana', label: 'DANA', kind: 'ewallet' },
] as const;

const QUICK_AMOUNTS = [50_000, 100_000, 250_000, 500_000];
const BANK_TRANSFER_FEE = 2_500;
const EWALLET_TRANSFER_FEE = 4_000;

function Withdraw() {
  const router = useRouter();
  // Pakai effectiveBalance - server authoritative kalau sudah sync, fallback
  // ke local. Konsisten dgn earnings tab & wallet page.
  const balance = useCleanerWalletStore((s) => s.effectiveBalance());
  const requestWithdrawalApi = useCleanerWalletStore((s) => s.requestWithdrawalApi);
  const addWithdrawal = useCleanerWalletStore((s) => s.addWithdrawal);
  const [submitting, setSubmitting] = useState(false);

  const [methodCode, setMethodCode] = useState<string>('bca');
  const [account, setAccount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [errors, setErrors] = useState<{
    account?: string | null;
    accountName?: string | null;
    amount?: string | null;
  }>({});

  // Verified bank accounts (preferred - auto-Flip transfer)
  const [verifiedAccounts, setVerifiedAccounts] = useState<VerifiedAccount[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  // Live bank health status dari Flip - utk indicator + safeguard submit.
  const [bankHealth, setBankHealth] = useState<Record<string, 'normal' | 'delayed' | 'down'>>({});
  const [successModal, setSuccessModal] = useState<{ amount: number; autoDisburse: boolean; fee?: number; transferAmount?: number } | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const r = await api.get('/cleaner/bank-accounts');
      const list = (r.data?.data ?? r.data ?? []) as VerifiedAccount[];
      const verified = list.filter((a) => a.isVerified);
      setVerifiedAccounts(verified);
      // Auto-select kalau belum ada selection atau selection lama udh ke-hapus.
      setSelectedBankAccountId((cur) => {
        if (cur && verified.some((a) => a.id === cur)) return cur;
        return verified.find((a) => a.isDefault)?.id ?? verified[0]?.id ?? null;
      });
    } catch {
      /* ignore */
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // Re-fetch tiap kali halaman dapat focus -> setelah user tambah rekening
  // di bank-accounts page lalu back ke sini, list auto-refresh tanpa perlu
  // manual reload.
  useFocusEffect(useCallback(() => { void loadAccounts(); }, [loadAccounts]));

  useEffect(() => {
    // Fetch bank health (Flip live status) sekali aja - jarang berubah.
    api.get('/payments/bank-health').then((r) => {
      const list: { code: string; status: 'normal' | 'delayed' | 'down' }[] = r.data?.data ?? r.data ?? [];
      const map: Record<string, 'normal' | 'delayed' | 'down'> = {};
      list.forEach((b) => { map[b.code] = b.status; });
      setBankHealth(map);
    }).catch(() => {});
  }, []);

  // Cek apakah selected account lagi gangguan
  const selectedAccount = verifiedAccounts.find((a) => a.id === selectedBankAccountId);
  const selectedBankStatus = selectedAccount ? bankHealth[selectedAccount.bankCode.toLowerCase()] : undefined;
  const selectedMethodKind = selectedAccount && ['gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'].includes(selectedAccount.bankCode.toLowerCase())
    ? 'ewallet'
    : 'bank';

  const method = METHODS.find((m) => m.code === methodCode) ?? METHODS[0]!;
  const amount = Number(amountStr.replace(/\D/g, '')) || 0;
  const fee = selectedMethodKind === 'ewallet' ? EWALLET_TRANSFER_FEE : BANK_TRANSFER_FEE;
  const receive = Math.max(0, amount - fee);

  function submit() {
    // WAJIB pakai rekening verified - manual input dihapus.
    // Hindari redundan ngetik (user udh tambah rekening + verifikasi nama, masa
    // ngetik lagi pas tarik) + cegah typo nominal rekening salah kirim ke org lain.
    if (!selectedBankAccountId) {
      toast.error('Pilih rekening tersimpan dulu. Kalau belum ada, tambah di "Kelola Rekening".');
      return;
    }
    // SAFEGUARD: cegah submit kalau bank tujuan lagi DOWN.
    if (selectedBankStatus === 'down') {
      toast.error(`${selectedAccount?.bankCode.toUpperCase() ?? 'Bank'} sedang gangguan. Pilih rekening lain atau tunggu sampai normal.`);
      return;
    }
    const e = { amount: amount < MIN_WITHDRAW ? `Minimum tarik ${formatRupiah(MIN_WITHDRAW)}` : amount > balance ? 'Jumlah melebihi saldo' : null };
    setErrors(e);
    if (e.amount) {
      toast.error('Lengkapi jumlah yang ingin ditarik');
      return;
    }
    setSubmitting(true);
    const destination = { bankAccountId: selectedBankAccountId };
    requestWithdrawalApi(amount, destination)
      .then((res) => {
        addWithdrawal(amount, {
          method: selectedAccount?.bankCode.toUpperCase() ?? method.label,
          account: selectedAccount?.accountNumber ?? '',
          name: selectedAccount?.accountHolderName ?? '',
        });
        setSuccessModal({ amount, autoDisburse: res.autoDisburse, fee: res.fee, transferAmount: res.transferAmount });
      })
      .catch((err: any) => {
        const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Gagal request penarikan';
        toast.error(msg);
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Success Modal */}
      <Modal visible={!!successModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', maxWidth: 340 }}>
            <View style={{ backgroundColor: '#D1FAE5', borderRadius: 999, padding: 20, marginBottom: 16 }}>
              <CheckCircle2 color="#059669" size={48} />
            </View>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0F172A', marginBottom: 8 }}>Penarikan Berhasil!</Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 22, color: '#1D4ED8', marginBottom: 4 }}>{formatRupiah(successModal?.amount ?? 0)}</Text>
            {successModal?.autoDisburse ? (
              <>
                {successModal.fee ? (
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', textAlign: 'center', marginBottom: 4 }}>
                    Biaya admin: {formatRupiah(successModal.fee)} · Diterima: {formatRupiah(successModal.transferAmount ?? (successModal.amount - (successModal.fee ?? 0)))}
                  </Text>
                ) : null}
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20 }}>
                  Dana sedang diproses transfer otomatis. Tiba dalam beberapa menit.
                </Text>
              </>
            ) : (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20 }}>
                Permintaan tarik diterima. Admin akan memproses segera.
              </Text>
            )}
            <Pressable
              onPress={() => { setSuccessModal(null); safeBack(); }}
              style={{ backgroundColor: '#1D4ED8', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: 'white' }}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-brand-700">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="white" size={22} />
            </Pressable>
            <View className="ml-1 flex-1">
              <Text className="font-bold text-base text-white">Tarik Saldo</Text>
              <Text className="font-medium text-[11px] text-white/70">
                Saldo: {formatRupiah(balance)}
              </Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
          {/* Banner gangguan bank - admin set di app_config:
              'payment.maintenance_notice'. Cleaner aware kalau transfer
              mungkin tertunda karena bank maintenance. */}
          <View className="mb-3">
            <MaintenanceBanner />
          </View>

          {/* Verified accounts (preferred) */}
          {!loadingAccounts && verifiedAccounts.length > 0 && (
            <Section title="Rekening Tersimpan (Auto-Transfer)">
              <View className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 mb-3 flex-row gap-2">
                <Zap color="#059669" size={18} />
                <Text className="flex-1 text-xs text-emerald-900 leading-5">
                  Pilih rekening verified agar dana otomatis ditransfer dalam beberapa menit. Biaya admin Rp 2.500 untuk bank dan Rp 4.000 untuk e-wallet.
                </Text>
              </View>
              <View className="gap-2">
                {verifiedAccounts.map((acc) => {
                  const selected = selectedBankAccountId === acc.id;
                  const status = bankHealth[acc.bankCode.toLowerCase()];
                  const isDown = status === 'down';
                  const isDelayed = status === 'delayed';
                  return (
                    <Pressable
                      key={acc.id}
                      onPress={() => !isDown && setSelectedBankAccountId(acc.id)}
                      disabled={isDown}
                      className={`flex-row items-center gap-3 p-3 rounded-xl border ${
                        isDown ? 'bg-rose-50 border-rose-200 opacity-60' :
                        selected ? 'bg-blue-50 border-blue-500' : 'bg-white border-ink-200'
                      }`}
                    >
                      <View className={`h-9 w-9 rounded-full items-center justify-center ${selected ? 'bg-blue-600' : 'bg-blue-100'}`}>
                        <Building2 color={selected ? 'white' : '#1D4ED8'} size={18} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-sm font-bold text-ink-900">{acc.bankCode.toUpperCase()}</Text>
                          {acc.isDefault && <Text className="text-[10px] text-amber-600 font-semibold">Default</Text>}
                          {isDown && (
                            <View className="bg-rose-200 px-1.5 py-0.5 rounded">
                              <Text className="text-[9px] font-bold text-rose-800">GANGGUAN</Text>
                            </View>
                          )}
                          {isDelayed && (
                            <View className="bg-amber-200 px-1.5 py-0.5 rounded">
                              <Text className="text-[9px] font-bold text-amber-900">LAMBAT</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-xs text-ink-600">{acc.accountNumber} - {acc.accountHolderName}</Text>
                        {isDown && (
                          <Text className="text-[10px] text-rose-700 mt-0.5">Bank lagi maintenance. Pilih lain.</Text>
                        )}
                      </View>
                      {selected && !isDown && <CheckCircle2 color="#1D4ED8" size={20} />}
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => router.push('/cleaner/bank-accounts')}
                  className="mt-2 flex-row items-center justify-center gap-1 py-2"
                >
                  <Plus color="#1D4ED8" size={14} />
                  <Text className="text-xs font-bold text-blue-700">Tambah / kelola rekening</Text>
                </Pressable>
              </View>
            </Section>
          )}

          {!loadingAccounts && verifiedAccounts.length === 0 && (
            <View className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-3 flex-row gap-2">
              <BadgeCheck color="#D97706" size={18} />
              <View className="flex-1">
                <Text className="text-xs text-amber-900 leading-5">
                  Tambah rekening atas nama kamu agar penarikan bisa diproses otomatis dalam beberapa menit.
                </Text>
                <Pressable
                  onPress={() => router.push('/cleaner/bank-accounts')}
                  className="mt-2 self-start bg-amber-600 px-3 py-1.5 rounded-lg"
                >
                  <Text className="text-white font-bold text-xs">+ Tambah Rekening</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Manual bank input disabled - cleaner harus pilih rekening verified. */}
          {false && selectedBankAccountId === null && (
          <>
          <Section title="Pilih Tujuan">
            <Text className="font-semibold mb-2 text-[10px] uppercase tracking-wider text-ink-500">
              Bank
            </Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {METHODS.filter((m) => m.kind === 'bank').map((m) => (
                <Chip
                  key={m.code}
                  label={m.label}
                  active={m.code === methodCode}
                  icon={Building2}
                  onPress={() => setMethodCode(m.code)}
                />
              ))}
            </View>
            <Text className="font-semibold mb-2 text-[10px] uppercase tracking-wider text-ink-500">
              E-Wallet
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {METHODS.filter((m) => m.kind === 'ewallet').map((m) => (
                <Chip
                  key={m.code}
                  label={m.label}
                  active={m.code === methodCode}
                  icon={Wallet}
                  onPress={() => setMethodCode(m.code)}
                />
              ))}
            </View>
          </Section>

          {/* Detail rekening */}
          <Section title="Detail Akun">
            <View className="gap-3">
              <Field
                label={method.kind === 'bank' ? 'Nomor Rekening' : 'Nomor HP / ID'}
                required
                error={errors.account}
              >
                <CreditCard color="#94A3B8" size={18} />
                <TextInput
                  value={account}
                  onChangeText={(v) => {
                    setAccount(v);
                    if (errors.account) setErrors({ ...errors, account: null });
                  }}
                  placeholder={method.kind === 'bank' ? '1234567890' : '08xxxxxxxxxx'}
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={20}
                  className="font-sans flex-1 text-sm text-ink-900"
                />
              </Field>

              <Field label="Nama Pemilik (sesuai rekening)" required error={errors.accountName}>
                <User color="#94A3B8" size={18} />
                <TextInput
                  value={accountName}
                  onChangeText={(v) => {
                    setAccountName(v);
                    if (errors.accountName) setErrors({ ...errors, accountName: null });
                  }}
                  placeholder="Nama lengkap"
                  placeholderTextColor="#94A3B8"
                  maxLength={50}
                  className="font-sans flex-1 text-sm text-ink-900"
                />
              </Field>
            </View>
          </Section>
          </>
          )}

          {/* Jumlah */}
          <Section title="Jumlah Penarikan">
            <View className="flex-row items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3">
              <Text className="font-bold text-base text-ink-700">Rp</Text>
              <TextInput
                value={amountStr}
                onChangeText={(v) => {
                  const clean = v.replace(/\D/g, '');
                  setAmountStr(clean ? Number(clean).toLocaleString('id-ID') : '');
                  if (errors.amount) setErrors({ ...errors, amount: null });
                }}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                maxLength={12}
                className="font-bold flex-1 text-lg text-ink-900"
              />
            </View>
            {errors.amount && (
              <Text className="font-medium mt-1 text-[11px] text-danger">{errors.amount}</Text>
            )}

            <Text className="font-semibold mt-3 mb-2 text-[10px] uppercase tracking-wider text-ink-500">
              Cepat
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <Pressable
                  key={a}
                  onPress={() => {
                    setAmountStr(a.toLocaleString('id-ID'));
                    if (errors.amount) setErrors({ ...errors, amount: null });
                  }}
                  disabled={a > balance}
                  className={`rounded-full border px-3 py-1.5 ${
                    a > balance
                      ? 'border-ink-200 bg-ink-100 opacity-50'
                      : 'border-brand-200 bg-brand-50'
                  }`}
                >
                  <Text
                    className={`font-semibold text-xs ${
                      a > balance ? 'text-ink-400' : 'text-brand-700'
                    }`}
                  >
                    {formatRupiah(a)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  setAmountStr(balance.toLocaleString('id-ID'));
                  if (errors.amount) setErrors({ ...errors, amount: null });
                }}
                className="rounded-full border border-brand-300 bg-brand-100 px-3 py-1.5"
              >
                <Text className="font-bold text-xs text-brand-700">Tarik Semua</Text>
              </Pressable>
            </View>
          </Section>

          {/* Ringkasan */}
          {amount > 0 && (
            <View className="mt-3 rounded-2xl bg-white p-4">
              <Text className="font-bold text-sm text-ink-900">Ringkasan</Text>
              <View className="mt-3 gap-2">
                <Row label="Jumlah ditarik" value={formatRupiah(amount)} />
                <Row
                  label={`Biaya ${selectedMethodKind === 'ewallet' ? 'E-Wallet' : 'Transfer Bank'}`}
                  value={fee > 0 ? `-${formatRupiah(fee)}` : 'Gratis'}
                />
                <View className="border-t border-ink-100 pt-2">
                  <Row label="Diterima" value={formatRupiah(receive)} bold />
                </View>
              </View>
              <Text className="font-sans mt-2 text-[10px] text-ink-500">
                Tujuan: {selectedAccount?.bankCode.toUpperCase() ?? method.label} � {selectedAccount?.accountNumber ?? '(pilih rekening dulu)'} a.n. {selectedAccount?.accountHolderName ?? '...'}
              </Text>
            </View>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
          <SafeAreaView edges={['bottom']}>
            <View className="p-4">
              <Pressable onPress={submit} className="rounded-2xl bg-brand-600 py-3.5">
                <Text className="font-bold text-center text-sm text-white">
                  Tarik {amount > 0 ? formatRupiah(amount) : ''}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-3 rounded-2xl bg-white p-4">
      <Text className="font-bold mb-3 text-sm text-ink-900">{title}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  icon: Icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${
        active ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
      }`}
    >
      <Icon color={active ? 'white' : '#64748B'} size={14} strokeWidth={2.4} />
      <Text className={`font-semibold text-xs ${active ? 'text-white' : 'text-ink-700'}`}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className={`text-sm ${bold ? 'font-bold text-ink-900' : 'font-sans text-ink-600'}`}>
        {label}
      </Text>
      <Text className={`text-sm ${bold ? 'font-bold text-success' : 'font-semibold text-ink-800'}`}>
        {value}
      </Text>
    </View>
  );
}


export default withAuth(withCleanerKyc(Withdraw), 'freelancer');


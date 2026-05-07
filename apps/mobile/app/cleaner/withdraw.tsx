import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Building2, CreditCard, User, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, validateMinLength } from '../../src/components/Field';
import { formatRupiah } from '../../src/data/catalog';
import { MIN_WITHDRAW, useCleanerWalletStore } from '../../src/stores/cleanerWallet';
import { toast } from '../../src/stores/ui';

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

export default function Withdraw() {
  const router = useRouter();
  const balance = useCleanerWalletStore((s) => s.balance());
  const addWithdrawal = useCleanerWalletStore((s) => s.addWithdrawal);

  const [methodCode, setMethodCode] = useState<string>('bca');
  const [account, setAccount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [errors, setErrors] = useState<{
    account?: string | null;
    accountName?: string | null;
    amount?: string | null;
  }>({});

  const method = METHODS.find((m) => m.code === methodCode) ?? METHODS[0]!;
  const amount = Number(amountStr.replace(/\D/g, '')) || 0;
  const fee = method.kind === 'bank' ? 4_000 : 0;
  const receive = Math.max(0, amount - fee);

  function submit() {
    const e = {
      account: validateMinLength(account, 6, 'Nomor rekening'),
      accountName: validateMinLength(accountName, 2, 'Nama pemilik'),
      amount:
        amount < MIN_WITHDRAW
          ? `Minimum tarik ${formatRupiah(MIN_WITHDRAW)}`
          : amount > balance
            ? 'Jumlah melebihi saldo'
            : null,
    };
    setErrors(e);
    if (e.account || e.accountName || e.amount) {
      toast.error('Lengkapi data yang masih kosong/salah');
      return;
    }
    addWithdrawal(amount, { method: method.label, account, name: accountName });
    toast.success('Penarikan berhasil dikirim. Diproses ~5 menit.');
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-brand-700">
          <View className="flex-row items-center px-3 py-2">
            <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
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
          {/* Pilih metode */}
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
                  className="font-sans flex-1 text-sm text-ink-900"
                />
              </Field>
            </View>
          </Section>

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
                  label={`Biaya ${method.kind === 'bank' ? 'Transfer Bank' : 'E-Wallet'}`}
                  value={fee > 0 ? `-${formatRupiah(fee)}` : 'Gratis'}
                />
                <View className="border-t border-ink-100 pt-2">
                  <Row label="Diterima" value={formatRupiah(receive)} bold />
                </View>
              </View>
              <Text className="font-sans mt-2 text-[10px] text-ink-500">
                Tujuan: {method.label} · {account || '(belum diisi)'} a.n. {accountName || '...'}
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

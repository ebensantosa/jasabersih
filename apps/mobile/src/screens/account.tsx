import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  CreditCard,
  HelpCircle,
  Info,
  Lock,
  MapPin,
  Moon,
  Plus,
  Settings as SettingsIcon,
  Shield,
  Smartphone,
  Wallet,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatRupiah } from '../data/catalog';
import { storage } from '../lib/storage';
import { currentVersion, evaluateUpdate, fetchUpdateInfo } from '../lib/versionCheck';
import { useAddressesStore } from '../stores/addresses';
import { toast } from '../stores/ui';
import { safeBack } from '../lib/safeBack';

export function AccountLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-ink-50">
      <SafeAreaView edges={['top']} className="bg-brand-700">
        <View className="flex-row items-center px-3 py-2">
          <Pressable
            onPress={() => safeBack()}
            className="h-10 w-10 items-center justify-center"
          >
            <ArrowLeft color="white" size={22} />
          </Pressable>
          <Text className="font-bold ml-1 text-base text-white">{title}</Text>
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>{children}</ScrollView>
    </View>
  );
}

export function Addresses() {
  const router = useRouter();
  const list = useAddressesStore((s) => s.list);
  const setDefault = useAddressesStore((s) => s.setDefault);
  const remove = useAddressesStore((s) => s.remove);

  return (
    <>
      <Pressable
        onPress={() => router.push('/addresses/edit')}
        className="flex-row items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 py-4"
      >
        <Plus color="#1D4ED8" size={18} strokeWidth={2.4} />
        <Text className="font-semibold text-sm text-brand-700">Tambah Alamat Baru</Text>
      </Pressable>
      {list.length === 0 ? (
        <View className="items-center rounded-2xl bg-white p-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-ink-100">
            <MapPin color="#94A3B8" size={24} strokeWidth={2} />
          </View>
          <Text className="font-semibold mt-3 text-sm text-ink-700">Belum ada alamat</Text>
          <Text className="font-sans mt-1 text-center text-xs text-ink-500">
            Simpan alamat agar booking lebih cepat — tinggal pilih saat checkout
          </Text>
        </View>
      ) : (
        list.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => router.push({ pathname: '/addresses/edit', params: { id: a.id } })}
            className="rounded-2xl bg-white p-4"
          >
            <View className="flex-row items-center gap-2">
              <MapPin color="#1D4ED8" size={16} strokeWidth={2.2} />
              <Text className="font-bold text-sm text-ink-900">{a.label}</Text>
              {a.isDefault && (
                <View className="rounded-full bg-brand-100 px-2 py-0.5">
                  <Text className="font-bold text-[10px] text-brand-700">UTAMA</Text>
                </View>
              )}
            </View>
            <Text className="font-medium mt-1 text-xs text-ink-700">
              {a.recipientName} · {a.recipientPhone}
            </Text>
            <Text className="font-sans mt-0.5 text-[11px] text-ink-500" numberOfLines={2}>
              {a.addressLine}
            </Text>
            {a.detailNote && (
              <Text className="font-sans mt-0.5 text-[10px] text-ink-400" numberOfLines={1}>
                Detail: {a.detailNote}
              </Text>
            )}
            <View className="mt-2 flex-row gap-2">
              {!a.isDefault && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    setDefault(a.id);
                    toast.success('Set sebagai alamat utama');
                  }}
                  className="rounded-lg bg-brand-50 px-3 py-1.5"
                >
                  <Text className="font-semibold text-[11px] text-brand-700">Jadikan Utama</Text>
                </Pressable>
              )}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  remove(a.id);
                  toast.info('Alamat dihapus');
                }}
                className="rounded-lg bg-red-50 px-3 py-1.5"
              >
                <Text className="font-semibold text-[11px] text-danger">Hapus</Text>
              </Pressable>
            </View>
          </Pressable>
        ))
      )}
    </>
  );
}

export function WalletScreen() {
  return (
    <>
      <View className="rounded-2xl bg-brand-700 p-5">
        <Text className="font-medium text-xs text-white/70">Saldo Wallet</Text>
        <Text className="font-bold mt-1 text-3xl text-white">{formatRupiah(0)}</Text>
        <View className="mt-4 flex-row gap-2">
          <Pressable
            onPress={() => toast.comingSoon()}
            className="flex-1 rounded-xl bg-white/15 py-2.5"
          >
            <Text className="font-semibold text-center text-xs text-white">Top Up</Text>
          </Pressable>
          <Pressable
            onPress={() => toast.comingSoon()}
            className="flex-1 rounded-xl bg-white py-2.5"
          >
            <Text className="font-semibold text-center text-xs text-brand-700">Tarik</Text>
          </Pressable>
        </View>
      </View>

      <View className="rounded-2xl bg-white p-4">
        <Text className="font-bold text-sm text-ink-900">Metode Pembayaran</Text>
        <View className="mt-3 gap-2">
          {['QRIS', 'GoPay', 'OVO', 'BCA Virtual Account', 'Kartu Kredit'].map((m, i, arr) => (
            <Pressable
              key={m}
              onPress={() => toast.comingSoon()}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                borderBottomColor: '#F1F5F9',
              }}
            >
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                <CreditCard color="#1D4ED8" size={16} strokeWidth={2.2} />
              </View>
              <Text className="font-medium flex-1 text-sm text-ink-800">{m}</Text>
              <ChevronRight color="#CBD5E1" size={16} />
            </Pressable>
          ))}
        </View>
      </View>

      <View className="rounded-2xl bg-white p-4">
        <Text className="font-bold mb-3 text-sm text-ink-900">Riwayat Transaksi</Text>
        <Text className="font-sans py-4 text-center text-xs text-ink-500">Belum ada transaksi</Text>
      </View>
    </>
  );
}

export function Notifications() {
  const [push, setPush] = useState(true);
  const [promo, setPromo] = useState(true);
  const [order, setOrder] = useState(true);
  const [email, setEmail] = useState(false);
  return (
    <>
      <View className="rounded-2xl bg-white p-1">
        <ToggleRow icon={Bell} label="Notifikasi Push" value={push} onChange={setPush} />
        <ToggleRow icon={Info} label="Update Pesanan" value={order} onChange={setOrder} />
        <ToggleRow icon={Bell} label="Promo & Voucher" value={promo} onChange={setPromo} />
        <ToggleRow icon={Bell} label="Email Marketing" value={email} onChange={setEmail} last />
      </View>
      <Text className="font-sans px-2 text-xs text-ink-500">
        Kami akan tetap kirim notifikasi penting (booking confirmed, cleaner OTW, dll) walau push
        dimatikan.
      </Text>
    </>
  );
}

export function Security() {
  const router = useRouter();
  return (
    <>
      <View className="rounded-2xl bg-white">
        <Row icon={Lock} label="Ganti Password" onPress={() => router.push('/account/change-password')} last />
      </View>
      <View className="rounded-2xl bg-white">
        <Row icon={Info} label="Kebijakan Privasi" onPress={() => router.push('/account/privacy')} />
        <Row icon={Info} label="Syarat & Ketentuan" onPress={() => router.push('/account/terms')} />
        <Row icon={Info} label="Tentang JasaBersih" onPress={() => router.push('/account/about')} />
        <Row icon={Info} label="Hapus Akun" danger last />
      </View>
    </>
  );
}

export function Help() {
  const router = useRouter();
  return (
    <>
      <View className="rounded-2xl bg-brand-50 p-4">
        <Text className="font-bold text-sm text-brand-900">Butuh bantuan langsung?</Text>
        <Text className="font-sans mt-1 text-xs text-brand-800">
          CS kami online 08:00–22:00 setiap hari.
        </Text>
        <Pressable
          onPress={() => toast.info('CS akan menghubungi melalui chat in-app')}
          className="mt-3 self-start rounded-xl bg-brand-600 px-4 py-2.5"
        >
          <Text className="font-semibold text-xs text-white">Chat dengan CS</Text>
        </Pressable>
      </View>
      <View className="rounded-2xl bg-white">
        <Row icon={Info} label="FAQ Lengkap" onPress={() => router.push('/account/faq')} />
        <Row icon={Info} label="Syarat & Ketentuan" onPress={() => router.push('/account/terms')} />
        <Row icon={Info} label="Kebijakan Privasi" onPress={() => router.push('/account/privacy')} />
        <Row icon={Info} label="Tentang JasaBersih" onPress={() => router.push('/account/about')} last />
      </View>
    </>
  );
}

export function SettingsView() {
  const [dark, setDark] = useState(false);
  const [checking, setChecking] = useState(false);

  async function checkUpdate() {
    setChecking(true);
    try {
      const info = await fetchUpdateInfo();
      if (!info) {
        toast.error('Gagal cek update');
        return;
      }
      const { hasUpdate } = evaluateUpdate(info);
      if (hasUpdate) {
        storage.delete('update.skipped');
        toast.info(`Versi baru ${info.latestVersion} tersedia!`);
      } else {
        toast.success('Sudah versi terbaru');
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <View className="rounded-2xl bg-white p-1">
        <ToggleRow icon={Moon} label="Mode Gelap" value={dark} onChange={setDark} last />
      </View>
      <View className="rounded-2xl bg-white">
        <Row icon={SettingsIcon} label="Bahasa" valueLabel="Indonesia" />
        <Row
          icon={SettingsIcon}
          label={checking ? 'Mengecek update…' : 'Cek Versi Terbaru'}
          valueLabel={`v${currentVersion()}`}
          onPress={checkUpdate}
        />
        <Row icon={SettingsIcon} label="Tentang Aplikasi" last />
      </View>
    </>
  );
}

function Row({
  icon: Icon,
  label,
  valueLabel,
  danger,
  onPress,
  last,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  valueLabel?: string;
  danger?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress ?? (() => toast.comingSoon())}
      style={({ pressed }) => ({
        opacity: pressed ? 0.6 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: '#F1F5F9',
      })}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-ink-50">
        <Icon color={danger ? '#DC2626' : '#475569'} size={18} strokeWidth={2.2} />
      </View>
      <Text className={`font-medium flex-1 text-sm ${danger ? 'text-danger' : 'text-ink-800'}`}>
        {label}
      </Text>
      {valueLabel ? <Text className="font-medium text-xs text-ink-400">{valueLabel}</Text> : null}
      <ChevronRight color="#CBD5E1" size={18} />
    </Pressable>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  value,
  onChange,
  last,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: '#F1F5F9',
      }}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-ink-50">
        <Icon color="#475569" size={18} strokeWidth={2.2} />
      </View>
      <Text className="font-medium flex-1 text-sm text-ink-800">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: '#2563EB', false: '#CBD5E1' }}
        thumbColor="white"
      />
    </View>
  );
}

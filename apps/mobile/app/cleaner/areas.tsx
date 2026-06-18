import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Check, Lightbulb, MapPin, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../src/lib/api';
import { useAppContent } from '../../src/stores/appContent';
import { useCleanerStore } from '../../src/stores/cleaner';
import { toast } from '../../src/stores/ui';
import { withAuth } from '../../src/components/AuthGate';
import { withCleanerKyc } from '../../src/components/CleanerKycGate';
import { safeBack } from '../../src/lib/safeBack';

function CleanerAreas() {
  const router = useRouter();
  const areas = useCleanerStore((s) => s.serviceAreas);
  const toggle = useCleanerStore((s) => s.toggleArea);
  const setAreas = useCleanerStore((s) => s.setAreas);
  const [showRequestCity, setShowRequestCity] = useState(false);
  const [requestCityName, setRequestCityName] = useState('');

  async function requestNewCity() {
    const name = requestCityName.trim();
    if (name.length < 2) { toast.error('Nama kota min 2 karakter'); return; }
    try {
      await api.post('/app/city-requests', {
        city: name,
        source: 'cleaner',
        notes: 'Cleaner request kota tambahan dari halaman Area Layananku',
      });
      toast.success(`Permintaan kota "${name}" dikirim. Admin akan review.`);
      setShowRequestCity(false);
      setRequestCityName('');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim request');
    }
  }

  // Source of truth: service_areas dari CMS. Dedupe by city. Kalau admin
  // belum config any, default tampil [] supaya cleaner gak bisa pilih kota
  // yang belum dilayani perusahaan.
  const serviceAreas = useAppContent((s) => s.content.serviceAreas);
  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const a of serviceAreas) if (a.city) set.add(a.city);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [serviceAreas]);

  async function save() {
    if (areas.length === 0) {
      toast.warning('Pilih minimal 1 area');
      return;
    }
    try {
      // Sync to backend so /cleaner/jobs/available filters by these.
      await api.patch('/cleaner/profile', { serviceAreas: areas });
      toast.success(`${areas.length} area tersimpan`);
      safeBack();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal simpan ke server');
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-ink-50">
        <SafeAreaView edges={['top']} className="bg-white">
          <View className="flex-row items-center border-b border-ink-100 px-3 py-2">
            <Pressable onPress={() => safeBack()} className="h-10 w-10 items-center justify-center">
              <ArrowLeft color="#0F172A" size={22} />
            </Pressable>
            <View className="ml-1 flex-1">
              <Text className="font-bold text-base text-ink-900">Area Layananku</Text>
              <Text className="font-medium text-[11px] text-ink-500">
                {areas.length} dari {cities.length} kota dipilih
              </Text>
            </View>
            {areas.length > 0 && (
              <Pressable onPress={() => setAreas([])} className="px-2 py-1">
                <Text className="font-semibold text-xs text-danger">Reset</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <View className="flex-row items-start gap-2 rounded-2xl bg-brand-50 p-3">
            <Lightbulb color="#1D4ED8" size={16} />
            <View className="flex-1">
              <Text className="font-semibold text-xs text-brand-900">Tips</Text>
              <Text className="font-sans mt-1 text-[11px] leading-4 text-brand-900">
                Pilih kota yang kamu sanggup datangi. Kamu hanya akan menerima job dari area ini.
              </Text>
            </View>
          </View>

          <Text className="font-semibold mt-4 mb-2 text-[11px] uppercase tracking-wider text-ink-500">
            Pilih Kota
          </Text>
          {cities.length === 0 ? (
            <View className="rounded-2xl bg-white p-6 items-center">
              <Text className="font-sans text-center text-[11px] text-ink-500">
                Belum ada kota yang dilayani. Hubungi admin untuk konfirmasi.
              </Text>
              <Pressable
                onPress={() => setShowRequestCity(true)}
                className="mt-3 flex-row items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5"
              >
                <Plus color="#1D4ED8" size={14} />
                <Text className="font-bold text-[12px] text-brand-700">Request Kota Baru</Text>
              </Pressable>
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl bg-white">
              {cities.map((c, i) => {
                const active = areas.includes(c);
                return (
                  <Pressable
                    key={c}
                    onPress={() => toggle(c)}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${
                      i < cities.length - 1 ? 'border-b border-ink-100' : ''
                    }`}
                  >
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-xl ${
                        active ? 'bg-brand-600' : 'bg-ink-100'
                      }`}
                    >
                      <MapPin color={active ? 'white' : '#64748B'} size={16} strokeWidth={2.2} />
                    </View>
                    <Text
                      className={`font-medium flex-1 text-sm ${
                        active ? 'text-brand-700' : 'text-ink-800'
                      }`}
                    >
                      {c}
                    </Text>
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                        active ? 'border-brand-600 bg-brand-600' : 'border-ink-300'
                      }`}
                    >
                      {active && <Check color="white" size={14} strokeWidth={3} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {cities.length > 0 && (
            <Pressable
              onPress={() => setShowRequestCity(true)}
              className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 py-3"
            >
              <Plus color="#1D4ED8" size={14} />
              <Text className="font-bold text-[12px] text-brand-700">Kota saya belum ada? Request ke admin</Text>
            </Pressable>
          )}
        </ScrollView>

        <Modal visible={showRequestCity} transparent animationType="fade" onRequestClose={() => setShowRequestCity(false)}>
          <Pressable onPress={() => setShowRequestCity(false)} className="flex-1 items-center justify-center bg-black/50 px-6">
            <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5">
              <Text className="font-extrabold text-lg text-ink-900">Request Kota Baru</Text>
              <Text className="font-medium mt-1 text-[12px] text-ink-600">
                Admin akan review. Setelah diapprove, kota akan tampil di daftar pilihan.
              </Text>
              <View className="mt-3">
                <Text className="font-semibold mb-1 text-[11px] text-ink-700">Nama Kota</Text>
                <TextInput
                  value={requestCityName}
                  onChangeText={setRequestCityName}
                  placeholder="Contoh: Surabaya"
                  placeholderTextColor="#94A3B8"
                  className="font-sans rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900"
                />
              </View>
              <View className="mt-4 flex-row gap-2">
                <Pressable onPress={() => setShowRequestCity(false)} className="flex-1 rounded-xl border border-ink-200 bg-white py-3">
                  <Text className="font-bold text-center text-sm text-ink-700">Batal</Text>
                </Pressable>
                <Pressable onPress={requestNewCity} className="flex-1 rounded-xl bg-brand-600 py-3">
                  <Text className="font-bold text-center text-sm text-white">Kirim Request</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink-200 bg-white">
          <SafeAreaView edges={['bottom']}>
            <View className="p-4">
              <Pressable onPress={save} className="rounded-2xl bg-brand-600 py-3.5">
                <Text className="font-bold text-center text-sm text-white">
                  Simpan ({areas.length} area)
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </>
  );
}


export default withAuth(withCleanerKyc(CleanerAreas), 'freelancer');

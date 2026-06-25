import { Stack } from 'expo-router';
import { ArrowLeft, Check, Lightbulb, MapPin, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
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
  const areas = useCleanerStore((s) => s.serviceAreas);
  const setAreas = useCleanerStore((s) => s.setAreas);
  const [showRequestArea, setShowRequestArea] = useState(false);
  const [showRequestNewCity, setShowRequestNewCity] = useState(false);
  const [requestCityName, setRequestCityName] = useState('');
  const [pendingRequests, setPendingRequests] = useState<{ id: string; city: string; action: 'add' | 'remove' }[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [submittingRemove, setSubmittingRemove] = useState(false);

  // Refresh dari backend tiap kali screen mount - supaya area yang admin baru
  // approve langsung kelihatan, gak stuck di cache lama.
  async function refreshAreasFromServer() {
    try {
      const r = await api.get('/cleaner/profile');
      const data = (r.data?.data ?? r.data) as any;
      const fromServer = Array.isArray(data?.serviceAreas) ? data.serviceAreas as string[] : [];
      setAreas(fromServer);
    } catch { /* ignore */ }
  }

  async function loadPending() {
    try {
      const r = await api.get('/cleaner/profile/area-requests');
      const list = (r.data?.data ?? r.data ?? []) as any[];
      setPendingRequests(list.map((x) => ({ id: x.id, city: x.city, action: x.action ?? 'add' })));
    } catch { /* ignore */ }
  }
  useEffect(() => { void refreshAreasFromServer(); void loadPending(); }, []);

  async function requestAddArea(city: string) {
    try {
      await api.post('/cleaner/profile/area-requests', { city, action: 'add' });
      toast.success(`Permintaan tambah area "${city}" terkirim. Tunggu approval admin.`);
      setShowRequestArea(false);
      void loadPending();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim request');
    }
  }

  async function submitRemoveArea(city: string) {
    setSubmittingRemove(true);
    try {
      await api.post('/cleaner/profile/area-requests', { city, action: 'remove' });
      toast.success(`Permintaan hapus area "${city}" terkirim. Tunggu approval admin.`);
      setConfirmRemove(null);
      void loadPending();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim request');
    } finally {
      setSubmittingRemove(false);
    }
  }

  async function requestNewCity() {
    const name = requestCityName.trim();
    if (name.length < 2) { toast.error('Nama kota min 2 karakter'); return; }
    try {
      await api.post('/app/city-requests', {
        city: name,
        source: 'cleaner',
        notes: 'Cleaner request kota belum dibuka',
      });
      toast.success(`Permintaan buka kota "${name}" dikirim. Admin akan review.`);
      setShowRequestNewCity(false);
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

  const requestableCities = cities.filter((c) => !areas.includes(c) && !pendingRequests.some((r) => r.city === c));

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
                {areas.length} area aktif {pendingRequests.length > 0 ? `· ${pendingRequests.length} pending` : ''}
              </Text>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <View className="flex-row items-start gap-2 rounded-2xl bg-brand-50 p-3">
            <Lightbulb color="#1D4ED8" size={16} />
            <View className="flex-1">
              <Text className="font-semibold text-xs text-brand-900">Info</Text>
              <Text className="font-sans mt-1 text-[11px] leading-4 text-brand-900">
                Area kerja kamu di-set oleh admin. Kalau mau nambah area, kirim request lewat tombol di bawah.
              </Text>
            </View>
          </View>

          <Text className="font-semibold mt-4 mb-2 text-[11px] uppercase tracking-wider text-ink-500">
            Area Aktif ({areas.length})
          </Text>
          {areas.length === 0 ? (
            <View className="rounded-2xl bg-white p-6 items-center">
              <MapPin color="#94A3B8" size={28} />
              <Text className="font-bold mt-2 text-sm text-ink-700">Belum ada area aktif</Text>
              <Text className="font-sans mt-1 text-center text-[11px] text-ink-500">
                Kirim request ke admin untuk dapat area kerja pertama kamu.
              </Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl bg-white">
              {areas.map((c, i) => {
                const hasPendingRemove = pendingRequests.some((r) => r.action === 'remove' && r.city.toLowerCase() === c.toLowerCase());
                return (
                  <View
                    key={c}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${i < areas.length - 1 ? 'border-b border-ink-100' : ''}`}
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                      <Check color="#047857" size={16} strokeWidth={2.4} />
                    </View>
                    <Text className="font-medium flex-1 text-sm text-ink-800">{c}</Text>
                    {hasPendingRemove ? (
                      <Text className="font-bold text-[10px] uppercase tracking-wider text-amber-700">hapus pending</Text>
                    ) : (
                      <Pressable
                        onPress={() => setConfirmRemove(c)}
                        hitSlop={10}
                        className="flex-row items-center gap-1 rounded-lg bg-red-50 px-2 py-1"
                      >
                        <Trash2 color="#B91C1C" size={12} />
                        <Text className="font-bold text-[10px] text-red-700">Hapus</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {pendingRequests.length > 0 && (
            <>
              <Text className="font-semibold mt-5 mb-2 text-[11px] uppercase tracking-wider text-ink-500">
                Menunggu Approval Admin ({pendingRequests.length})
              </Text>
              <View className="overflow-hidden rounded-2xl bg-white">
                {pendingRequests.map((r, i) => (
                  <View
                    key={r.id}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${i < pendingRequests.length - 1 ? 'border-b border-ink-100' : ''}`}
                  >
                    <View className={`h-9 w-9 items-center justify-center rounded-xl ${r.action === 'remove' ? 'bg-red-100' : 'bg-amber-100'}`}>
                      {r.action === 'remove' ? <Trash2 color="#B91C1C" size={16} strokeWidth={2.2} /> : <MapPin color="#B45309" size={16} strokeWidth={2.2} />}
                    </View>
                    <View className="flex-1">
                      <Text className="font-medium text-sm text-ink-800">{r.city}</Text>
                      <Text className={`font-bold text-[10px] uppercase tracking-wider ${r.action === 'remove' ? 'text-red-700' : 'text-amber-700'}`}>
                        {r.action === 'remove' ? 'Minta Dihapus' : 'Minta Ditambah'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          <Pressable
            onPress={() => setShowRequestArea(true)}
            className="mt-5 flex-row items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 py-3"
          >
            <Plus color="#1D4ED8" size={14} />
            <Text className="font-bold text-[12px] text-brand-700">Request Tambah Area Kerja</Text>
          </Pressable>

          <Pressable
            onPress={() => setShowRequestNewCity(true)}
            className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white py-3"
          >
            <Text className="font-medium text-[11px] text-ink-600">Kotamu belum dibuka? Usul buka kota →</Text>
          </Pressable>
        </ScrollView>

        {/* Modal pilih area dari kota aktif */}
        <Modal visible={showRequestArea} transparent animationType="slide" onRequestClose={() => setShowRequestArea(false)}>
          <Pressable onPress={() => setShowRequestArea(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
            <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' }}>
              <View className="p-5 pb-2">
                <Text className="font-extrabold text-lg text-ink-900">Request Tambah Area</Text>
                <Text className="font-medium mt-1 text-[11px] text-ink-500">
                  Pilih kota dari list di bawah. Admin akan review & approve kalau kamu cocok untuk area itu.
                </Text>
              </View>
              <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                {requestableCities.length === 0 ? (
                  <View className="mx-5 rounded-xl bg-ink-50 p-4 items-center">
                    <Text className="font-sans text-center text-[11px] text-ink-500">
                      Semua kota aktif sudah jadi area kerja kamu (atau sudah di-request).
                    </Text>
                  </View>
                ) : (
                  requestableCities.map((c, i) => (
                    <Pressable
                      key={c}
                      onPress={() => requestAddArea(c)}
                      className={`flex-row items-center gap-3 px-5 py-3.5 ${i < requestableCities.length - 1 ? 'border-b border-ink-100' : ''}`}
                    >
                      <MapPin color="#1D4ED8" size={18} />
                      <Text className="font-semibold flex-1 text-sm text-ink-900">{c}</Text>
                      <Plus color="#1D4ED8" size={16} />
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={showRequestNewCity} transparent animationType="fade" onRequestClose={() => setShowRequestNewCity(false)}>
          <Pressable onPress={() => setShowRequestNewCity(false)} className="flex-1 items-center justify-center bg-black/50 px-6">
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
                <Pressable onPress={() => setShowRequestNewCity(false)} className="flex-1 rounded-xl border border-ink-200 bg-white py-3">
                  <Text className="font-bold text-center text-sm text-ink-700">Batal</Text>
                </Pressable>
                <Pressable onPress={requestNewCity} className="flex-1 rounded-xl bg-brand-600 py-3">
                  <Text className="font-bold text-center text-sm text-white">Kirim Request</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Confirm Hapus Area - cross-platform (Alert RN gak jalan di web) */}
        <Modal visible={!!confirmRemove} transparent animationType="fade" onRequestClose={() => setConfirmRemove(null)}>
          <Pressable onPress={() => !submittingRemove && setConfirmRemove(null)} className="flex-1 items-center justify-center bg-black/50 px-6">
            <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5">
              <View className="flex-row items-center gap-2">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                  <Trash2 color="#B91C1C" size={18} strokeWidth={2.2} />
                </View>
                <Text className="font-extrabold text-base text-ink-900">Hapus Area</Text>
              </View>
              <Text className="font-medium mt-3 text-[13px] leading-5 text-ink-700">
                Yakin mau hapus <Text className="font-bold">{confirmRemove}</Text> dari area kerja kamu?
              </Text>
              <Text className="font-sans mt-2 text-[12px] leading-4 text-ink-500">
                Admin akan review request ini. Setelah disetujui, kamu gak akan dapat order dari area itu lagi.
              </Text>
              <View className="mt-4 flex-row gap-2">
                <Pressable
                  onPress={() => setConfirmRemove(null)}
                  disabled={submittingRemove}
                  className="flex-1 rounded-xl border border-ink-200 bg-white py-3"
                >
                  <Text className="font-bold text-center text-sm text-ink-700">Batal</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmRemove && submitRemoveArea(confirmRemove)}
                  disabled={submittingRemove}
                  className="flex-1 rounded-xl py-3"
                  style={{ backgroundColor: '#DC2626', opacity: submittingRemove ? 0.6 : 1 }}
                >
                  <Text className="font-bold text-center text-sm" style={{ color: 'white' }}>
                    {submittingRemove ? 'Mengirim…' : 'Kirim Request'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

      </View>
    </>
  );
}


export default withAuth(withCleanerKyc(CleanerAreas), 'freelancer');

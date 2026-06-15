import { LinearGradient } from 'expo-linear-gradient';
import { Check, Download, Sparkles, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { storage } from '../lib/storage';
import { currentVersion, evaluateUpdate, fetchUpdateInfo, type UpdateInfo } from '../lib/versionCheck';
import { toast } from '../stores/ui';

const SKIP_KEY = 'update.skipped';

export function UpdatePromptHost() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [forced, setForced] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    void check();
  }, []);

  async function check() {
    const i = await fetchUpdateInfo();
    if (!i) return;
    const { hasUpdate, forced: f } = evaluateUpdate(i);
    if (!hasUpdate) return;
    // Soft update: kalau user sudah skip versi ini, jangan munculkan lagi
    if (!f && storage.getString(SKIP_KEY) === i.latestVersion) return;
    setInfo(i);
    setForced(f);
    setVisible(true);
  }

  function onUpdate() {
    if (!info) return;
    void Linking.openURL(info.storeUrl).catch(() => {
      toast.error('Tidak bisa buka Play Store');
    });
  }

  function onSkip() {
    if (!info) return;
    storage.set(SKIP_KEY, info.latestVersion);
    setVisible(false);
    toast.info('Pengingat update ditunda hingga versi berikutnya');
  }

  if (!info) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (!forced) setVisible(false);
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.6)',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <View
          className="overflow-hidden rounded-3xl bg-white"
          style={{ elevation: 24, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24 }}
        >
          {/* Header */}
          <LinearGradient colors={['#1E3A8A', '#047857', '#0E7490']} style={{ padding: 20 }}>
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Sparkles color="white" size={24} strokeWidth={2.2} />
                </View>
                <Text className="font-bold mt-3 text-xl text-white">
                  {forced ? 'Update Wajib' : 'Versi Baru Tersedia'}
                </Text>
                <Text className="font-medium mt-1 text-xs text-white/85">
                  v{currentVersion()} → v{info.latestVersion}
                </Text>
              </View>
              {!forced && (
                <Pressable onPress={onSkip} className="h-9 w-9 items-center justify-center rounded-full bg-white/15">
                  <X color="white" size={18} />
                </Pressable>
              )}
            </View>
          </LinearGradient>

          {/* Body */}
          <View className="p-5">
            {forced && (
              <View className="mb-3 rounded-xl bg-amber-50 p-3">
                <Text className="font-semibold text-xs text-amber-900">
                  ⚠️ Versi kamu sudah tidak didukung. Update untuk lanjut pakai aplikasi.
                </Text>
              </View>
            )}

            <Text className="font-semibold mb-3 text-[11px] uppercase tracking-wider text-ink-500">
              Apa yang baru
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              <View className="gap-2">
                {info.releaseNotes.map((n) => (
                  <View key={n} className="flex-row items-start gap-2">
                    <View className="mt-1 h-4 w-4 items-center justify-center rounded-full bg-brand-100">
                      <Check color="#1D4ED8" size={10} strokeWidth={3} />
                    </View>
                    <Text className="font-sans flex-1 text-[12px] leading-[18px] text-ink-700">{n}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Footer actions */}
          <SafeAreaView edges={['bottom']}>
            <View className="flex-row gap-2 border-t border-ink-100 p-4">
              {!forced && (
                <Pressable onPress={onSkip} className="flex-1 rounded-2xl border border-ink-300 py-3.5">
                  <Text className="font-semibold text-center text-sm text-ink-700">Nanti Saja</Text>
                </Pressable>
              )}
              <Pressable
                onPress={onUpdate}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-brand-600 py-3.5"
              >
                <Download color="white" size={16} strokeWidth={2.4} />
                <Text className="font-bold text-sm text-white">Update Sekarang</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

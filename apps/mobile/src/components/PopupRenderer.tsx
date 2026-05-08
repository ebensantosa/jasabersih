import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

type Popup = {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaLink: string | null;
  triggerEvent: string;
  priority: number;
};

// Polls /v1/app/popups when authenticated; shows highest-priority one matching `event`.
export function PopupRenderer({ event = 'app_open' }: { event?: 'app_open' | 'post_login' | 'booking_complete' }) {
  const token = useAuthStore((s) => s.tokens?.accessToken);
  const [queue, setQueue] = useState<Popup[]>([]);
  const [shown, setShown] = useState<Popup | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/app/popups');
        const list: Popup[] = (res.data?.data ?? []).filter((p: Popup) => p.triggerEvent === event);
        if (!cancelled) {
          setQueue(list);
          if (list[0]) {
            setShown(list[0]);
            // Record view
            api.post(`/app/popups/${list[0].id}/view`, { ctaClicked: false }).catch(() => {});
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [token, event]);

  function close() {
    setShown(null);
    // Show next in queue (drop current)
    setQueue((prev) => prev.slice(1));
  }

  async function clickCta() {
    if (!shown) return;
    api.post(`/app/popups/${shown.id}/view`, { ctaClicked: true }).catch(() => {});
    if (shown.ctaLink) {
      try { await Linking.openURL(shown.ctaLink); } catch {}
    }
    close();
  }

  if (!shown) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={close}>
      <Pressable onPress={close} className="flex-1 items-center justify-center bg-black/60 p-4">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-sm overflow-hidden rounded-2xl bg-white"
        >
          {shown.imageUrl && (
            <View className="relative">
              <Pressable onPress={close} className="absolute right-2 top-2 z-10 h-8 w-8 items-center justify-center rounded-full bg-black/40">
                <X color="white" size={18} />
              </Pressable>
              <Image source={{ uri: shown.imageUrl }} style={{ width: '100%', aspectRatio: 16 / 9 }} resizeMode="cover" />
            </View>
          )}
          <ScrollView style={{ maxHeight: 320 }}>
            <View className="p-4">
              {!shown.imageUrl && (
                <Pressable onPress={close} className="absolute right-2 top-2 h-8 w-8 items-center justify-center">
                  <X color="#0F172A" size={18} />
                </Pressable>
              )}
              <Text className="font-bold text-lg text-ink-900">{shown.title}</Text>
              {shown.body && <Text className="font-sans mt-2 text-sm text-ink-700">{shown.body}</Text>}
            </View>
          </ScrollView>
          <View className="flex-row gap-2 border-t border-ink-100 p-3">
            <Pressable onPress={close} className="flex-1 items-center justify-center rounded-lg bg-ink-100 py-3">
              <Text className="font-semibold text-sm text-ink-700">Tutup</Text>
            </Pressable>
            {shown.ctaLabel && (
              <Pressable onPress={clickCta} className="flex-1 items-center justify-center rounded-lg bg-brand-600 py-3">
                <Text className="font-semibold text-sm text-white">{shown.ctaLabel}</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

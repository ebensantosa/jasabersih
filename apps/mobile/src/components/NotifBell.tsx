import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useVisiblePoll } from '../lib/useVisiblePoll';
import { useAuthStore } from '../stores/auth';
import { useNotifications } from '../stores/notifications';

export function NotifBell({ tint = '#0F172A' }: { tint?: string }) {
  const router = useRouter();
  const tokens = useAuthStore((s) => s.tokens);
  const { unreadCount, fetch } = useNotifications();

  // Poll 1 menit, otomatis pause saat app di background.
  useVisiblePoll(fetch, 60_000, !!tokens);

  if (!tokens) return null;

  return (
    <Pressable onPress={() => router.push('/notifications')} className="relative h-10 w-10 items-center justify-center">
      <Bell color={tint} size={20} strokeWidth={2.2} />
      {unreadCount > 0 && (
        <View className="absolute right-1 top-1 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1">
          <Text className="font-bold text-[9px] text-white">{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

import { Tabs } from 'expo-router';
import { Briefcase, Calendar, ClipboardList, Home, MessageCircle, Search, TrendingUp, User } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../src/lib/i18n';
import { useModeStore } from '../../src/stores/mode';
import { useAuthStore } from '../../src/stores/auth';
import { api } from '../../src/lib/api';
import { useVisiblePoll } from '../../src/lib/useVisiblePoll';

export default function TabsLayout() {
  const mode = useModeStore((s) => s.mode);
  const isFreelancer = mode === 'freelancer';
  const t = useT();
  const tokens = useAuthStore((s) => s.tokens);
  const insets = useSafeAreaInsets();
  const [chatUnread, setChatUnread] = useState(0);

  // Poll chat unread tiap 30s (pause saat app di background)
  const fetchChatUnread = useCallback(async () => {
    try {
      const r = await api.get('/chat/unread-count');
      setChatUnread(Number((r.data?.data ?? r.data)?.count ?? 0));
    } catch { /* silent */ }
  }, []);
  useVisiblePoll(fetchChatUnread, 30_000, !!tokens);
  useEffect(() => { if (!tokens) setChatUnread(0); }, [tokens]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: (Platform.OS === 'web' ? 64 : 72) + insets.bottom,
          paddingTop: 8,
          paddingBottom: (Platform.OS === 'web' ? 8 : 12) + insets.bottom,
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          backgroundColor: 'white',
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: isFreelancer ? null : '/(tabs)',
          tabBarIcon: ({ focused }) => <TabItem icon={Home} label={t('tab.home')} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: isFreelancer ? null : '/(tabs)/explore',
          tabBarIcon: ({ focused }) => (
            <TabItem icon={Search} label={t('tab.explore')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          href: isFreelancer ? '/(tabs)/jobs' : null,
          tabBarIcon: ({ focused }) => (
            <TabItem icon={Briefcase} label={t('tab.jobs')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          href: '/(tabs)/bookings',
          tabBarIcon: ({ focused }) => (
            <TabItem icon={ClipboardList} label={isFreelancer ? 'Riwayat' : t('tab.bookings')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          href: '/(tabs)/chats',
          tabBarIcon: ({ focused }) => (
            <TabItem icon={MessageCircle} label="Pesan" focused={focused} badge={chatUnread} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          href: isFreelancer ? '/(tabs)/calendar' : null,
          tabBarIcon: ({ focused }) => (
            <TabItem icon={Calendar} label="Jadwal" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          href: isFreelancer ? '/(tabs)/earnings' : null,
          tabBarIcon: ({ focused }) => (
            <TabItem icon={TrendingUp} label={t('tab.earnings')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabItem icon={User} label={t('tab.profile')} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function TabItem({
  icon: Icon,
  label,
  focused,
  badge,
}: {
  icon: React.ComponentType<{
    color?: string;
    size?: number;
    strokeWidth?: number;
  }>;
  label: string;
  focused: boolean;
  badge?: number;
}) {
  const color = focused ? '#1D4ED8' : '#94A3B8';
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 64,
      }}
    >
      <View
        style={{
          height: 28,
          width: 50,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? '#DBEAFE' : 'transparent',
          marginBottom: 3,
          position: 'relative',
        }}
      >
        <Icon color={color} size={focused ? 22 : 20} strokeWidth={focused ? 2.4 : 2} />
        {badge && badge > 0 ? (
          <View
            style={{
              position: 'absolute',
              right: 4,
              top: 0,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: '#DC2626',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: '700', color: 'white' }}>
              {badge > 9 ? '9+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={{
          fontSize: 10,
          fontFamily: focused ? 'Inter_700Bold' : 'Inter_500Medium',
          color,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

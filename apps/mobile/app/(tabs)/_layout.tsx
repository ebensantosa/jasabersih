import { Tabs } from 'expo-router';
import { Briefcase, ClipboardList, Home, MessageCircle, Search, TrendingUp, User } from 'lucide-react-native';
import { Platform, Text, View } from 'react-native';

import { useT } from '../../src/lib/i18n';
import { useModeStore } from '../../src/stores/mode';

export default function TabsLayout() {
  const mode = useModeStore((s) => s.mode);
  const isFreelancer = mode === 'freelancer';
  const t = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: Platform.OS === 'web' ? 64 : 72,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'web' ? 8 : 12,
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
          href: isFreelancer ? null : '/(tabs)/bookings',
          tabBarIcon: ({ focused }) => (
            <TabItem icon={ClipboardList} label={t('tab.bookings')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          href: '/(tabs)/chats',
          tabBarIcon: ({ focused }) => (
            <TabItem icon={MessageCircle} label="Pesan" focused={focused} />
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
}: {
  icon: React.ComponentType<{
    color?: string;
    size?: number;
    strokeWidth?: number;
  }>;
  label: string;
  focused: boolean;
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
        }}
      >
        <Icon color={color} size={focused ? 22 : 20} strokeWidth={focused ? 2.4 : 2} />
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

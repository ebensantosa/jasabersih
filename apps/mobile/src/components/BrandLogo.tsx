import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { useConfig } from '../stores/appContent';

export function BrandLogo({
  size = 48,
  showName = true,
  variant = 'light',
}: {
  size?: number;
  showName?: boolean;
  variant?: 'light' | 'dark';
}) {
  const rawLogo = useConfig('brand.logo_url', '' as any) as unknown;
  // Handle berbagai bentuk dari config: null, string 'null', "", object — normalize ke valid URL atau ''
  const logoUrl = (typeof rawLogo === 'string' && rawLogo.trim() && rawLogo.trim().toLowerCase() !== 'null' && /^https?:\/\//.test(rawLogo.trim()))
    ? rawLogo.trim()
    : '';
  const appName = useConfig('brand.app_name', 'JasaBersih') as string;

  const textColor = variant === 'light' ? 'text-white' : 'text-ink-900';

  return (
    <View className="flex-row items-center gap-2">
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={{ width: size, height: size, borderRadius: size * 0.2 }} contentFit="contain" />
      ) : (
        <View
          style={{ width: size, height: size }}
          className={`items-center justify-center rounded-2xl ${variant === 'light' ? 'bg-white/15' : 'bg-brand-50'}`}
        >
          <Text className={`font-bold text-base ${variant === 'light' ? 'text-white' : 'text-brand-700'}`}>
            {appName.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      {showName && (
        <Text className={`font-bold text-lg ${textColor}`}>{appName}</Text>
      )}
    </View>
  );
}

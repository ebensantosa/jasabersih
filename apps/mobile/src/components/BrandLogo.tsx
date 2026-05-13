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
  const logoUrl = (typeof rawLogo === 'string' && rawLogo.trim() && rawLogo.trim().toLowerCase() !== 'null' && /^https?:\/\//.test(rawLogo.trim()))
    ? rawLogo.trim()
    : '';
  const appName = useConfig('brand.app_name', 'JasaBersih') as string;

  const textColor = variant === 'light' ? 'text-white' : 'text-ink-900';

  return (
    <View className="flex-row items-center gap-2">
      <Image
        source={logoUrl ? { uri: logoUrl } : require('../../assets/icon.png')}
        style={{ width: size, height: size, borderRadius: size * 0.2 }}
        contentFit="contain"
      />
      {showName && (
        <Text className={`font-bold text-lg ${textColor}`}>{appName}</Text>
      )}
    </View>
  );
}

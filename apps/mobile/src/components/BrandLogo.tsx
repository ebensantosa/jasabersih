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
  const subtleColor = variant === 'light' ? 'rgba(255,255,255,0.75)' : '#64748B';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {/* Logo container - white background polished kayak app icon */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.24,
          backgroundColor: variant === 'light' ? 'rgba(255,255,255,0.96)' : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#0F172A',
          shadowOpacity: variant === 'light' ? 0.18 : 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        <Image
          source={logoUrl ? { uri: logoUrl } : require('../../assets/icon.png')}
          style={{ width: size * 0.72, height: size * 0.72, borderRadius: size * 0.16 }}
          contentFit="contain"
        />
      </View>

      {showName && (
        <View>
          <Text
            className={`font-extrabold ${textColor}`}
            style={{ fontSize: size * 0.46, letterSpacing: -0.4, lineHeight: size * 0.5 }}
          >
            {appName}
          </Text>
          <Text
            style={{
              color: subtleColor,
              fontFamily: 'Inter_500Medium',
              fontSize: size * 0.22,
              letterSpacing: 1.4,
              marginTop: 2,
              textTransform: 'uppercase',
            }}
          >
            Layanan Bersih Profesional
          </Text>
        </View>
      )}
    </View>
  );
}

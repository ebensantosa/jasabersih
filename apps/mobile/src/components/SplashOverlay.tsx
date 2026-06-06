import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { useConfig } from '../stores/appContent';

/**
 * Splash overlay — logo saja, tanpa text. Logo configurable via brand.logo_url di App Settings.
 */
export function SplashOverlay({ visible }: { visible: boolean }) {
  const rawLogo = useConfig('brand.logo_url', '' as any) as unknown;
  const logoUrl =
    typeof rawLogo === 'string' &&
    rawLogo.trim() &&
    rawLogo.trim().toLowerCase() !== 'null' &&
    /^https?:\/\//.test(rawLogo.trim())
      ? rawLogo.trim()
      : '';
  const primaryColor = (useConfig('brand.primary_color', '#1E40AF') as string) || '#1E40AF';
  const secondaryColor = (useConfig('brand.secondary_color', '#3B82F6') as string) || '#3B82F6';

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
      <LinearGradient
        colors={[primaryColor, secondaryColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Image
          source={logoUrl ? { uri: logoUrl } : require('../../assets/icon.png')}
          style={{ width: 180, height: 180 }}
          contentFit="contain"
        />
      </LinearGradient>
    </View>
  );
}

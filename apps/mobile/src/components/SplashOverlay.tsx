import { Image } from 'expo-image';
import { View } from 'react-native';

import { useConfig } from '../stores/appContent';

/**
 * Splash overlay - logo saja, solid color (sama dengan native splash di app.json).
 * Logo configurable via brand.logo_url di App Settings.
 */
const SPLASH_BG = '#FFFFFF';

export function SplashOverlay({ visible }: { visible: boolean }) {
  const rawLogo = useConfig('brand.logo_url', '' as any) as unknown;
  const logoUrl =
    typeof rawLogo === 'string' &&
    rawLogo.trim() &&
    rawLogo.trim().toLowerCase() !== 'null' &&
    /^https?:\/\//.test(rawLogo.trim())
      ? rawLogo.trim()
      : '';

  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: SPLASH_BG,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        source={logoUrl ? { uri: logoUrl } : require('../../assets/icon.png')}
        style={{ width: 180, height: 180 }}
        contentFit="contain"
      />
    </View>
  );
}

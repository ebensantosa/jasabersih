import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useConfig } from '../stores/appContent';

/**
 * Branded splash overlay yang nutupin app dari boot sampai fontsLoaded + hydration kelar.
 * Pakai brand.logo_url + brand.app_name dari CMS — admin bisa swap tanpa rebuild.
 */
export function SplashOverlay({ visible }: { visible: boolean }) {
  const rawLogo = useConfig('brand.logo_url', '' as any) as unknown;
  const logoUrl = (typeof rawLogo === 'string' && rawLogo.trim() && rawLogo.trim().toLowerCase() !== 'null' && /^https?:\/\//.test(rawLogo.trim()))
    ? rawLogo.trim() : '';
  const appName = (useConfig('brand.app_name', 'JasaBersih') as string) || 'JasaBersih';
  const tagline = (useConfig('brand.tagline', 'Cleaning Service Profesional') as string) || 'Cleaning Service Profesional';
  const primaryColor = (useConfig('brand.primary_color', '#1E40AF') as string) || '#1E40AF';
  const secondaryColor = (useConfig('brand.secondary_color', '#3B82F6') as string) || '#3B82F6';

  // Fade-in tagline biar gak terasa flash
  const [fadeReady, setFadeReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFadeReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
      <LinearGradient
        colors={[primaryColor, secondaryColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
      >
        <Image
          source={logoUrl ? { uri: logoUrl } : require('../../assets/icon.png')}
          style={{ width: 160, height: 160, borderRadius: 32 }}
          contentFit="contain"
        />
        <Text style={{ marginTop: 24, fontSize: 28, fontWeight: '800', color: 'white', letterSpacing: -0.5 }}>
          {appName}
        </Text>
        {fadeReady && (
          <Text style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
            {tagline}
          </Text>
        )}
        <ActivityIndicator
          color="white"
          size="small"
          style={{ marginTop: 32, opacity: 0.7 }}
        />
      </LinearGradient>
    </View>
  );
}

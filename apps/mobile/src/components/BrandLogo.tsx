import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { useConfig } from '../stores/appContent';

export function BrandLogo({
  size = 48,
  showName = true,
  variant = 'light',
  animated = true,
}: {
  size?: number;
  showName?: boolean;
  variant?: 'light' | 'dark';
  animated?: boolean;
}) {
  const rawLogo = useConfig('brand.logo_url', '' as any) as unknown;
  const logoUrl = (typeof rawLogo === 'string' && rawLogo.trim() && rawLogo.trim().toLowerCase() !== 'null' && /^https?:\/\//.test(rawLogo.trim()))
    ? rawLogo.trim()
    : '';
  const appName = useConfig('brand.app_name', 'JasaBersih') as string;

  const textColor = variant === 'light' ? 'text-white' : 'text-ink-900';
  const subtleColor = variant === 'light' ? 'rgba(255,255,255,0.75)' : '#64748B';

  // Animations
  const float = useRef(new Animated.Value(0)).current;     // up-down subtle bob
  const glow = useRef(new Animated.Value(0)).current;      // outer glow pulse
  const intro = useRef(new Animated.Value(0)).current;     // scale in on mount

  useEffect(() => {
    if (!animated) {
      intro.setValue(1);
      return;
    }
    // Intro: scale + fade in
    Animated.spring(intro, {
      toValue: 1,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }).start();

    // Float bob - 3s cycle
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );

    // Glow pulse - 2.4s cycle
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );

    floatLoop.start();
    glowLoop.start();
    return () => {
      floatLoop.stop();
      glowLoop.stop();
    };
  }, [animated, float, glow, intro]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const introScale = intro.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const introOpacity = intro;

  // Outer glow ring style
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });

  const containerSize = size;
  const logoSize = size * 0.78;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      {/* Animated logo container */}
      <Animated.View
        style={{
          opacity: introOpacity,
          transform: [{ scale: introScale }, { translateY }],
        }}
      >
        <View style={{ width: containerSize, height: containerSize, alignItems: 'center', justifyContent: 'center' }}>
          {/* Outer glow ring */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: containerSize,
              height: containerSize,
              borderRadius: containerSize * 0.28,
              backgroundColor: variant === 'light' ? 'rgba(255,255,255,0.5)' : 'rgba(30,58,138,0.3)',
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            }}
          />

          {/* Gradient border ring */}
          <LinearGradient
            colors={variant === 'light'
              ? ['#FFFFFF', 'rgba(255,255,255,0.7)']
              : ['#1E3A8A', '#0E7490']}
            style={{
              width: containerSize,
              height: containerSize,
              borderRadius: containerSize * 0.28,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 2,
              shadowColor: variant === 'light' ? '#0F172A' : '#0E7490',
              shadowOpacity: variant === 'light' ? 0.22 : 0.15,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            {/* Inner white card */}
            <View
              style={{
                width: containerSize - 4,
                height: containerSize - 4,
                borderRadius: containerSize * 0.26,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <Image
                source={logoUrl ? { uri: logoUrl } : require('../../assets/icon.png')}
                style={{ width: logoSize, height: logoSize }}
                contentFit="contain"
              />
            </View>
          </LinearGradient>
        </View>
      </Animated.View>

      {showName && (
        <Animated.View style={{ opacity: introOpacity, transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }}>
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
        </Animated.View>
      )}
    </View>
  );
}

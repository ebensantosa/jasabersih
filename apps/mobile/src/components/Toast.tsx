import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

import { useUIStore, type ToastKind } from '../stores/ui';

const COLORS: Record<ToastKind, { bg: string; fg: string; icon: typeof Info }> = {
  info: { bg: '#1D4ED8', fg: 'white', icon: Info },
  success: { bg: '#047857', fg: 'white', icon: CheckCircle2 },
  error: { bg: '#B91C1C', fg: 'white', icon: XCircle },
  warning: { bg: '#B45309', fg: 'white', icon: AlertTriangle },
};

export function ToastHost() {
  const t = useUIStore((s) => s.toast);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (t) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [t, opacity, translateY]);

  if (!t) return null;
  const c = COLORS[t.kind];
  const Icon = c.icon;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 60,
        left: 16,
        right: 16,
        zIndex: 9999,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <View
        className="flex-row items-center gap-2 rounded-2xl px-4 py-3"
        style={{ backgroundColor: c.bg, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 }}
      >
        <Icon color={c.fg} size={18} strokeWidth={2.4} />
        <Text className="font-semibold flex-1 text-sm" style={{ color: c.fg }}>
          {t.message}
        </Text>
      </View>
    </Animated.View>
  );
}

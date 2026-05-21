import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useModeStore } from '../src/stores/mode';

export default function Index() {
  const router = useRouter();
  const mode = useModeStore((s) => s.mode);
  useEffect(() => {
    const href = mode === 'freelancer' ? '/(tabs)/jobs' : '/(tabs)';
    router.replace(href);
  }, [mode, router]);
  return <View style={{ flex: 1, backgroundColor: '#0EA5E9' }} />;
}

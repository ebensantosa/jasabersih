import { Redirect } from 'expo-router';

import { useModeStore } from '../src/stores/mode';

export default function Index() {
  const mode = useModeStore((s) => s.mode);
  return <Redirect href={mode === 'freelancer' ? '/(tabs)/jobs' : '/(tabs)'} />;
}

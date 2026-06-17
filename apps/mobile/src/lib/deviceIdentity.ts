import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY = 'app.device_id';

let cachedDeviceId: string | null = null;

function generateDeviceId() {
  return `jb-${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const next = generateDeviceId();
  cachedDeviceId = next;
  await AsyncStorage.setItem(KEY, next);
  return next;
}

// Pakai SecureStore (native) / localStorage (web) + AsyncStorage agar jalan di Expo Go.
// Sprint berikutnya: pindah ke react-native-mmkv saat sudah pakai development build.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SECURE_KEYS = new Set<string>(['auth.tokens']);
const isWeb = Platform.OS === 'web';

const syncCache = new Map<string, string>();

export const storage = {
  getString(key: string): string | undefined {
    if (SECURE_KEYS.has(key)) {
      if (isWeb) {
        const v = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        return v ?? undefined;
      }
      const v = SecureStore.getItem(key);
      return v ?? undefined;
    }
    return syncCache.get(key);
  },

  set(key: string, value: string): void {
    if (SECURE_KEYS.has(key)) {
      if (isWeb) {
        if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
      } else {
        void SecureStore.setItemAsync(key, value);
      }
    } else {
      syncCache.set(key, value);
      void AsyncStorage.setItem(key, value);
    }
  },

  delete(key: string): void {
    if (SECURE_KEYS.has(key)) {
      if (isWeb) {
        if (typeof window !== 'undefined') window.localStorage.removeItem(key);
      } else {
        void SecureStore.deleteItemAsync(key);
      }
    } else {
      syncCache.delete(key);
      void AsyncStorage.removeItem(key);
    }
  },
};

/** Call once at app boot to hydrate the sync cache for non-secure keys. */
export async function hydrateStorageCache(keys: string[]): Promise<void> {
  const entries = await AsyncStorage.multiGet(keys);
  for (const [k, v] of entries) {
    if (v != null) syncCache.set(k, v);
  }
}

export const persistKeys = {
  authTokens: 'auth.tokens',
  mode: 'app.mode',
  onboarded: 'app.onboarded',
} as const;

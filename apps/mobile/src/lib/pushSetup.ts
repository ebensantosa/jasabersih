import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

// Foreground notif handler: tampilkan banner + sound saat app terbuka
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let registered = false;
let currentToken: string | null = null;

// Reset state - dipanggil saat logout supaya next login bisa register ulang
// (kalau gak di-reset, flag `registered` global stay true → next user gak
// kepesan ke backend → terus dapat notif user lama).
export function resetPushRegistration() {
  registered = false;
}

export function getCurrentPushToken(): string | null {
  return currentToken;
}

// Unregister token dari backend - panggil SEBELUM clear auth tokens (perlu
// JWT valid utk auth request).
export async function unregisterPushAsync(): Promise<void> {
  const token = currentToken;
  if (!token) return;
  try {
    await api.post('/notifications/unregister-token', { token });
  } catch { /* non-fatal */ }
  resetPushRegistration();
  currentToken = null;
}

// Call after user is authenticated. Idempotent.
export async function registerForPushAsync(): Promise<string | null> {
  if (registered) return currentToken;

  // Android: bikin channel default + custom channels
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    for (const ch of ['booking', 'chat', 'wallet', 'system']) {
      await Notifications.setNotificationChannelAsync(ch, {
        name: ch,
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }
  }

  // Permission
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.status === 'granted';
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.status === 'granted';
  }
  if (!granted) return null;

  // Hanya physical device yang bisa push (simulator tidak)
  if (!Device.isDevice) return null;

  // Get Expo Push Token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  let token: string;
  try {
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    token = t.data;
  } catch {
    return null;
  }
  if (!token) return null;

  // Register ke backend
  try {
    const deviceId = `${Platform.OS}-${Device.osBuildId ?? Device.modelId ?? Math.random().toString(36).slice(2, 10)}`;
    await api.post('/notifications/register-token', {
      token,
      deviceId,
      platform: Platform.OS,
      deviceFingerprint: `${Device.brand ?? ''}-${Device.modelName ?? ''}-${Device.osVersion ?? ''}`,
    });
    registered = true;
    currentToken = token;
  } catch {
    return token; // token tetap ke-return walau register gagal - bisa di-retry
  }
  return token;
}

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
let lastRegisteredMode: string | null = null;
let currentToken: string | null = null;

// Reset state - dipanggil saat logout supaya next login bisa register ulang
export function resetPushRegistration() {
  registered = false;
  lastRegisteredMode = null;
}

export function getCurrentPushToken(): string | null {
  return currentToken;
}

// Unregister token dari backend. Terima optional accessToken override supaya
// bisa dipanggil setelah JWT store di-clear (race condition saat logout).
// Interceptor tidak override Authorization jika token store sudah null.
export async function unregisterPushAsync(overrideAccessToken?: string): Promise<void> {
  const token = currentToken;
  if (!token) return;
  try {
    await api.post(
      '/notifications/unregister-token',
      { token },
      overrideAccessToken ? { headers: { Authorization: `Bearer ${overrideAccessToken}` } } : undefined,
    );
  } catch { /* non-fatal */ }
  resetPushRegistration();
  currentToken = null;
}

// Call after user is authenticated. Idempotent.
export async function registerForPushAsync(mode?: 'customer' | 'freelancer'): Promise<string | null> {
  console.log(`[Push] registerForPushAsync called mode=${mode} registered=${registered}`);
  // Skip jika sudah registered dengan mode yang sama
  if (registered && lastRegisteredMode === (mode ?? null)) return currentToken;

  void api.post('/notifications/debug-push', { step: 'start', mode, registered }).catch(() => {});

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
        vibrationPattern: [0, 250, 150, 250],
      });
    }
    // Channel khusus untuk job masuk — getaran lebih panjang supaya cleaner sadar
    // v2: channel ID dibump agar Android recreate channel dengan sound yang benar
    // (Android lock sound saat channel pertama dibuat, tidak bisa diubah tanpa ID baru)
    await Notifications.setNotificationChannelAsync('incoming_job_v2', {
      name: 'Job Masuk',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'order_incoming',   // Android: nama file tanpa ekstensi (dari res/raw/)
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      enableVibrate: true,
      showBadge: true,
    });
  }

  // Permission
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.status === 'granted';
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.status === 'granted';
  }
  console.log(`[Push] permission granted=${granted} isDevice=${Device.isDevice}`);
  void api.post('/notifications/debug-push', { step: 'permission', granted, isDevice: Device.isDevice }).catch(() => {});
  if (!granted) return null;

  // Hanya physical device yang bisa push (simulator tidak)
  if (!Device.isDevice) return null;

  // Get Expo Push Token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  console.log(`[Push] projectId=${projectId}`);
  let token: string;
  try {
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    token = t.data;
    console.log(`[Push] token obtained: ${token}`);
    void api.post('/notifications/debug-push', { step: 'token_ok', token: token.slice(0, 30) }).catch(() => {});
  } catch (e: any) {
    console.log(`[Push] getExpoPushTokenAsync failed: ${e?.message}`);
    void api.post('/notifications/debug-push', { step: 'token_failed', error: e?.message }).catch(() => {});
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
      mode,
    });
    registered = true;
    lastRegisteredMode = mode ?? null;
    currentToken = token;
    console.log(`[Push] registered ok token=${token} mode=${mode}`);
  } catch (e: any) {
    console.log(`[Push] register-token API failed: ${e?.message}`);
    return token; // token tetap ke-return walau register gagal - bisa di-retry
  }
  return token;
}

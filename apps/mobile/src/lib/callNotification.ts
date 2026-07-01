// Guard notifee - native module requires matching APK build.
// Gracefully no-ops if native module is absent (e.g. older APK without Notifee).
let notifee: any = null;
let AndroidImportance: any = { HIGH: 4 };
let AndroidVisibility: any = { PUBLIC: 1 };
let AndroidLaunchActivityFlag: any = { SINGLE_TOP: 536870912 };
let EventType: any = { ACTION_PRESS: 2, PRESS: 1, DISMISSED: 0 };

try {
  const mod = require('@notifee/react-native');
  notifee = mod.default;
  AndroidImportance = mod.AndroidImportance;
  AndroidVisibility = mod.AndroidVisibility;
  AndroidLaunchActivityFlag = mod.AndroidLaunchActivityFlag;
  EventType = mod.EventType;
} catch {
  // Notifee native module not in this APK build - call notifications disabled
}

const CALL_CHANNEL_ID = 'incoming_call_notifee_v2';
export const CALL_NOTIFICATION_ID = 'incoming_call_active';

export async function setupCallChannel() {
  if (!notifee) return;
  await notifee.createChannel({
    id: CALL_CHANNEL_ID,
    name: 'Panggilan Masuk',
    importance: AndroidImportance.HIGH,
    sound: 'call_incoming',
    vibration: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
  });
}

export async function showIncomingCallNotification({
  bookingId,
  callerName,
}: {
  bookingId: string;
  callerName: string;
}) {
  if (!notifee) return;
  await setupCallChannel();
  await notifee.displayNotification({
    id: CALL_NOTIFICATION_ID,
    title: `📞 Panggilan dari ${callerName}`,
    body: 'Tap Angkat untuk menerima panggilan',
    android: {
      channelId: CALL_CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      ongoing: true,
      asForegroundService: false,
      fullScreenAction: {
        id: 'open',
        launchActivity: 'default',
        launchActivityFlags: [AndroidLaunchActivityFlag.SINGLE_TOP],
      },
      actions: [
        {
          title: '📞 Angkat',
          pressAction: {
            id: 'answer',
            launchActivity: 'default',
            launchActivityFlags: [AndroidLaunchActivityFlag.SINGLE_TOP],
          },
        },
        {
          title: '❌ Tolak',
          pressAction: { id: 'decline' },
        },
      ],
      pressAction: {
        id: 'open',
        launchActivity: 'default',
        launchActivityFlags: [AndroidLaunchActivityFlag.SINGLE_TOP],
      },
    },
    data: { bookingId, type: 'incoming_call', callerName },
  });
}

export async function cancelCallNotification() {
  if (!notifee) return;
  await notifee.cancelNotification(CALL_NOTIFICATION_ID);
}

// Daftarkan handler event notifee untuk foreground (Tolak/Angkat saat app terbuka)
// Dipanggil sekali dari _layout.tsx useEffect
export function subscribeNotifeeCallEvents(
  onAnswer: (bookingId: string) => void,
  onDecline: (bookingId?: string) => void,
): () => void {
  if (!notifee) return () => {};
  return notifee.onForegroundEvent(({ type, detail }: any) => {
    if (
      type === EventType.ACTION_PRESS ||
      type === EventType.PRESS
    ) {
      const bookingId = detail.notification?.data?.bookingId as string | undefined;
      const actionId = detail.pressAction?.id;
      void cancelCallNotification();
      if (actionId === 'decline') {
        onDecline(bookingId);
      } else if (actionId === 'answer' && bookingId) {
        onAnswer(bookingId);
      }
    }
    if (type === EventType.DISMISSED) {
      void cancelCallNotification();
      onDecline();
    }
  });
}

import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidLaunchActivityFlag,
  EventType,
} from '@notifee/react-native';

const CALL_CHANNEL_ID = 'incoming_call_notifee';
export const CALL_NOTIFICATION_ID = 'incoming_call_active';

export async function setupCallChannel() {
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
        id: 'answer',
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
        id: 'answer',
        launchActivity: 'default',
        launchActivityFlags: [AndroidLaunchActivityFlag.SINGLE_TOP],
      },
    },
    data: { bookingId, type: 'incoming_call', callerName },
  });
}

export async function cancelCallNotification() {
  await notifee.cancelNotification(CALL_NOTIFICATION_ID);
}

// Daftarkan handler event notifee untuk foreground (Tolak/Angkat saat app terbuka)
// Dipanggil sekali dari _layout.tsx useEffect
export function subscribeNotifeeCallEvents(
  onAnswer: (bookingId: string) => void,
  onDecline: () => void,
) {
  return notifee.onForegroundEvent(({ type, detail }) => {
    if (
      type === EventType.ACTION_PRESS ||
      type === EventType.PRESS
    ) {
      const bookingId = detail.notification?.data?.bookingId as string | undefined;
      const actionId = detail.pressAction?.id;
      void cancelCallNotification();
      if (actionId === 'decline') {
        onDecline();
      } else if (bookingId) {
        onAnswer(bookingId);
      }
    }
    if (type === EventType.DISMISSED) {
      void cancelCallNotification();
      onDecline();
    }
  });
}

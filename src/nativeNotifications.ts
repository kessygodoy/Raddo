import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const RaddoNotificationChannelId = 'raddo-updates';

async function ensureNotificationChannel() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.createChannel({
      id: RaddoNotificationChannelId,
      name: 'Raddo',
      description: 'Matches, mensagens e atividades do Raddo',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
    });
  } catch {
    // Some platforms do not support channel creation. Scheduling still works without it.
  }
}

export async function getNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    const permissions = await LocalNotifications.checkPermissions();
    return permissions.display;
  }

  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

export async function requestNativeNotifications() {
  if (Capacitor.isNativePlatform()) {
    const permissions = await LocalNotifications.requestPermissions();
    if (permissions.display === 'granted') await ensureNotificationChannel();
    return permissions.display;
  }

  if (typeof Notification === 'undefined') return 'denied';
  return Notification.requestPermission();
}

export async function showAppNotification(title: string, body: string, data: Record<string, string> = {}) {
  if (Capacitor.isNativePlatform()) {
    const permissions = await LocalNotifications.checkPermissions();
    if (permissions.display !== 'granted') return;

    await ensureNotificationChannel();

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title,
          body,
          channelId: RaddoNotificationChannelId,
          extra: data,
          schedule: { at: new Date(Date.now() + 100) },
          sound: 'default',
        },
      ],
    });
    return;
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

export async function onAppNotificationTap(callback: (data: Record<string, string>) => void) {
  if (!Capacitor.isNativePlatform()) return undefined;

  const listener = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    callback((event.notification.extra ?? {}) as Record<string, string>);
  });

  return () => {
    void listener.remove();
  };
}

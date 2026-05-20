import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

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
    return permissions.display;
  }

  if (typeof Notification === 'undefined') return 'denied';
  return Notification.requestPermission();
}

export async function showAppNotification(title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
    const permissions = await LocalNotifications.checkPermissions();
    if (permissions.display !== 'granted') return;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title,
          body,
          schedule: { at: new Date(Date.now() + 100) },
          sound: undefined,
        },
      ],
    });
    return;
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

let listenersReady = false;

export async function registerDeviceForPush(userUid: string) {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;

  if (!listenersReady) {
    listenersReady = true;

    await PushNotifications.addListener('registration', async (token) => {
      await supabase.from('device_push_tokens').upsert(
        {
          platform: Capacitor.getPlatform(),
          token: token.value,
          updated_at: new Date().toISOString(),
          user_uid: userUid,
        },
        { onConflict: 'token' },
      );
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.warn('Push registration error', error);
    });
  }

  await PushNotifications.register();
}

export async function onPushNotificationTap(callback: (data: Record<string, string>) => void) {
  if (!Capacitor.isNativePlatform()) return undefined;

  const listener = await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    callback((event.notification.data ?? {}) as Record<string, string>);
  });

  return () => {
    void listener.remove();
  };
}

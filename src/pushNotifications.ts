import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

let listenersReady = false;
let currentPushUserUid = '';

export async function registerDeviceForPush(userUid: string) {
  if (!Capacitor.isNativePlatform()) return;
  currentPushUserUid = userUid;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;

  if (!listenersReady) {
    listenersReady = true;

    await PushNotifications.addListener('registration', async (token) => {
      if (!currentPushUserUid) return;

      await supabase.rpc('register_device_push_token', {
        platform_value: Capacitor.getPlatform(),
        token_value: token.value,
      });
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

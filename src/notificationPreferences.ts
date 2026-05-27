import { supabase } from './supabase';

export type NotificationPreferences = {
  connectionMessages: boolean;
  connections: boolean;
  enabled: boolean;
  mapChats: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  connectionMessages: true,
  connections: true,
  enabled: true,
  mapChats: true,
};

const preferenceKey = (uid: string) => `raddo-notification-preferences:${uid}`;

export function loadNotificationPreferences(uid: string): NotificationPreferences {
  try {
    const saved = window.localStorage.getItem(preferenceKey(uid));
    if (!saved) return defaultNotificationPreferences;
    return { ...defaultNotificationPreferences, ...JSON.parse(saved) as Partial<NotificationPreferences> };
  } catch {
    return defaultNotificationPreferences;
  }
}

export function saveNotificationPreferencesLocal(uid: string, preferences: NotificationPreferences) {
  window.localStorage.setItem(preferenceKey(uid), JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent('raddo:notification-preferences-updated', { detail: { preferences, uid } }));
}

export async function syncNotificationPreferences(uid: string, preferences: NotificationPreferences) {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      connection_messages: preferences.connectionMessages,
      connections: preferences.connections,
      enabled: preferences.enabled,
      map_chats: preferences.mapChats,
      updated_at: new Date().toISOString(),
      user_uid: uid,
    });

  if (error) throw new Error(error.message || 'Não consegui salvar as preferências de notificação.');
}

export async function saveNotificationPreferences(uid: string, preferences: NotificationPreferences) {
  saveNotificationPreferencesLocal(uid, preferences);
  await syncNotificationPreferences(uid, preferences);
}

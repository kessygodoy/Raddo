import { Bell, Heart, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useMatchProfiles, useSortedMatches } from '../hooks/useMatches';
import type { MapEventNotification } from '../hooks/useMapEvents';
import type { NotificationPreferences } from '../notificationPreferences';
import type { Match } from '../types';

type Props = {
  currentUid: string;
  mapNotifications?: MapEventNotification[];
  matches: Match[];
  onOpenMapNotification: (notificationId: string) => void;
  onOpenNotification: (notificationId: string, matchId: string) => void;
  preferences: NotificationPreferences;
  readNotificationIds: Set<string>;
};

type CachedNotification = {
  id: string;
  matchId?: string;
  timeValue: string | null;
  title: string;
  text: string;
  tone: 'match' | 'message' | 'story_like';
  target: 'chat' | 'map';
};

function notificationsCacheKey(uid: string) {
  return `raddo-notifications-cache:${uid}`;
}

function readNotificationsCache(uid: string) {
  try {
    const saved = window.localStorage.getItem(notificationsCacheKey(uid));
    if (!saved) return [];
    const parsed = JSON.parse(saved) as CachedNotification[];
    return Array.isArray(parsed) ? parsed.map((notification) => ({ ...notification, target: notification.target ?? 'chat' })) : [];
  } catch {
    return [];
  }
}

function relativeTime(dateValue: string | null) {
  if (!dateValue) return '';

  const diffMs = Date.now() - Date.parse(dateValue);
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'agora';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;

  return new Date(dateValue).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function notificationIdForMatch(match: Match) {
  return `${match.id}:${match.lastMessageAt ?? match.createdAt}`;
}

export default function NotificationsPanel({
  currentUid,
  mapNotifications = [],
  matches,
  onOpenMapNotification,
  onOpenNotification,
  preferences,
  readNotificationIds,
}: Props) {
  const { t } = useI18n();
  const sortedMatches = useSortedMatches(matches);
  const profilesByUid = useMatchProfiles(sortedMatches, currentUid);
  const [cachedNotifications, setCachedNotifications] = useState<CachedNotification[]>(() => readNotificationsCache(currentUid));

  useEffect(() => {
    setCachedNotifications(readNotificationsCache(currentUid));
  }, [currentUid]);

  const liveNotifications = useMemo(
    () =>
      sortedMatches.filter((match) => {
        const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);
        if (!preferences.enabled) return false;
        return hasMessage ? preferences.connectionMessages : preferences.connections;
      }).map((match) => {
        const otherUid = match.users.find((uid) => uid !== currentUid) ?? match.users[0];
        const profile = profilesByUid[otherUid];
        const name = profile?.displayName ?? 'Alguem';
        const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);

        return {
          id: notificationIdForMatch(match),
          matchId: match.id,
          timeValue: match.lastMessageAt ?? match.createdAt,
          title: hasMessage ? t('notificationNewMessage') : t('notificationNewMatch'),
          text: hasMessage ? `${name}: ${match.lastMessage}` : t('notificationNewMatchText', { name }),
          tone: hasMessage ? 'message' as const : 'match' as const,
          target: 'chat' as const,
        };
      }),
    [currentUid, preferences, profilesByUid, sortedMatches, t],
  );

  const liveMapNotifications = useMemo(
    () =>
      preferences.enabled
        ? mapNotifications
            .filter((notification) => (notification.tone === 'message' ? preferences.connectionMessages : true))
            .map((notification) => ({
              ...notification,
              target: 'map' as const,
            }))
        : [],
    [mapNotifications, preferences],
  );

  const liveCombinedNotifications = useMemo(
    () =>
      [...liveNotifications, ...liveMapNotifications].sort(
        (a, b) => Date.parse(b.timeValue ?? '') - Date.parse(a.timeValue ?? ''),
      ),
    [liveMapNotifications, liveNotifications],
  );
  const notifications = liveCombinedNotifications.length > 0 ? liveCombinedNotifications : cachedNotifications;

  useEffect(() => {
    if (liveCombinedNotifications.length === 0) return;
    const nextCache = liveCombinedNotifications.slice(0, 80);
    setCachedNotifications(nextCache);
    window.localStorage.setItem(notificationsCacheKey(currentUid), JSON.stringify(nextCache));
  }, [currentUid, liveCombinedNotifications]);

  return (
    <section className="mx-auto grid max-w-lg gap-4">
      <header className="flex items-center justify-between">
        <button
          className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200"
          type="button"
        >
          <Bell className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold">{t('notificationsPage')}</h1>
        <div className="h-10 w-10" />
      </header>

      <section className="raddo-glass overflow-hidden rounded-lg">
        {notifications.length === 0 && <p className="p-4 text-sm text-slate-300">{t('noNotifications')}</p>}
        {notifications.map((notification) => {
          const Icon = notification.tone === 'message' ? MessageCircle : Heart;
          const read = readNotificationIds.has(notification.id);
          return (
            <button
              className={`flex w-full items-center gap-3 border-b border-white/10 p-4 text-left transition last:border-b-0 hover:bg-white/8 ${
                read ? 'opacity-70' : ''
              }`}
              key={notification.id}
              onClick={() => {
                if (notification.target === 'map') {
                  onOpenMapNotification(notification.id);
                  return;
                }
                if (notification.matchId) onOpenNotification(notification.id, notification.matchId);
              }}
              type="button"
            >
              <div className={`notification-icon notification-icon-${notification.tone}`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-white">{notification.title}</h2>
                <p className="mt-1 text-sm leading-5 text-slate-300">{notification.text}</p>
              </div>
              <div className="grid shrink-0 justify-items-end gap-2">
                {!read && <span className="h-2.5 w-2.5 rounded-full bg-[#ff3f68]" />}
                <span className="text-xs text-slate-400">{relativeTime(notification.timeValue)}</span>
              </div>
            </button>
          );
        })}
      </section>
    </section>
  );
}

import { Bell, Heart, MessageCircle } from 'lucide-react';
import { useI18n } from '../i18n';
import { useMatchProfiles, useSortedMatches } from '../hooks/useMatches';
import type { NotificationPreferences } from '../notificationPreferences';
import type { Match } from '../types';

type Props = {
  currentUid: string;
  matches: Match[];
  onOpenNotification: (notificationId: string, matchId: string) => void;
  preferences: NotificationPreferences;
  readNotificationIds: Set<string>;
};

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

export default function NotificationsPanel({ currentUid, matches, onOpenNotification, preferences, readNotificationIds }: Props) {
  const { t } = useI18n();
  const sortedMatches = useSortedMatches(matches);
  const profilesByUid = useMatchProfiles(sortedMatches, currentUid);

  const notifications = sortedMatches.filter((match) => {
    const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);
    if (!preferences.enabled) return false;
    return hasMessage ? preferences.connectionMessages : preferences.connections;
  }).map((match) => {
    const otherUid = match.users.find((uid) => uid !== currentUid) ?? match.users[0];
    const profile = profilesByUid[otherUid];
    const name = profile?.displayName ?? `Match ${otherUid.slice(-4)}`;
    const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);

    return {
      icon: hasMessage ? MessageCircle : Heart,
      id: notificationIdForMatch(match),
      matchId: match.id,
      read: readNotificationIds.has(notificationIdForMatch(match)),
      time: relativeTime(match.lastMessageAt ?? match.createdAt),
      title: hasMessage ? t('notificationNewMessage') : t('notificationNewMatch'),
      text: hasMessage ? `${name}: ${match.lastMessage}` : t('notificationNewMatchText', { name }),
      tone: hasMessage ? 'message' : 'match',
    };
  });

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
          const Icon = notification.icon;
          return (
            <button
              className={`flex w-full items-center gap-3 border-b border-white/10 p-4 text-left transition last:border-b-0 hover:bg-white/8 ${
                notification.read ? 'opacity-70' : ''
              }`}
              key={notification.id}
              onClick={() => onOpenNotification(notification.id, notification.matchId)}
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
                {!notification.read && <span className="h-2.5 w-2.5 rounded-full bg-[#ff3f68]" />}
                <span className="text-xs text-slate-400">{notification.time}</span>
              </div>
            </button>
          );
        })}
      </section>
    </section>
  );
}

import { Bell, Handshake, Heart, MessageCircle, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '../i18n';
import type { MapEventNotification } from '../hooks/useMapEvents';
import type { FriendshipPrompt } from '../hooks/useMatches';
import type { NotificationPreferences } from '../notificationPreferences';
import type { Match, UserProfile } from '../types';

type Props = {
  currentUid: string;
  friendshipPrompts?: FriendshipPrompt[];
  mapNotifications?: MapEventNotification[];
  matchProfilesByUid?: Record<string, UserProfile>;
  matches: Match[];
  notificationsClearedAt: number;
  onOpenMapNotification: (notificationId: string) => void;
  onOpenFriendshipPrompt: (profileUid: string, createdAt: string) => void;
  onOpenNotification: (notificationId: string, matchId: string) => void;
  preferences: NotificationPreferences;
};

type NotificationItem = {
  count?: number;
  eventId?: string;
  groupKey: string;
  id: string;
  matchId?: string;
  profileUid?: string;
  requestCreatedAt?: string;
  target: 'chat' | 'friendship_invite' | 'map';
  text: string;
  timeValue: string | null;
  title: string;
  tone: 'friendship' | 'match' | 'message' | 'story_like';
};

function relativeTime(dateValue: string | null) {
  if (!dateValue) return '';
  const parsed = Date.parse(dateValue);
  if (!Number.isFinite(parsed)) return '';

  const diffMs = Date.now() - parsed;
  if (diffMs < 0) return 'agora';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;

  return new Date(parsed).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function notificationIdForMatch(match: Match) {
  return `${match.id || 'match'}:${match.lastMessageAt ?? match.createdAt ?? 'created'}`;
}

export default function NotificationsPanel({
  currentUid: _currentUid,
  friendshipPrompts = [],
  mapNotifications = [],
  matchProfilesByUid = {},
  matches,
  notificationsClearedAt,
  onOpenMapNotification,
  onOpenFriendshipPrompt,
  onOpenNotification,
  preferences,
}: Props) {
  const { t } = useI18n();
  const safeMatches = Array.isArray(matches) ? matches : [];
  const safeFriendshipPrompts = Array.isArray(friendshipPrompts) ? friendshipPrompts : [];
  const safeMapNotifications = Array.isArray(mapNotifications) ? mapNotifications : [];
  const safePreferences = preferences ?? {
    connectionMessages: true,
    connections: true,
    enabled: true,
    mapChats: true,
  };

  const notifications = useMemo<NotificationItem[]>(() => {
    try {
      if (!safePreferences.enabled) return [];

      const chatNotifications = safeMatches
        .filter((match) => {
          const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);
          if (hasMessage && match.lastMessageSenderUid === _currentUid) return false;
          return hasMessage ? safePreferences.connectionMessages : safePreferences.connections;
        })
        .map<NotificationItem>((match) => {
          const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);
          const isFriendship = !hasMessage && match.connectionType === 'friendship';
          const otherUid = match.users.find((uid) => uid !== _currentUid) ?? '';
          const otherName = matchProfilesByUid[otherUid]?.displayName || 'Alguem';
          return {
            count: hasMessage ? 1 : undefined,
            groupKey: `match:${match.id}`,
            id: notificationIdForMatch(match),
            matchId: match.id,
            target: 'chat',
            text: hasMessage
              ? `${otherName} enviou uma mensagem: ${String(match.lastMessage || '')}`
              : isFriendship
                ? t('friendshipCreated', { name: otherName })
                : t('notificationNewMatchText', { name: otherName }),
            timeValue: match.lastMessageAt ?? match.createdAt ?? null,
            title: hasMessage ? otherName : t(isFriendship ? 'notificationNewFriendship' : 'notificationNewMatch'),
            tone: hasMessage ? 'message' : isFriendship ? 'friendship' : 'match',
          };
        });

      const friendshipInviteItems = safePreferences.connections
        ? safeFriendshipPrompts.map<NotificationItem>((prompt) => ({
            groupKey: `friendship-invite:${prompt.profile.uid}`,
            id: `friendship-invite:${prompt.profile.uid}:${prompt.createdAt}`,
            profileUid: prompt.profile.uid,
            requestCreatedAt: prompt.createdAt,
            target: 'friendship_invite',
            text: `${prompt.profile.displayName} quer formar uma amizade com você. Toque para responder.`,
            timeValue: prompt.createdAt,
            title: 'Convite de amizade',
            tone: 'friendship',
          }))
        : [];

      const mapItems = safeMapNotifications
        .filter((notification) => (notification.tone === 'message' ? safePreferences.connectionMessages : true))
        .map<NotificationItem>((notification) => ({
          count: notification.count,
          eventId: notification.eventId,
          groupKey: notification.groupKey || String(notification.id || ''),
          id: String(notification.id || ''),
          target: 'map',
          text: String(notification.text || ''),
          timeValue: notification.timeValue ?? null,
          title: String(notification.title || 'Raddo'),
          tone: notification.tone === 'story_like' ? 'story_like' : 'message',
        }));

      const grouped = new Map<string, NotificationItem>();
      [...friendshipInviteItems, ...chatNotifications, ...mapItems]
        .filter((notification) => notification.id && notification.title)
        .forEach((notification) => {
          const current = grouped.get(notification.groupKey);
          if (!current) {
            grouped.set(notification.groupKey, notification);
            return;
          }

          const currentTime = Date.parse(current.timeValue ?? '') || 0;
          const nextTime = Date.parse(notification.timeValue ?? '') || 0;
          const latest = nextTime >= currentTime ? notification : current;
          grouped.set(notification.groupKey, {
            ...latest,
            count: (current.count ?? 1) + (notification.count ?? 1),
          });
        });

      return [...grouped.values()]
        .map((notification) => {
          if (notification.tone === 'message' && notification.target === 'chat' && (notification.count ?? 0) > 1) {
            return { ...notification, text: `${notification.title} enviou ${notification.count} mensagens` };
          }
          return notification;
        })
        .sort((a, b) => (Date.parse(b.timeValue ?? '') || 0) - (Date.parse(a.timeValue ?? '') || 0))
        .slice(0, 80);
    } catch {
      return [];
    }
  }, [_currentUid, matchProfilesByUid, safeFriendshipPrompts, safeMapNotifications, safeMatches, safePreferences, t]);

  return (
    <section className="mx-auto grid w-full max-w-lg gap-4 px-1 py-2 text-white">
      <header className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200">
          <Bell className="h-5 w-5" />
        </span>
        <div className="text-center">
          <h1 className="text-lg font-semibold">{t('notificationsPage')}</h1>
          <p className="mt-0.5 text-xs text-slate-400">Atualizações importantes do Raddo</p>
        </div>
        <div className="h-10 w-10" />
      </header>

      <section className="raddo-surface overflow-hidden">
        {notifications.length === 0 && (
          <div className="raddo-empty-state">
            <div className="grid justify-items-center gap-3">
              <span className="raddo-empty-icon">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{t('noNotifications')}</p>
                <p className="mt-1 text-xs text-slate-400">Quando algo novo acontecer, aparece aqui.</p>
              </div>
            </div>
          </div>
        )}
        {notifications.map((notification) => {
          const Icon = notification.tone === 'message' ? MessageCircle : notification.tone === 'friendship' ? Handshake : Heart;
          const read = (Date.parse(notification.timeValue ?? '') || 0) <= notificationsClearedAt;
          return (
            <button
              className={`raddo-notification-row flex w-full items-center gap-3 border-b border-white/10 p-4 text-left transition last:border-b-0 active:scale-[0.995] ${
                read ? 'opacity-70' : ''
              }`}
              key={notification.id}
              onClick={() => {
                if (notification.target === 'friendship_invite' && notification.profileUid && notification.requestCreatedAt) {
                  onOpenFriendshipPrompt(notification.profileUid, notification.requestCreatedAt);
                  return;
                }
                if (notification.target === 'map') {
                  onOpenMapNotification(notification.eventId || notification.id);
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

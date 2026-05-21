import { useEffect, useState } from 'react';
import { Bell, LogOut, Map as MapIcon, MessageCircle, Radar, Sparkles, UserRound } from 'lucide-react';
import { hasSupabaseConfig, supabase } from './supabase';
import { hideAdMobBanner } from './adMob';
import { isDemoMode } from './demoData';
import { createTranslator, I18nProvider, normalizeLanguage } from './i18n';
import { useAuthProfile } from './hooks/useAuthProfile';
import { useMatchProfiles, useMatches } from './hooks/useMatches';
import { useJoinedMapEvents } from './hooks/useMapEvents';
import { useNearbyProfiles } from './hooks/useNearbyProfiles';
import type { AppLanguage, AppTheme, AppView } from './types';
import AuthOverlay from './components/AuthOverlay';
import ChatPanel from './components/ChatPanel';
import Discovery from './components/Discovery';
import ProfileSettings from './components/ProfileSettings';
import RadarMap from './components/RadarMap';
import Onboarding from './components/Onboarding';
import NotificationsPanel from './components/NotificationsPanel';
import { getNotificationPermission, onAppNotificationTap, requestNativeNotifications, showAppNotification } from './nativeNotifications';
import { onPushNotificationTap, registerDeviceForPush } from './pushNotifications';

const navItems = [
  { id: 'radar', labelKey: 'navRadar', icon: Radar },
  { id: 'discover', labelKey: 'navCards', icon: Sparkles },
  { id: 'chat', labelKey: 'navChat', icon: MessageCircle },
  { id: 'profile', labelKey: 'navProfile', icon: UserRound },
] as const;

export default function App() {
  const [view, setView] = useState<AppView>('radar');
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [openMatchId, setOpenMatchId] = useState('');
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<AppTheme>(() => {
    const savedTheme = window.localStorage.getItem('radar-match-theme');
    return savedTheme === 'light' || savedTheme === 'pride' || savedTheme === 'dark' ? savedTheme : 'dark';
  });
  const [language, setLanguageState] = useState<AppLanguage>(() =>
    normalizeLanguage(window.localStorage.getItem('raddo-language') || navigator.language),
  );
  const t = createTranslator(language);
  const { user, profile, loading, profileLoading, profileError } = useAuthProfile();
  const nearbyProfiles = useNearbyProfiles(profile, profile?.lookingFor ?? []);
  const matches = useMatches(user?.id);
  const matchProfilesByUid = useMatchProfiles(matches, profile?.uid ?? '');
  const joinedMapEvents = useJoinedMapEvents(profile?.uid);

  function setLanguage(nextLanguage: AppLanguage) {
    setLanguageState(nextLanguage);
  }

  useEffect(() => {
    window.localStorage.setItem('radar-match-theme', theme);
    document.documentElement.dataset.appTheme = theme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('raddo-language', language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    hideAdMobBanner();
  }, []);

  useEffect(() => {
    if (!profile) {
      setReadNotificationIds(new Set());
      return;
    }

    const saved = window.localStorage.getItem(`raddo-read-notifications:${profile.uid}`);
    setReadNotificationIds(new Set(saved ? JSON.parse(saved) as string[] : []));
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile) return;

    const promptKey = `raddo-notification-prompt:${profile.uid}`;
    const alreadyAsked = window.localStorage.getItem(promptKey) === 'done';
    if (alreadyAsked) return;

    getNotificationPermission().then((permission) => {
      if (permission === 'prompt' || permission === 'prompt-with-rationale' || permission === 'default') {
        setShowNotificationPrompt(true);
      }
    });
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    getNotificationPermission().then((permission) => {
      if (permission === 'granted') {
        void registerDeviceForPush(profile.uid);
      }
    });
  }, [profile]);

  async function requestNotifications() {
    if (!profile) return;

    window.localStorage.setItem(`raddo-notification-prompt:${profile.uid}`, 'done');
    setShowNotificationPrompt(false);
    const permission = await requestNativeNotifications();
    if (permission === 'granted') {
      await registerDeviceForPush(profile.uid);
      await showAppNotification('Raddo', t('notificationEnabledBody'));
    }
  }

  function dismissNotifications() {
    if (profile) window.localStorage.setItem(`raddo-notification-prompt:${profile.uid}`, 'done');
    setShowNotificationPrompt(false);
  }

  function notificationIdForMatch(match: (typeof matches)[number]) {
    return `${match.id}:${match.lastMessageAt ?? match.createdAt}`;
  }

  function notificationTextForMatch(match: (typeof matches)[number]) {
    const otherUid = profile ? match.users.find((uid) => uid !== profile.uid) ?? match.users[0] : match.users[0];
    const otherName = matchProfilesByUid[otherUid]?.displayName ?? 'alguém';
    const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);

    return {
      body: hasMessage ? `${otherName}: ${match.lastMessage}` : t('notificationNewMatchText', { name: otherName }),
      title: hasMessage ? t('notificationNewMessage') : t('notificationNewMatch'),
    };
  }

  useEffect(() => {
    if (!profile || matches.length === 0) return;

    const storageKey = `raddo-device-notifications:${profile.uid}`;
    const saved = window.localStorage.getItem(storageKey);
    const currentIds = matches.map(notificationIdForMatch);

    if (!saved) {
      window.localStorage.setItem(storageKey, JSON.stringify(currentIds));
      return;
    }

    const notifiedIds = new Set(JSON.parse(saved) as string[]);
    const nextIds = new Set([...notifiedIds, ...currentIds]);

    matches.forEach((match) => {
      const notificationId = notificationIdForMatch(match);
      if (notifiedIds.has(notificationId)) return;

      const { body, title } = notificationTextForMatch(match);
      void showAppNotification(title, body, {
        matchId: match.id,
        notificationId,
        view: 'chat',
      });
    });

    window.localStorage.setItem(storageKey, JSON.stringify([...nextIds]));
  }, [matches, matchProfilesByUid, profile, t]);

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    onAppNotificationTap((data) => {
      if (data.view === 'chat' && data.matchId) {
        if (data.notificationId) markNotificationAsRead(data.notificationId);
        setOpenMatchId(data.matchId);
        setView('chat');
      } else if (data.view === 'radar') {
        setView('radar');
      }
    }).then((remove) => {
      removeListener = remove;
    });

    return () => {
      removeListener?.();
    };
  }, [profile]);

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    onPushNotificationTap((data) => {
      if (data.view === 'radar') {
        setView('radar');
      } else if (data.view === 'chat' && data.matchId) {
        setOpenMatchId(data.matchId);
        setView('chat');
      }
    }).then((remove) => {
      removeListener = remove;
    });

    return () => {
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    if (!profile || joinedMapEvents.length === 0) return undefined;

    const eventsById = new Map(joinedMapEvents.map((event) => [event.id, event]));
    const channel = supabase
      .channel(`map-event-device-notifications:${profile.uid}:${joinedMapEvents.map((event) => event.id).sort().join(':')}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'map_event_messages' },
        (payload) => {
          const message = payload.new as {
            id?: string;
            event_id?: string;
            sender_name?: string;
            sender_uid?: string;
            text?: string;
          };
          if (!message.event_id || !message.id) return;
          if (message.sender_uid === profile.uid) return;

          const mapEvent = eventsById.get(message.event_id);
          if (!mapEvent) return;

          void showAppNotification(mapEvent.title, `${message.sender_name || 'AlguÃ©m'}: ${message.text || ''}`, {
            eventId: mapEvent.id,
            notificationId: `map-event-message:${message.id}`,
            view: 'radar',
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joinedMapEvents, profile]);

  function markNotificationAsRead(notificationId: string) {
    if (!profile) return;

    setReadNotificationIds((current) => {
      const next = new Set(current);
      next.add(notificationId);
      window.localStorage.setItem(`raddo-read-notifications:${profile.uid}`, JSON.stringify([...next]));
      return next;
    });
  }

  function openNotification(notificationId: string, matchId: string) {
    markNotificationAsRead(notificationId);
    setOpenMatchId(matchId);
    setView('chat');
  }

  let content;

  if (!hasSupabaseConfig && !isDemoMode) {
    content = (
      <main className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-md rounded-lg border border-rose-300/30 bg-rose-300/10 p-5">
          <h1 className="text-xl font-semibold">Raddo</h1>
          <p className="mt-3 text-sm text-rose-50/80">
            Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env para iniciar o app.
          </p>
        </section>
      </main>
    );
  } else if (loading || (user && profileLoading)) {
    content = (
      <main className="grid min-h-dvh place-items-center bg-slate-950 text-white">
        <div className="h-11 w-11 animate-spin rounded-full border-2 border-teal-300 border-t-transparent" />
      </main>
    );
  } else if (user && !profile) {
    content = (
      <main className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-white">
        <section className="w-full max-w-md rounded-lg border border-rose-300/30 bg-rose-300/10 p-5">
          <h1 className="text-xl font-semibold">{t('loadingProfileTitle')}</h1>
          <p className="mt-3 text-sm text-rose-50/80">{profileError || t('loadingProfileFallback')}</p>
          <p className="mt-3 text-sm text-slate-300">{t('loadingProfileHint')}</p>
          <button
            className="mt-4 h-11 rounded-lg bg-teal-300 px-4 font-semibold text-slate-950"
            onClick={() => {
              if (!isDemoMode) supabase.auth.signOut();
            }}
            type="button"
          >
            {t('signOutTryAgain')}
          </button>
        </section>
      </main>
    );
  } else if (!user || !profile) {
    content = <AuthOverlay />;
  } else {
    const needsOnboarding =
      !onboardingDone &&
      window.localStorage.getItem(`raddo-onboarding:${profile.uid}`) !== 'done' &&
      (!profile.bio || profile.sexualities.length === 0 || profile.lookingFor.length === 0);

    content = needsOnboarding ? (
      <Onboarding profile={profile} onDone={() => setOnboardingDone(true)} />
    ) : (
      <main className={`app-shell theme-${theme} h-dvh overflow-hidden text-white`}>
        {showNotificationPrompt && (
          <div className="fixed inset-0 z-[1500] grid place-items-center bg-black/60 p-4 backdrop-blur-sm sm:p-6">
            <section className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
              <h1 className="text-xl font-semibold">{t('notificationTitle')}</h1>
              <p className="mt-2 text-sm text-slate-300">{t('notificationText')}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                  onClick={dismissNotifications}
                  type="button"
                >
                  {t('notNow')}
                </button>
                <button
                  className="h-11 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950"
                  onClick={requestNotifications}
                  type="button"
                >
                  {t('enable')}
                </button>
              </div>
            </section>
          </div>
        )}
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
          <header className="flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+16px)] sm:px-6">
            <button
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-left"
              onClick={() => setView('radar')}
              type="button"
            >
              <MapIcon className="h-5 w-5 text-teal-300" />
              <span className="leading-tight">
                <strong className="block text-sm">Raddo</strong>
                <span className="text-xs text-slate-300">{t('nearbyCount', { count: nearbyProfiles.length })}</span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              <button
                aria-label={t('notificationsPage')}
                className={`relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200 ${
                  view === 'notifications' ? 'text-[#ff3f68]' : ''
                }`}
                onClick={() => setView('notifications')}
                type="button"
              >
                <Bell className="h-5 w-5" />
                {matches.some((match) => !readNotificationIds.has(notificationIdForMatch(match))) && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ff3f68] ring-2 ring-[#07111f]" />
                )}
              </button>
              <button
                aria-label={t('signOut')}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200"
                onClick={() => supabase.auth.signOut()}
                type="button"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </header>

          <section className={view === 'radar' ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto px-4 pb-24 sm:px-6'}>
            {view === 'radar' && (
              <RadarMap
                me={profile}
                profiles={nearbyProfiles}
                theme={theme}
              />
            )}
            {view === 'discover' && <Discovery me={profile} profiles={nearbyProfiles} />}
            {view === 'chat' && <ChatPanel currentProfile={profile} currentUid={profile.uid} matches={matches} openMatchId={openMatchId} />}
            {view === 'notifications' && (
              <NotificationsPanel
                currentUid={profile.uid}
                matches={matches}
                onOpenNotification={openNotification}
                readNotificationIds={readNotificationIds}
              />
            )}
            {view === 'profile' && (
              <ProfileSettings
                currentLanguage={language}
                currentTheme={theme}
                profile={profile}
                setLanguage={setLanguage}
                setTheme={setTheme}
              />
            )}
          </section>

          <nav className="fixed inset-x-0 bottom-0 z-[700] border-t border-white/10 bg-[#101827]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 backdrop-blur">
            <div className="mx-auto grid max-w-xl grid-cols-4 gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = view === item.id;
                return (
                  <button
                    className={`grid min-h-14 place-items-center rounded-lg text-xs transition ${
                      isActive ? 'bg-teal-300 text-slate-950' : 'text-slate-300 hover:bg-white/8'
                    }`}
                    key={item.id}
                    onClick={() => setView(item.id)}
                    type="button"
                  >
                    <Icon className="h-5 w-5" />
                    <span>{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </main>
    );
  }

  return <I18nProvider value={{ language, setLanguage, t }}>{content}</I18nProvider>;
}

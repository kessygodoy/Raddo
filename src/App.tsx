import { FormEvent, useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Bell, Heart, LogOut, MoreVertical, Radar, Sparkles, UserRound } from 'lucide-react';
import { hasSupabaseConfig, supabase } from './supabase';
import { hideAdMobBanner } from './adMob';
import { isDemoMode } from './demoData';
import { createTranslator, I18nProvider, normalizeLanguage } from './i18n';
import { useAuthProfile } from './hooks/useAuthProfile';
import { useMatchProfiles, useMatches } from './hooks/useMatches';
import { useNearbyProfiles } from './hooks/useNearbyProfiles';
import type { AppLanguage, AppTheme, AppView, ResolvedAppTheme } from './types';
import AuthOverlay from './components/AuthOverlay';
import ChatPanel from './components/ChatPanel';
import Discovery from './components/Discovery';
import ProfileSettings from './components/ProfileSettings';
import RadarMap from './components/RadarMap';
import Onboarding from './components/Onboarding';
import NotificationsPanel from './components/NotificationsPanel';
import RaddoMark from './components/RaddoMark';
import { getNotificationPermission, onAppNotificationTap, requestNativeNotifications, showAppNotification } from './nativeNotifications';
import { onPushNotificationTap, registerDeviceForPush } from './pushNotifications';
import { installAndroidApkUpdate } from './androidUpdater';
import { processAuthUrl } from './authCallback';
import { preloadImages, profileCoverUrl } from './imagePreload';
import {
  defaultNotificationPreferences,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from './notificationPreferences';

const navItems = [
  { id: 'radar', labelKey: 'navRadar', icon: Radar },
  { id: 'discover', labelKey: 'navCards', icon: Sparkles },
  { id: 'chat', labelKey: 'navChat', icon: Heart },
  { id: 'profile', labelKey: 'navProfile', icon: UserRound },
] as const;

const LAST_VIEW_KEY = 'raddo:last-view';

function savedAppView() {
  const saved = window.localStorage.getItem(LAST_VIEW_KEY);
  return saved === 'radar' || saved === 'discover' || saved === 'chat' || saved === 'profile' || saved === 'notifications' ? saved : 'radar';
}

function previousLoginKeys(uid: string, email?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  return [`raddo-known-login-uid:${uid}`, normalizedEmail ? `raddo-known-login-email:${normalizedEmail}` : ''].filter(Boolean);
}

function authDatesIndicatePreviousLogin(createdAt?: string, lastSignInAt?: string) {
  if (!createdAt || !lastSignInAt) return false;
  const createdTime = Date.parse(createdAt);
  const lastSignInTime = Date.parse(lastSignInAt);
  if (!Number.isFinite(createdTime) || !Number.isFinite(lastSignInTime)) return false;
  return lastSignInTime - createdTime > 5 * 60 * 1000;
}

export default function App() {
  const [view, setView] = useState<AppView>(() => savedAppView());
  const [viewHistory, setViewHistory] = useState<AppView[]>([]);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [openMatchId, setOpenMatchId] = useState('');
  const [availableUpdate, setAvailableUpdate] = useState<{
    version?: string;
    message?: string;
    url?: string;
    apkUrl?: string;
  } | null>(null);
  const [updateInstallMessage, setUpdateInstallMessage] = useState('');
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [accountLoggedBefore, setAccountLoggedBefore] = useState(false);
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordRecoveryBusy, setPasswordRecoveryBusy] = useState(false);
  const [passwordRecoveryMessage, setPasswordRecoveryMessage] = useState('');
  const [passwordRecoveryError, setPasswordRecoveryError] = useState('');
  const [passwordRecoveryUrl, setPasswordRecoveryUrl] = useState('');
  const [theme, setTheme] = useState<AppTheme>(() => {
    const savedTheme = window.localStorage.getItem('radar-match-theme');
    return savedTheme === 'light' || savedTheme === 'green' || savedTheme === 'pride' || savedTheme === 'dark' || savedTheme === 'system' ? savedTheme : 'system';
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedAppTheme>(() =>
    window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  );
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const savedLanguage = window.localStorage.getItem('raddo-language');
    return savedLanguage ? normalizeLanguage(savedLanguage) : normalizeLanguage(navigator.language);
  });
  const t = createTranslator(language);
  const resolvedTheme: ResolvedAppTheme = theme === 'system' ? systemTheme : theme;
  const { user, profile, loading, profileLoading, profileError } = useAuthProfile();
  const nearbyProfiles = useNearbyProfiles(profile, profile?.lookingFor ?? []);
  const matches = useMatches(user?.id);
  const matchProfilesByUid = useMatchProfiles(matches, profile?.uid ?? '');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.location.protocol.startsWith('http')) return;
    navigator.serviceWorker.register('/raddo-sw.js').catch((error) => {
      console.warn('Nao consegui registrar cache offline do Raddo.', error);
    });
  }, []);

  function navigateTo(nextView: AppView) {
    setHeaderMenuOpen(false);
    setView((currentView) => {
      if (currentView === nextView) return currentView;
      setViewHistory((currentHistory) => [...currentHistory, currentView].slice(-20));
      return nextView;
    });
  }

  useEffect(() => {
    window.localStorage.setItem(LAST_VIEW_KEY, view);
  }, [view]);

  function goBackOneScreen() {
    setViewHistory((currentHistory) => {
      const previousView = currentHistory[currentHistory.length - 1];
      if (previousView) {
        setView(previousView);
        return currentHistory.slice(0, -1);
      }

      if (view !== 'radar') {
        setView('radar');
      } else {
        void CapacitorApp.exitApp();
      }
      return currentHistory;
    });
  }

  function setLanguage(nextLanguage: AppLanguage) {
    setLanguageState(nextLanguage);
  }

  function openRadarPanel(panel: 'chats' | 'my-chats' | 'nearby-chats' | 'people') {
    navigateTo('radar');
    setHeaderMenuOpen(false);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(`raddo:open-${panel}`));
    }, 80);
  }

  useEffect(() => {
    window.localStorage.setItem('radar-match-theme', theme);
    document.documentElement.dataset.appTheme = theme === 'system' ? systemTheme : theme;
  }, [systemTheme, theme]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!media) return;

    const updateSystemTheme = () => setSystemTheme(media.matches ? 'light' : 'dark');
    updateSystemTheme();
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('raddo-language', language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!user) {
      setAccountLoggedBefore(false);
      return;
    }

    const keys = previousLoginKeys(user.id, user.email);
    const hasLocalLogin = keys.some((key) => window.localStorage.getItem(key) === 'yes');
    const hasAuthHistory = authDatesIndicatePreviousLogin(user.created_at, user.last_sign_in_at);
    setAccountLoggedBefore(hasLocalLogin || hasAuthHistory);
    keys.forEach((key) => window.localStorage.setItem(key, 'yes'));
  }, [user]);

  useEffect(() => {
    hideAdMobBanner();
  }, []);

  useEffect(() => {
    preloadImages(nearbyProfiles.slice(0, 30).map(profileCoverUrl));
  }, [nearbyProfiles]);

  useEffect(() => {
    if (!profile) {
      setReadNotificationIds(new Set());
      setNotificationPreferences(defaultNotificationPreferences);
      return;
    }

    const saved = window.localStorage.getItem(`raddo-read-notifications:${profile.uid}`);
    setReadNotificationIds(new Set(saved ? JSON.parse(saved) as string[] : []));
    setNotificationPreferences(loadNotificationPreferences(profile.uid));
  }, [profile?.uid]);

  useEffect(() => {
    const handlePreferencesUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ preferences?: NotificationPreferences; uid?: string }>).detail;
      if (!detail?.preferences || detail.uid !== profile?.uid) return;
      setNotificationPreferences(detail.preferences);
    };

    window.addEventListener('raddo:notification-preferences-updated', handlePreferencesUpdate);

    return () => {
      window.removeEventListener('raddo:notification-preferences-updated', handlePreferencesUpdate);
    };
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

  useEffect(() => {
    const openRecovery = (url = '') => {
      setPasswordRecoveryOpen(true);
      if (url) {
        setPasswordRecoveryUrl(url);
        window.localStorage.setItem('raddo:password-recovery-url', url);
      } else {
        setPasswordRecoveryUrl(window.localStorage.getItem('raddo:password-recovery-url') ?? '');
      }
      setPasswordRecoveryMessage('');
      setPasswordRecoveryError('');
      setNewPassword('');
      setConfirmNewPassword('');
    };

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (urlParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery') {
      const recoveryUrl = window.location.href;
      window.localStorage.setItem('raddo:password-recovery-url', recoveryUrl);
      void processAuthUrl(recoveryUrl).catch((error) => {
        setPasswordRecoveryError(error instanceof Error ? error.message : 'Link de recuperação inválido.');
      });
      openRecovery(recoveryUrl);
      window.history.replaceState(null, document.title, window.location.pathname);
    }

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') openRecovery();
    });
    const handleNativeRecovery = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url ?? '';
      openRecovery(url);
    };
    window.addEventListener('raddo:password-recovery', handleNativeRecovery);

    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('raddo:password-recovery', handleNativeRecovery);
    };
  }, []);

  async function handlePasswordRecoverySubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordRecoveryError('');
    setPasswordRecoveryMessage('');

    if (newPassword.length < 6) {
      setPasswordRecoveryError('A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordRecoveryError('As senhas não conferem.');
      return;
    }

    setPasswordRecoveryBusy(true);
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const recoveryUrl = passwordRecoveryUrl || window.localStorage.getItem('raddo:password-recovery-url') || '';
        if (recoveryUrl) {
          await processAuthUrl(recoveryUrl);
          sessionData = (await supabase.auth.getSession()).data;
        }
      }

      if (!sessionData.session) {
        setPasswordRecoveryError('O link de recuperação expirou ou não abriu corretamente. Peça um novo link em "Esqueci minha senha".');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordRecoveryError(
          error.message.toLowerCase().includes('auth session missing')
            ? 'O link de recuperação expirou ou não abriu corretamente. Peça um novo link em "Esqueci minha senha".'
            : error.message,
        );
        return;
      }
    } catch (error) {
      setPasswordRecoveryError(error instanceof Error ? error.message : 'Não consegui validar o link de recuperação.');
      return;
    } finally {
      setPasswordRecoveryBusy(false);
    }

    setPasswordRecoveryMessage('Senha atualizada. Você já pode entrar com e-mail e senha.');
    window.localStorage.removeItem('raddo:password-recovery-url');
    setPasswordRecoveryUrl('');
    setNewPassword('');
    setConfirmNewPassword('');
    window.setTimeout(() => setPasswordRecoveryOpen(false), 1400);
  }

  async function requestNotifications() {
    if (!profile) return;

    window.localStorage.setItem(`raddo-notification-prompt:${profile.uid}`, 'done');
    setShowNotificationPrompt(false);
    const permission = await requestNativeNotifications();
    if (permission === 'granted') {
      await saveNotificationPreferences(profile.uid, { ...loadNotificationPreferences(profile.uid), enabled: true });
      await registerDeviceForPush(profile.uid);
      await showAppNotification('Raddo', t('notificationEnabledBody'));
    }
  }

  function dismissNotifications() {
    if (profile) window.localStorage.setItem(`raddo-notification-prompt:${profile.uid}`, 'done');
    setShowNotificationPrompt(false);
  }

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    CapacitorApp.addListener('backButton', () => {
      if (showNotificationPrompt) {
        setShowNotificationPrompt(false);
        return;
      }

      const backEvent = new CustomEvent('raddo:android-back', { cancelable: true });
      window.dispatchEvent(backEvent);
      if (backEvent.defaultPrevented) return;

      if (headerMenuOpen) {
        setHeaderMenuOpen(false);
        return;
      }

      goBackOneScreen();
    }).then((handle) => {
      removeListener = () => handle.remove();
    });

    return () => {
      removeListener?.();
    };
  }, [showNotificationPrompt, headerMenuOpen, view, profile]);

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

    let active = true;
    const currentProfileUid = profile.uid;
    const storageKey = `raddo-device-notifications:${profile.uid}`;
    const saved = window.localStorage.getItem(storageKey);
    const currentIds = matches.map(notificationIdForMatch);

    if (!saved) {
      window.localStorage.setItem(storageKey, JSON.stringify(currentIds));
      return;
    }

    const notifiedIds = new Set(JSON.parse(saved) as string[]);
    const nextIds = new Set([...notifiedIds, ...currentIds]);

    async function notifyNewMatches() {
      for (const match of matches) {
        const notificationId = notificationIdForMatch(match);
        if (notifiedIds.has(notificationId)) continue;

        if (match.lastMessage && match.lastMessageAt) {
          const { data } = await supabase
            .from('messages')
            .select('sender_uid')
            .eq('match_id', match.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle<{ sender_uid: string }>();

          if (!active) return;
          if (data?.sender_uid === currentProfileUid) continue;
        }

        const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);
        if (!notificationPreferences.enabled) continue;
        if (hasMessage && !notificationPreferences.connectionMessages) continue;
        if (!hasMessage && !notificationPreferences.connections) continue;

        const { body, title } = notificationTextForMatch(match);
        void showAppNotification(title, body, {
          matchId: match.id,
          notificationId,
          view: 'chat',
        });
      }
    }

    void notifyNewMatches();

    window.localStorage.setItem(storageKey, JSON.stringify([...nextIds]));

    return () => {
      active = false;
    };
  }, [matches, matchProfilesByUid, notificationPreferences, profile, t]);

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    onAppNotificationTap((data) => {
      if (data.view === 'chat' && data.matchId) {
        if (data.notificationId) markNotificationAsRead(data.notificationId);
        setOpenMatchId(data.matchId);
        navigateTo('chat');
      } else if (data.view === 'radar') {
        navigateTo('radar');
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
        navigateTo('radar');
      } else if (data.view === 'chat' && data.matchId) {
        setOpenMatchId(data.matchId);
        navigateTo('chat');
      }
    }).then((remove) => {
      removeListener = remove;
    });

    return () => {
      removeListener?.();
    };
  }, []);

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
    navigateTo('chat');
  }

  async function installAvailableUpdate() {
    if (!availableUpdate) return;

    setUpdateInstallMessage('');
    try {
      if (availableUpdate.apkUrl) {
        await installAndroidApkUpdate(availableUpdate.apkUrl);
        setUpdateInstallMessage('Download iniciado. Quando terminar, confirme a instalação na tela do Android.');
      } else if (availableUpdate.url) {
        window.location.href = availableUpdate.url;
      } else {
        window.location.reload();
      }
    } catch (error) {
      setUpdateInstallMessage(error instanceof Error ? error.message : 'Não consegui iniciar a atualização.');
    }
  }

  let content;

  if (!hasSupabaseConfig && !isDemoMode) {
    content = (
      <main className={`app-shell theme-${resolvedTheme} grid min-h-dvh place-items-center p-6 text-white`}>
        <section className="w-full max-w-md rounded-lg border border-rose-300/30 bg-rose-300/10 p-5">
          <h1 className="text-xl font-semibold">Raddo</h1>
          <p className="mt-3 text-sm text-rose-50/80">
            Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env para iniciar o app.
          </p>
        </section>
      </main>
    );
  } else if (loading || (user && profileLoading && !profile)) {
    content = (
      <main className={`app-shell theme-${resolvedTheme} grid min-h-dvh place-items-center text-white`}>
        <div className="grid place-items-center gap-4">
          <RaddoMark className="h-24 w-24 drop-shadow-[0_0_28px_rgba(255,63,104,0.28)]" />
          <h1 className="text-3xl font-semibold tracking-normal">Raddo</h1>
        </div>
      </main>
    );
  } else if (user && !profile) {
    content = (
      <main className={`app-shell theme-${resolvedTheme} grid min-h-dvh place-items-center p-6 text-white`}>
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
    content = <AuthOverlay theme={resolvedTheme} />;
  } else {
    const needsOnboarding =
      !onboardingDone &&
      !accountLoggedBefore &&
      window.localStorage.getItem(`raddo-onboarding:${profile.uid}`) !== 'done' &&
      (!profile.bio || profile.sexualities.length === 0 || profile.lookingFor.length === 0);

    content = needsOnboarding ? (
      <Onboarding profile={profile} theme={resolvedTheme} onDone={() => setOnboardingDone(true)} />
    ) : (
      <main className={`app-shell theme-${resolvedTheme} h-dvh overflow-hidden text-white`}>
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
        {availableUpdate && (
          <div className="fixed inset-0 z-[1500] grid place-items-center bg-black/60 p-4 backdrop-blur-sm sm:p-6">
            <section className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
              <h1 className="text-xl font-semibold">Nova versão disponível</h1>
              <p className="mt-2 text-sm text-slate-300">
                {availableUpdate.message || 'Existe uma atualização do Raddo. Deseja atualizar agora?'}
              </p>
              {updateInstallMessage && <p className="mt-3 rounded-lg bg-white/8 p-3 text-xs text-slate-200">{updateInstallMessage}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                  onClick={() => {
                    if (availableUpdate.version) {
                      window.localStorage.setItem(`raddo-update-dismissed:${availableUpdate.version}`, 'yes');
                    }
                    setUpdateInstallMessage('');
                    setAvailableUpdate(null);
                  }}
                  type="button"
                >
                  Agora não
                </button>
                <button
                  className="h-11 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950"
                  onClick={installAvailableUpdate}
                  type="button"
                >
                  Atualizar
                </button>
              </div>
            </section>
          </div>
        )}
        <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
          <header
            className={
              view === 'radar'
                ? 'pointer-events-none absolute inset-x-0 top-0 z-[720] flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+16px)] sm:px-6'
                : 'flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+16px)] sm:px-6'
            }
          >
            <div className="pointer-events-auto flex min-w-0 items-center gap-2">
              <button
                className="raddo-top-pill flex min-h-[3.25rem] items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-left"
                onClick={() => openRadarPanel('people')}
                type="button"
              >
                <img alt="" className="h-6 w-6 rounded-md object-contain" src="/raddo-icon.png" />
                <span className="leading-tight">
                  <strong className="block text-sm">Raddo</strong>
                  <span className="text-xs text-slate-300">{t('nearbyCount', { count: nearbyProfiles.length })}</span>
                </span>
              </button>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                aria-label={t('notificationsPage')}
                className={`raddo-header-icon relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200 ${
                  view === 'notifications' ? 'text-[#ff3f68]' : ''
                }`}
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    navigateTo('notifications');
                  }}
                type="button"
              >
                <Bell className="h-5 w-5" />
                {matches.some((match) => !readNotificationIds.has(notificationIdForMatch(match))) && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ff3f68] ring-2 ring-[#07111f]" />
                )}
              </button>
              <div className="relative">
                <button
                  aria-label="Abrir opções dos chats"
                  className="raddo-header-icon grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200"
                  onClick={() => setHeaderMenuOpen((current) => !current)}
                  type="button"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {headerMenuOpen && (
                  <div className="absolute right-0 top-12 z-[900] w-56 overflow-hidden rounded-lg border border-white/10 bg-[#07111f]/95 p-1 text-sm text-white shadow-2xl backdrop-blur">
                    <button
                      className="w-full rounded-md px-3 py-2 text-left font-semibold text-slate-100 hover:bg-white/8"
                      onClick={() => openRadarPanel('my-chats')}
                      type="button"
                    >
                      Meus chats
                    </button>
                    <button
                      className="w-full rounded-md px-3 py-2 text-left font-semibold text-slate-100 hover:bg-white/8"
                      onClick={() => openRadarPanel('chats')}
                      type="button"
                    >
                      Chats em que eu estou
                    </button>
                    <button
                      className="w-full rounded-md px-3 py-2 text-left font-semibold text-slate-100 hover:bg-white/8"
                      onClick={() => openRadarPanel('nearby-chats')}
                      type="button"
                    >
                      Chats próximos
                    </button>
                  </div>
                )}
              </div>
              <button
                aria-label={t('signOut')}
                className="raddo-header-icon grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  supabase.auth.signOut();
                }}
                type="button"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </header>

          <section
            className={
              view === 'radar'
                ? 'min-h-0 flex-1 overflow-hidden'
                : view === 'chat'
                  ? 'min-h-0 flex-1 overflow-hidden px-0 pb-[calc(var(--raddo-bottom-safe)+92px)] pt-2'
                  : 'scrollbar-hidden min-h-0 flex-1 overflow-auto px-4 pb-[calc(var(--raddo-bottom-safe)+220px)] sm:px-6'
            }
          >
            {view === 'radar' && (
              <RadarMap
                matches={matches}
                me={profile}
                profiles={nearbyProfiles}
                theme={resolvedTheme}
              />
            )}
            {view === 'discover' && <Discovery me={profile} profiles={nearbyProfiles} />}
            {view === 'chat' && <ChatPanel currentProfile={profile} currentUid={profile.uid} matches={matches} openMatchId={openMatchId} />}
            {view === 'notifications' && (
              <NotificationsPanel
                currentUid={profile.uid}
                matches={matches}
                onOpenNotification={openNotification}
                preferences={notificationPreferences}
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

          <nav className="raddo-bottom-nav fixed inset-x-0 bottom-0 z-[700] border-t border-white/10 bg-[#101827]/95 px-3 pb-[calc(var(--raddo-bottom-safe)+10px)] pt-2 backdrop-blur">
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
                    onClick={() => navigateTo(item.id)}
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

  return (
    <I18nProvider value={{ language, setLanguage, t }}>
      {content}
      {passwordRecoveryOpen && (
        <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm sm:p-6">
          <form
            className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl"
            onSubmit={handlePasswordRecoverySubmit}
          >
            <h1 className="text-xl font-semibold">Criar nova senha</h1>
            <p className="mt-2 text-sm text-slate-300">Digite uma nova senha para usar login por e-mail no Raddo.</p>
            <label className="mt-4 grid gap-1 text-xs font-semibold text-slate-300">
              Nova senha
              <input
                autoFocus
                className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"
                minLength={6}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Mínimo de 6 caracteres"
                type="password"
                value={newPassword}
              />
            </label>
            <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-300">
              Confirmar senha
              <input
                className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"
                minLength={6}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                placeholder="Digite novamente"
                type="password"
                value={confirmNewPassword}
              />
            </label>
            {passwordRecoveryMessage && <p className="mt-3 rounded-lg bg-teal-300/15 p-3 text-sm text-teal-100">{passwordRecoveryMessage}</p>}
            {passwordRecoveryError && <p className="mt-3 rounded-lg bg-rose-400/15 p-3 text-sm text-rose-100">{passwordRecoveryError}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                disabled={passwordRecoveryBusy}
                onClick={() => setPasswordRecoveryOpen(false)}
                type="button"
              >
                Agora não
              </button>
              <button
                className="h-11 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950 disabled:cursor-wait disabled:opacity-70"
                disabled={passwordRecoveryBusy}
                type="submit"
              >
                {passwordRecoveryBusy ? 'Salvando...' : 'Salvar senha'}
              </button>
            </div>
          </form>
        </div>
      )}
    </I18nProvider>
  );
}

import { FormEvent, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Bell, Handshake, Heart, LogOut, MoreVertical, Radar, Sparkles, UserRound } from 'lucide-react';
import { hasSupabaseConfig, supabase } from './supabase';
import { hideAdMobBanner } from './adMob';
import { isDemoMode } from './demoData';
import { createTranslator, I18nProvider, normalizeLanguage } from './i18n';
import { useAuthProfile } from './hooks/useAuthProfile';
import { sendFriendRequest, useFriendshipPrompts, useIncomingMatchUpgradeRequests, useMatchProfiles, useMatches } from './hooks/useMatches';
import { useMapEventNotifications } from './hooks/useMapEvents';
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
import CachedMediaImage from './components/CachedMediaImage';
import { getNotificationPermission, onAppNotificationTap, requestNativeNotifications, showAppNotification } from './nativeNotifications';
import { onPushNotificationTap, registerDeviceForPush } from './pushNotifications';
import { installAndroidApkUpdate } from './androidUpdater';
import { processAuthUrl } from './authCallback';
import { preloadImages, profileCoverUrl } from './imagePreload';
import { clearRaddoAuthBlockingLocalCaches, clearRaddoDisposableLocalCaches } from './localStorageMaintenance';
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

function clearDisposableLocalCaches() {
  clearRaddoDisposableLocalCaches();
}

function safeSetLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    try {
      clearDisposableLocalCaches();
      window.localStorage.setItem(key, value);
    } catch {
      // Local persistence is best-effort; never crash the app.
    }
  }
}

function safeGetLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savedAppView() {
  const saved = safeGetLocalStorage(LAST_VIEW_KEY);
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
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const [openMatchId, setOpenMatchId] = useState('');
  const [openMapEventId, setOpenMapEventId] = useState('');
  const [availableUpdate, setAvailableUpdate] = useState<{
    version?: string;
    message?: string;
    url?: string;
    apkUrl?: string;
  } | null>(null);
  const [updateInstallMessage, setUpdateInstallMessage] = useState('');
  const [notificationsClearedAt, setNotificationsClearedAt] = useState(0);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [accountLoggedBefore, setAccountLoggedBefore] = useState(false);
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordRecoveryBusy, setPasswordRecoveryBusy] = useState(false);
  const [passwordRecoveryMessage, setPasswordRecoveryMessage] = useState('');
  const [passwordRecoveryError, setPasswordRecoveryError] = useState('');
  const [passwordRecoveryUrl, setPasswordRecoveryUrl] = useState('');
  const [dismissedFriendshipPromptIds, setDismissedFriendshipPromptIds] = useState<Set<string>>(() => new Set());
  const [selectedFriendshipPromptId, setSelectedFriendshipPromptId] = useState('');
  const [friendshipPromptBusy, setFriendshipPromptBusy] = useState(false);
  const [friendshipPromptError, setFriendshipPromptError] = useState('');
  const [theme, setTheme] = useState<AppTheme>(() => {
    const savedTheme = safeGetLocalStorage('radar-match-theme');
    return savedTheme === 'light' || savedTheme === 'green' || savedTheme === 'pride' || savedTheme === 'dark' || savedTheme === 'system' ? savedTheme : 'system';
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedAppTheme>(() =>
    window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  );
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const savedLanguage = safeGetLocalStorage('raddo-language');
    return savedLanguage ? normalizeLanguage(savedLanguage) : normalizeLanguage(navigator.language);
  });
  const t = createTranslator(language);
  const resolvedTheme: ResolvedAppTheme = theme === 'system' ? systemTheme : theme;
  const { user, profile, loading, profileLoading, profileError } = useAuthProfile();
  const nearbyProfiles = useNearbyProfiles(profile, profile?.lookingFor ?? []);
  const matches = useMatches(user?.id);
  const friendshipPrompts = useFriendshipPrompts(user?.id);
  const incomingMatchUpgradeRequests = useIncomingMatchUpgradeRequests(user?.id);
  const friendshipPromptId = (prompt: (typeof friendshipPrompts)[number]) => `${prompt.profile.uid}:${prompt.createdAt}`;
  const friendshipPromptDismissedKey = (prompt: (typeof friendshipPrompts)[number]) =>
    `raddo-friendship-prompt-dismissed:${user?.id ?? ''}:${friendshipPromptId(prompt)}`;
  const activeFriendshipPrompt =
    friendshipPrompts.find((prompt) => friendshipPromptId(prompt) === selectedFriendshipPromptId) ??
    friendshipPrompts.find(
      (prompt) =>
        !dismissedFriendshipPromptIds.has(friendshipPromptId(prompt)) &&
        safeGetLocalStorage(friendshipPromptDismissedKey(prompt)) !== 'yes',
    );
  const mapEventNotifications = useMapEventNotifications(profile?.uid);
  const matchProfilesByUid = useMatchProfiles(matches, profile?.uid ?? '');

  useEffect(() => {
    if (!headerMenuOpen) return undefined;

    const closeOutside = (event: PointerEvent) => {
      if (!headerMenuRef.current?.contains(event.target as Node)) setHeaderMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHeaderMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [headerMenuOpen]);

  useEffect(() => {
    const currentIds = new Set(friendshipPrompts.map(friendshipPromptId));
    setDismissedFriendshipPromptIds((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)));
      const unchanged = next.size === current.size && [...next].every((id) => current.has(id));
      return unchanged ? current : next;
    });
    if (selectedFriendshipPromptId && !currentIds.has(selectedFriendshipPromptId)) setSelectedFriendshipPromptId('');
  }, [friendshipPrompts, selectedFriendshipPromptId]);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.location.protocol.startsWith('http')) return;
    const isLocalDev = import.meta.env.DEV || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (isLocalDev) {
      navigator.serviceWorker.getRegistrations?.().then((registrations) => {
        registrations.forEach((registration) => void registration.unregister());
      });
      return;
    }

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

  async function answerFriendshipPrompt(accept: boolean) {
    if (!user || !activeFriendshipPrompt || friendshipPromptBusy) return;

    const promptId = friendshipPromptId(activeFriendshipPrompt);
    if (!accept) {
      setFriendshipPromptError('');
      setSelectedFriendshipPromptId('');
      setDismissedFriendshipPromptIds((current) => new Set(current).add(promptId));
      safeSetLocalStorage(friendshipPromptDismissedKey(activeFriendshipPrompt), 'yes');
      return;
    }

    setFriendshipPromptBusy(true);
    setFriendshipPromptError('');
    try {
      if (accept) {
        const connected = await sendFriendRequest(user.id, activeFriendshipPrompt.profile.uid);
        if (!connected) throw new Error('O convite não está mais disponível.');
      }
      setSelectedFriendshipPromptId('');
      setDismissedFriendshipPromptIds((current) => new Set(current).add(promptId));
      safeSetLocalStorage(friendshipPromptDismissedKey(activeFriendshipPrompt), 'yes');
    } catch (error) {
      setFriendshipPromptError(error instanceof Error ? error.message : 'Não consegui responder ao convite de amizade.');
    } finally {
      setFriendshipPromptBusy(false);
    }
  }

  function reopenFriendshipPrompt(profileUid: string, createdAt: string) {
    const promptId = `${profileUid}:${createdAt}`;
    safeSetLocalStorage(`raddo-friendship-prompt-dismissed:${user?.id ?? ''}:${promptId}`, 'no');
    setFriendshipPromptError('');
    setDismissedFriendshipPromptIds((current) => {
      const next = new Set(current);
      next.delete(promptId);
      return next;
    });
    setSelectedFriendshipPromptId(promptId);
  }

  useEffect(() => {
    safeSetLocalStorage(LAST_VIEW_KEY, view);
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
    safeSetLocalStorage('radar-match-theme', theme);
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
    safeSetLocalStorage('raddo-language', language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!user) {
      setAccountLoggedBefore(false);
      return;
    }

    const keys = previousLoginKeys(user.id, user.email);
    const hasLocalLogin = keys.some((key) => safeGetLocalStorage(key) === 'yes');
    const hasAuthHistory = authDatesIndicatePreviousLogin(user.created_at, user.last_sign_in_at);
    setAccountLoggedBefore(hasLocalLogin || hasAuthHistory);
    keys.forEach((key) => safeSetLocalStorage(key, 'yes'));
  }, [user]);

  useEffect(() => {
    hideAdMobBanner();
  }, []);

  useEffect(() => {
    preloadImages(nearbyProfiles.slice(0, 30).map(profileCoverUrl));
  }, [nearbyProfiles]);

  useEffect(() => {
    if (!profile) {
      setNotificationsClearedAt(0);
      setNotificationPreferences(defaultNotificationPreferences);
      return;
    }

    const saved = safeGetLocalStorage(`raddo-notifications-cleared-at:${profile.uid}`);
    setNotificationsClearedAt(saved ? Number(saved) || 0 : 0);
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
    const alreadyAsked = safeGetLocalStorage(promptKey) === 'done';
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
        safeSetLocalStorage('raddo:password-recovery-url', url);
      } else {
        setPasswordRecoveryUrl(safeGetLocalStorage('raddo:password-recovery-url') ?? '');
      }
      setPasswordRecoveryMessage('');
      setPasswordRecoveryError('');
      setNewPassword('');
      setConfirmNewPassword('');
    };

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hasAuthCallback = Boolean(
      urlParams.get('code') ||
        urlParams.get('access_token') ||
        hashParams.get('access_token') ||
        urlParams.get('refresh_token') ||
        hashParams.get('refresh_token') ||
        urlParams.get('token_hash') ||
        hashParams.get('token_hash'),
    );
    const isRecoveryCallback = urlParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
    if (hasAuthCallback && !isRecoveryCallback) {
      clearRaddoDisposableLocalCaches();
      clearRaddoAuthBlockingLocalCaches();
      void processAuthUrl(window.location.href)
        .then(() => {
          window.history.replaceState(null, document.title, window.location.pathname);
        })
        .catch((error) => {
          console.error('Supabase auth callback failed', error);
        });
    }
    if (isRecoveryCallback) {
      const recoveryUrl = window.location.href;
      clearRaddoDisposableLocalCaches();
      clearRaddoAuthBlockingLocalCaches();
      safeSetLocalStorage('raddo:password-recovery-url', recoveryUrl);
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
      setPasswordRecoveryError(t('passwordMismatch'));
      return;
    }

    setPasswordRecoveryBusy(true);
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
      const recoveryUrl = passwordRecoveryUrl || safeGetLocalStorage('raddo:password-recovery-url') || '';
        if (recoveryUrl) {
          await processAuthUrl(recoveryUrl);
          sessionData = (await supabase.auth.getSession()).data;
        }
      }

      if (!sessionData.session) {
        setPasswordRecoveryError(t('recoveryLinkExpired'));
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordRecoveryError(
          error.message.toLowerCase().includes('auth session missing')
            ? t('recoveryLinkExpired')
            : error.message,
        );
        return;
      }
    } catch (error) {
      setPasswordRecoveryError(error instanceof Error ? error.message : t('passwordValidationError'));
      return;
    } finally {
      setPasswordRecoveryBusy(false);
    }

    setPasswordRecoveryMessage(t('passwordUpdated'));
    window.localStorage.removeItem('raddo:password-recovery-url');
    setPasswordRecoveryUrl('');
    setNewPassword('');
    setConfirmNewPassword('');
    window.setTimeout(() => setPasswordRecoveryOpen(false), 1400);
  }

  async function requestNotifications() {
    if (!profile) return;

    safeSetLocalStorage(`raddo-notification-prompt:${profile.uid}`, 'done');
    setShowNotificationPrompt(false);
    const permission = await requestNativeNotifications();
    if (permission === 'granted') {
      await saveNotificationPreferences(profile.uid, { ...loadNotificationPreferences(profile.uid), enabled: true });
      await registerDeviceForPush(profile.uid);
      await showAppNotification('Raddo', t('notificationEnabledBody'));
    }
  }

  function dismissNotifications() {
    if (profile) safeSetLocalStorage(`raddo-notification-prompt:${profile.uid}`, 'done');
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

    if (!hasMessage && match.connectionType === 'friendship') {
      return {
        body: t('notificationNewFriendshipText', { name: otherName }),
        title: t('notificationNewFriendship'),
      };
    }

    return {
      body: hasMessage ? `${otherName}: ${match.lastMessage}` : t('notificationNewMatchText', { name: otherName }),
      title: hasMessage ? t('notificationNewMessage') : t('notificationNewMatch'),
    };
  }

  function writeDeviceNotificationIds(storageKey: string, ids: string[]) {
    const compactIds = ids.slice(-200);
    try {
      safeSetLocalStorage(storageKey, JSON.stringify(compactIds));
    } catch {
      try {
        window.localStorage.removeItem(storageKey);
        safeSetLocalStorage(storageKey, JSON.stringify(compactIds.slice(-80)));
      } catch {
        // Device notifications are best-effort; storage quota must never crash the app.
      }
    }
  }

  useEffect(() => {
    if (!profile || matches.length === 0) return;

    let active = true;
    const currentProfileUid = profile.uid;
    const storageKey = `raddo-device-notifications:${profile.uid}`;
    let saved = '';
    try {
      saved = safeGetLocalStorage(storageKey) ?? '';
    } catch {
      saved = '';
    }
    const currentIds = matches.map(notificationIdForMatch);

    if (!saved) {
      writeDeviceNotificationIds(storageKey, currentIds);
      return;
    }

    let savedIds: string[] = [];
    try {
      savedIds = JSON.parse(saved) as string[];
    } catch {
      savedIds = [];
    }
    const notifiedIds = new Set(savedIds);
    const nextIds = new Set([...notifiedIds, ...currentIds]);

    async function notifyNewMatches() {
      for (const match of matches) {
        const notificationId = notificationIdForMatch(match);
        if (notifiedIds.has(notificationId)) continue;
        const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);

        if (hasMessage) {
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

        if (!notificationPreferences.enabled) continue;
        if (hasMessage && !notificationPreferences.connectionMessages) continue;

        const { body, title } = notificationTextForMatch(match);
        void showAppNotification(title, body, {
          matchId: match.id,
          notificationId,
          view: 'chat',
        });
      }
    }

    void notifyNewMatches();

    writeDeviceNotificationIds(storageKey, [...nextIds]);

    return () => {
      active = false;
    };
  }, [matches, matchProfilesByUid, notificationPreferences, profile, t]);

  useEffect(() => {
    if (!profile) return;

    const storageKey = `raddo-device-friendship-invites:${profile.uid}`;
    const currentIds = friendshipPrompts.map(friendshipPromptId);
    const saved = safeGetLocalStorage(storageKey);
    if (!saved) {
      writeDeviceNotificationIds(storageKey, currentIds);
      return;
    }

    let savedIds: string[] = [];
    try {
      savedIds = JSON.parse(saved) as string[];
    } catch {
      savedIds = [];
    }

    const notifiedIds = new Set(savedIds);
    for (const prompt of friendshipPrompts) {
      const notificationId = friendshipPromptId(prompt);
      if (notifiedIds.has(notificationId)) continue;
      if (!notificationPreferences.enabled || !notificationPreferences.connections) continue;
      void showAppNotification(
        'Convite de amizade',
        `${prompt.profile.displayName} quer formar uma amizade com você. Toque para responder.`,
        {
          createdAt: prompt.createdAt,
          notificationId,
          profileUid: prompt.profile.uid,
          view: 'friendship_invite',
        },
      );
    }

    writeDeviceNotificationIds(storageKey, [...new Set([...savedIds, ...currentIds])]);
  }, [friendshipPrompts, notificationPreferences, profile]);

  useEffect(() => {
    if (!profile) return;

    const storageKey = `raddo-device-match-upgrade-requests:${profile.uid}`;
    const currentIds = incomingMatchUpgradeRequests.map((request) => `${request.matchId}:${request.createdAt}`);
    const saved = safeGetLocalStorage(storageKey);
    if (!saved) {
      writeDeviceNotificationIds(storageKey, currentIds);
      return;
    }

    let savedIds: string[] = [];
    try {
      savedIds = JSON.parse(saved) as string[];
    } catch {
      savedIds = [];
    }

    const notifiedIds = new Set(savedIds);
    for (const request of incomingMatchUpgradeRequests) {
      const notificationId = `${request.matchId}:${request.createdAt}`;
      if (notifiedIds.has(notificationId)) continue;
      if (!notificationPreferences.enabled || !notificationPreferences.connections) continue;
      const senderName = matchProfilesByUid[request.requesterUid]?.displayName ?? 'Uma pessoa';
      void showAppNotification('Pedido de match', `${senderName} quer evoluir a amizade para match.`, {
        matchId: request.matchId,
        notificationId,
        view: 'chat',
      });
    }

    writeDeviceNotificationIds(storageKey, [...new Set([...savedIds, ...currentIds])]);
  }, [incomingMatchUpgradeRequests, matchProfilesByUid, notificationPreferences, profile]);

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    onAppNotificationTap((data) => {
      if (data.view === 'chat' && data.matchId) {
        setOpenMatchId(data.matchId);
        navigateTo('chat');
      } else if (data.view === 'friendship_invite' && data.profileUid && data.createdAt) {
        reopenFriendshipPrompt(data.profileUid, data.createdAt);
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

  function notificationTimeValue(value: string | null | undefined) {
    const time = Date.parse(value ?? '');
    return Number.isFinite(time) ? time : 0;
  }

  function clearNotificationBadges() {
    if (!profile) return;
    const now = Date.now();
    setNotificationsClearedAt(now);
    safeSetLocalStorage(`raddo-notifications-cleared-at:${profile.uid}`, String(now));
  }

  const hasUnreadNotifications =
    matches.some((match) => {
      const hasMessage = Boolean(match.lastMessage && match.lastMessageAt);
      if (hasMessage && match.lastMessageSenderUid === profile?.uid) return false;
      return notificationTimeValue(match.lastMessageAt ?? match.createdAt) > notificationsClearedAt;
    }) ||
    mapEventNotifications.some((notification) => notificationTimeValue(notification.timeValue) > notificationsClearedAt) ||
    friendshipPrompts.some((prompt) => notificationTimeValue(prompt.createdAt) > notificationsClearedAt) ||
    incomingMatchUpgradeRequests.some((request) => notificationTimeValue(request.createdAt) > notificationsClearedAt);

  function openNotification(_notificationId: string, matchId: string) {
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
      setUpdateInstallMessage(error instanceof Error ? error.message : t('updateStartError'));
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
      safeGetLocalStorage(`raddo-onboarding:${profile.uid}`) !== 'done' &&
      (!profile.bio || profile.sexualities.length === 0 || profile.lookingFor.length === 0);

    content = needsOnboarding ? (
      <Onboarding profile={profile} theme={resolvedTheme} onDone={() => setOnboardingDone(true)} />
    ) : (
      <main className={`app-shell theme-${resolvedTheme} h-dvh overflow-hidden text-white`}>
        {activeFriendshipPrompt && (
          <div className="raddo-modal-backdrop z-[1600] sm:p-6">
            <section className="raddo-modal-card text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sky-400 text-slate-950">
                <Handshake className="h-7 w-7" />
              </span>
              <h1 className="mt-4 text-lg font-semibold">Convite de amizade</h1>
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-white/8 p-3 text-left">
                <CachedMediaImage
                  className="h-full w-full object-cover"
                  fallbackClassName="h-12 w-12 rounded-lg"
                  src={activeFriendshipPrompt.profile.photoURL}
                  thumbnailOnly
                />
                <p className="min-w-0 text-sm text-slate-200">
                  <strong className="text-white">{activeFriendshipPrompt.profile.displayName}</strong> quer formar uma amizade com você. Você aceita?
                </p>
              </div>
              {friendshipPromptError && (
                <p className="mt-3 rounded-lg bg-rose-400/15 p-3 text-xs text-rose-100">{friendshipPromptError}</p>
              )}
              <div className="raddo-modal-actions">
                <button
                  className="raddo-secondary-action h-11 rounded-lg text-sm font-semibold"
                  disabled={friendshipPromptBusy}
                  onClick={() => void answerFriendshipPrompt(false)}
                  type="button"
                >
                  Agora não
                </button>
                <button
                  className="h-11 rounded-lg bg-sky-400 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50"
                  disabled={friendshipPromptBusy}
                  onClick={() => void answerFriendshipPrompt(true)}
                  type="button"
                >
                  {friendshipPromptBusy ? 'Respondendo...' : 'Aceitar amizade'}
                </button>
              </div>
            </section>
          </div>
        )}
        {showNotificationPrompt && (
          <div className="raddo-modal-backdrop z-[1500] sm:p-6">
            <section className="raddo-modal-card">
              <h1 className="text-lg font-semibold">{t('notificationTitle')}</h1>
              <p className="mt-2 text-sm text-slate-300">{t('notificationText')}</p>
              <div className="raddo-modal-actions">
                <button
                  className="raddo-secondary-action h-11 rounded-lg text-sm font-semibold"
                  onClick={dismissNotifications}
                  type="button"
                >
                  {t('notNow')}
                </button>
                <button
                  className="raddo-primary-action h-11 rounded-lg text-sm font-semibold"
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
          <div className="raddo-modal-backdrop z-[1500] sm:p-6">
            <section className="raddo-modal-card">
              <h1 className="text-lg font-semibold">Nova versão disponível</h1>
              <p className="mt-2 text-sm text-slate-300">
                {availableUpdate.message || 'Existe uma atualização do Raddo. Deseja atualizar agora?'}
              </p>
              {updateInstallMessage && <p className="mt-3 rounded-lg bg-white/8 p-3 text-xs text-slate-200">{updateInstallMessage}</p>}
              <div className="raddo-modal-actions">
                <button
                  className="raddo-secondary-action h-11 rounded-lg text-sm font-semibold"
                  onClick={() => {
                    if (availableUpdate.version) {
                      safeSetLocalStorage(`raddo-update-dismissed:${availableUpdate.version}`, 'yes');
                    }
                    setUpdateInstallMessage('');
                    setAvailableUpdate(null);
                  }}
                  type="button"
                >
                  Agora não
                </button>
                <button
                  className="raddo-primary-action h-11 rounded-lg text-sm font-semibold"
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
                    clearNotificationBadges();
                  }}
                type="button"
              >
                <Bell className="h-5 w-5" />
                {hasUnreadNotifications && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ff3f68] ring-2 ring-[#07111f]" />
                )}
              </button>
              <div className="relative" ref={headerMenuRef}>
                <button
                  aria-label={t('chatOptions')}
                  className="raddo-header-icon grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200"
                  onClick={() => setHeaderMenuOpen((current) => !current)}
                  type="button"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {headerMenuOpen && (
                  <div className="raddo-menu-panel absolute right-0 top-12 z-[900] w-56 overflow-hidden p-1 text-sm text-white backdrop-blur">
                    <button
                      className="w-full rounded-md px-3 py-2 text-left font-semibold text-slate-100 hover:bg-white/8"
                      onClick={() => openRadarPanel('my-chats')}
                      type="button"
                    >
                      Meus convites
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
                      Convites próximos
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
                  : view === 'notifications'
                    ? 'scrollbar-hidden min-h-0 flex-1 overflow-auto px-4 pb-[calc(var(--raddo-bottom-safe)+140px)] pt-4 sm:px-6'
                  : 'scrollbar-hidden min-h-0 flex-1 overflow-auto px-4 pb-[calc(var(--raddo-bottom-safe)+220px)] sm:px-6'
            }
          >
            {view === 'radar' && (
              <RadarMap
                matches={matches}
                me={profile}
                onOpenConnection={(matchId) => {
                  setOpenMatchId(matchId);
                  navigateTo('chat');
                }}
                onOpenEventHandled={(eventId) => {
                  setOpenMapEventId((current) => (current === eventId ? '' : current));
                }}
                openEventId={openMapEventId}
                profiles={nearbyProfiles}
                theme={resolvedTheme}
              />
            )}
            {view === 'discover' && <Discovery me={profile} profiles={nearbyProfiles} />}
            {view === 'chat' && (
              <ChatPanel
                currentProfile={profile}
                currentUid={profile.uid}
                matches={matches}
                onOpenMatch={setOpenMatchId}
                onShowList={() => setOpenMatchId('')}
                openMatchId={openMatchId}
              />
            )}
            {view === 'notifications' && (
              <NotificationsPanel
                currentUid={profile.uid}
                friendshipPrompts={friendshipPrompts}
                matchUpgradeRequests={incomingMatchUpgradeRequests}
                mapNotifications={mapEventNotifications}
                matchProfilesByUid={matchProfilesByUid}
                matches={matches}
                onOpenMapNotification={(notificationId) => {
                  setOpenMapEventId(notificationId);
                  navigateTo('radar');
                }}
                onOpenFriendshipPrompt={reopenFriendshipPrompt}
                onOpenNotification={openNotification}
                notificationsClearedAt={notificationsClearedAt}
                preferences={notificationPreferences}
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
                    className={`grid min-h-14 place-items-center rounded-lg text-xs font-medium transition ${
                      isActive ? 'raddo-bottom-nav-active' : 'text-slate-300'
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
        <div className="raddo-modal-backdrop z-[2000] sm:p-6">
          <form
            className="raddo-modal-card"
            onSubmit={handlePasswordRecoverySubmit}
          >
            <h1 className="text-lg font-semibold">{t('createNewPassword')}</h1>
            <p className="mt-2 text-sm text-slate-300">{t('recoveryPasswordIntro')}</p>
            <label className="mt-4 grid gap-1 text-xs font-semibold text-slate-300">
              {t('newPassword')}
              <input
                autoFocus
                className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"
                minLength={6}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={t('passwordPlaceholder')}
                type="password"
                value={newPassword}
              />
            </label>
            <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-300">
              {t('confirmPassword')}
              <input
                className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"
                minLength={6}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                placeholder={t('confirmPasswordPlaceholder')}
                type="password"
                value={confirmNewPassword}
              />
            </label>
            {passwordRecoveryMessage && <p className="mt-3 rounded-lg bg-teal-300/15 p-3 text-sm text-teal-100">{passwordRecoveryMessage}</p>}
            {passwordRecoveryError && <p className="mt-3 rounded-lg bg-rose-400/15 p-3 text-sm text-rose-100">{passwordRecoveryError}</p>}
            <div className="raddo-modal-actions">
              <button
                className="raddo-secondary-action h-11 rounded-lg text-sm font-semibold"
                disabled={passwordRecoveryBusy}
                onClick={() => setPasswordRecoveryOpen(false)}
                type="button"
              >
                {t('notNow')}
              </button>
              <button
                className="raddo-primary-action h-11 rounded-lg text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                disabled={passwordRecoveryBusy}
                type="submit"
              >
                {passwordRecoveryBusy ? t('saving') : t('savePassword')}
              </button>
            </div>
          </form>
        </div>
      )}
    </I18nProvider>
  );
}

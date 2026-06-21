import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Flag, Handshake, Heart, ImagePlus, MessageCircle, MoreVertical, Search, Send, ShieldOff, UserX, X } from 'lucide-react';
import type { Match, Message, UserProfile } from '../types';
import {
  blockProfile,
  deleteMessage,
  editMessage,
  markMessageImageViewed,
  reportProfile,
  requestMatchUpgrade,
  respondMatchUpgrade,
  sendDislike,
  sendFriendRequest,
  sendMessage,
  trySendLike,
  unmatchProfile,
  useMatchProfiles,
  useMatchUpgradeRequest,
  useMessages,
  useSortedMatches,
} from '../hooks/useMatches';
import ProfilePreview from './ProfilePreview';
import ChatImageMessage from './ChatImageMessage';
import { prepareChatImageFile, uploadChatMedia } from '../chatImages';
import PendingChatImageModal from './PendingChatImageModal';
import MessageActionsMenu from './MessageActionsMenu';
import CachedMediaImage from './CachedMediaImage';
import { useI18n } from '../i18n';

function isVideoMedia(url: string, text?: string) {
  return text === 'Vídeo' || /\.(mp4|mov|m4v|webm|ogg)(\?|#|$)/i.test(url);
}

type CachedConversation = {
  createdAt: string;
  displayName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  matchId: string;
  otherUid: string;
  photoURL: string;
};

function conversationCacheKey(uid: string) {
  return `raddo-connections-summary:${uid}`;
}

function readConversationCache(uid: string) {
  try {
    const saved = window.localStorage.getItem(conversationCacheKey(uid));
    if (!saved) return {};
    const parsed = JSON.parse(saved) as Record<string, CachedConversation>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

type Props = {
  currentUid: string;
  matches: Match[];
  currentProfile: UserProfile;
  onOpenMatch?: (matchId: string) => void;
  onShowList?: () => void;
  openMatchId?: string;
};

export default function ChatPanel({ currentProfile, currentUid, matches, onOpenMatch, onShowList, openMatchId }: Props) {
  const { language, t } = useI18n();
  const sortedMatches = useSortedMatches(matches);
  const profilesByUid = useMatchProfiles(sortedMatches, currentUid);
  const [cachedConversations, setCachedConversations] = useState<Record<string, CachedConversation>>(() => readConversationCache(currentUid));
  const [activeMatchId, setActiveMatchId] = useState('');
  const [chatView, setChatView] = useState<'list' | 'conversation'>('list');
  const [text, setText] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [connectionFilter, setConnectionFilter] = useState<'all' | 'romantic' | 'friendship'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [openMessageMenuId, setOpenMessageMenuId] = useState('');
  const [matchMenuOpen, setMatchMenuOpen] = useState(false);
  const [matchUpgradeBusy, setMatchUpgradeBusy] = useState(false);
  const [showMatchUpgradeCelebration, setShowMatchUpgradeCelebration] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [viewOnceViewerIds, setViewOnceViewerIds] = useState<string[] | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const matchMenuRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const handledOpenMatchIdRef = useRef('');
  const activeMatch = useMemo(
    () => sortedMatches.find((match) => match.id === activeMatchId) ?? null,
    [activeMatchId, sortedMatches],
  );
  const messages = useMessages(activeMatch?.id);
  const matchUpgradeRequest = useMatchUpgradeRequest(activeMatch?.id);
  const activeOtherUid = activeMatch?.users.find((uid) => uid !== currentUid) ?? activeMatch?.users[0] ?? '';
  const activeCachedConversation = activeMatch ? cachedConversations[activeMatch.id] : undefined;
  const activeProfile = profilesByUid[activeOtherUid];
  const activeDisplayName = activeProfile?.displayName ?? activeCachedConversation?.displayName ?? t('savedProfile');
  const activePhotoURL = activeProfile?.photos?.[0] || activeProfile?.photoURL || activeCachedConversation?.photoURL || '';
  const filteredMatches = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase(language);
    return sortedMatches.filter((match) => {
      if (connectionFilter !== 'all' && match.connectionType !== connectionFilter) return false;
      if (!normalizedSearch) return true;
      const otherUid = match.users.find((uid) => uid !== currentUid) ?? match.users[0];
      const profile = profilesByUid[otherUid];
      const cached = cachedConversations[match.id];
      const displayName = profile?.displayName ?? cached?.displayName ?? '';
      return displayName.toLocaleLowerCase(language).includes(normalizedSearch);
    });
  }, [cachedConversations, connectionFilter, currentUid, language, profilesByUid, searchTerm, sortedMatches]);
  const visibleMessages = useMemo(
    () => {
      const persistedKeys = new Set(
        messages.map((message) => `${message.matchId}:${message.senderUid}:${message.text.trim().toLowerCase()}:${message.imageURL}`),
      );
      const pendingMessages = optimisticMessages.filter((message) => {
        if (message.matchId !== activeMatch?.id) return false;
        const key = `${message.matchId}:${message.senderUid}:${message.text.trim().toLowerCase()}:${message.imageURL}`;
        return !persistedKeys.has(key);
      });

      return [...messages, ...pendingMessages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    },
    [activeMatch?.id, messages, optimisticMessages],
  );
  const messagesAfterMatchUpgrade = matchUpgradeRequest?.respondedAt
    ? visibleMessages.filter((message) => Date.parse(message.createdAt) > Date.parse(matchUpgradeRequest.respondedAt ?? '')).length
    : 0;
  const showMatchUpgradeCard = Boolean(
    matchUpgradeRequest?.status === 'pending' ||
      (matchUpgradeRequest?.status === 'accepted' && messagesAfterMatchUpgrade < 3),
  );

  useEffect(() => {
    if (matchUpgradeRequest?.status !== 'accepted' || !matchUpgradeRequest.respondedAt || !activeMatch?.id) return undefined;
    const celebrationKey = `raddo-match-upgrade-celebrated:${currentUid}:${activeMatch.id}:${matchUpgradeRequest.respondedAt}`;
    try {
      if (window.localStorage.getItem(celebrationKey) === 'yes') return undefined;
      window.localStorage.setItem(celebrationKey, 'yes');
    } catch {
      // The animation is best-effort when local storage is unavailable.
    }

    setShowMatchUpgradeCelebration(true);
    const timer = window.setTimeout(() => setShowMatchUpgradeCelebration(false), 2600);
    return () => window.clearTimeout(timer);
  }, [activeMatch?.id, currentUid, matchUpgradeRequest?.respondedAt, matchUpgradeRequest?.status]);

  useEffect(() => {
    setCachedConversations(readConversationCache(currentUid));
  }, [currentUid]);

  useEffect(() => {
    if (sortedMatches.length === 0) return;

    setCachedConversations((current) => {
      const next = { ...current };
      sortedMatches.forEach((match) => {
        const otherUid = match.users.find((uid) => uid !== currentUid) ?? match.users[0];
        if (!otherUid) return;
        const profile = profilesByUid[otherUid];
        const previous = next[match.id];
        const displayName = profile?.displayName ?? previous?.displayName ?? '';
        next[match.id] = {
          createdAt: match.createdAt,
          displayName: displayName === 'Carregando perfil' ? '' : displayName,
          lastMessage: match.lastMessage || previous?.lastMessage || t('conversationStarted'),
          lastMessageAt: match.lastMessageAt ?? previous?.lastMessageAt ?? null,
          matchId: match.id,
          otherUid,
          photoURL: profile?.photos?.[0] || profile?.photoURL || previous?.photoURL || '',
        };
      });

      const validIds = new Set(sortedMatches.map((match) => match.id));
      Object.keys(next).forEach((matchId) => {
        if (!validIds.has(matchId)) delete next[matchId];
      });

      window.localStorage.setItem(conversationCacheKey(currentUid), JSON.stringify(next));
      return next;
    });
  }, [currentUid, profilesByUid, sortedMatches, t]);
  useEffect(() => {
    if (openMatchId && handledOpenMatchIdRef.current !== openMatchId && sortedMatches.some((match) => match.id === openMatchId)) {
      handledOpenMatchIdRef.current = openMatchId;
      shouldStickToBottomRef.current = true;
      setActiveMatchId(openMatchId);
      setChatView('conversation');
      setMatchMenuOpen(false);
    }
  }, [openMatchId, sortedMatches]);

  function scrollMessagesToBottom(behavior: ScrollBehavior = 'auto') {
    const area = messageAreaRef.current;
    if (!area) return;
    area.scrollTo({ top: area.scrollHeight, behavior });
    messageEndRef.current?.scrollIntoView({ block: 'end', behavior });
  }

  useEffect(() => {
    if (chatView !== 'conversation' || !activeMatchId) return undefined;
    shouldStickToBottomRef.current = true;
    scrollMessagesToBottom();
    const frame = window.requestAnimationFrame(() => scrollMessagesToBottom());
    const timers = [120, 400, 900].map((delay) => window.setTimeout(() => scrollMessagesToBottom(), delay));
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeMatchId, chatView]);

  useEffect(() => {
    const handleBack = (event: Event) => {
      if (previewProfile) {
        event.preventDefault();
        setPreviewProfile(null);
        return;
      }

      if (viewOnceViewerIds) {
        event.preventDefault();
        setViewOnceViewerIds(null);
        return;
      }

      if (openMessageMenuId) {
        event.preventDefault();
        setOpenMessageMenuId('');
        return;
      }

      if (matchMenuOpen) {
        event.preventDefault();
        setMatchMenuOpen(false);
        return;
      }

      if (chatView === 'conversation') {
        event.preventDefault();
        setChatView('list');
        setMatchMenuOpen(false);
        setActiveMatchId('');
        onShowList?.();
      }
    };

    window.addEventListener('raddo:android-back', handleBack);

    return () => {
      window.removeEventListener('raddo:android-back', handleBack);
    };
  }, [chatView, matchMenuOpen, openMessageMenuId, previewProfile, viewOnceViewerIds]);

  useEffect(() => {
    if (!messageAreaRef.current || chatView !== 'conversation') return;
    if (!shouldStickToBottomRef.current) return;

    scrollMessagesToBottom('smooth');
  }, [chatView, matchUpgradeRequest?.createdAt, matchUpgradeRequest?.status, visibleMessages.length]);

  useEffect(() => {
    if (!matchMenuOpen) return undefined;

    function closeMenuOnOutsidePress(event: PointerEvent) {
      if (matchMenuRef.current?.contains(event.target as Node)) return;
      setMatchMenuOpen(false);
    }

    document.addEventListener('pointerdown', closeMenuOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeMenuOnOutsidePress);
  }, [matchMenuOpen]);

  function handleMessageAreaScroll() {
    const area = messageAreaRef.current;
    if (!area) return;
    const distanceFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanText = text.trim();
    if (sendingText || !activeMatch || !cleanText) return;

    const nextMessage: Message = {
      id: `local-${Date.now()}`,
      senderUid: currentUid,
      text: cleanText,
      matchId: activeMatch.id,
      messageType: 'text',
      imageURL: '',
      imagePath: '',
      viewOnce: false,
      viewedBy: [],
      createdAt: new Date().toISOString(),
    };

    setOptimisticMessages((current) => [...current, nextMessage]);
    shouldStickToBottomRef.current = true;
    setText('');
    setSendingText(true);
    try {
      await sendMessage(activeMatch.id, currentUid, cleanText, currentProfile.displayName);
    } catch (error) {
      setOptimisticMessages((current) => current.filter((message) => message.id !== nextMessage.id));
      setText(cleanText);
      setActionMessage(error instanceof Error ? error.message : t('messageSendError'));
    } finally {
      setSendingText(false);
    }
  }

  function selectMatch(matchId: string) {
    setActiveMatchId(matchId);
    setChatView('conversation');
    setMatchMenuOpen(false);
    onOpenMatch?.(matchId);
  }

  async function handleUnmatch() {
    if (!activeMatch || !activeOtherUid) return;
    setMatchMenuOpen(false);
    const confirmed = window.confirm(t('unmatchConfirm'));
    if (!confirmed) return;

    try {
      await unmatchProfile(currentUid, activeOtherUid, activeMatch.id);
      setActionMessage(t('matchUndone'));
      setActiveMatchId('');
      setChatView('list');
      onShowList?.();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t('unmatchError'));
    }
  }

  async function handleBlock() {
    if (!activeMatch || !activeOtherUid) return;
    setMatchMenuOpen(false);
    const confirmed = window.confirm(t('blockConfirm'));
    if (!confirmed) return;

    try {
      await blockProfile(currentUid, activeOtherUid, activeMatch.id);
      setActionMessage(t('blockedSuccess'));
      setActiveMatchId('');
      setChatView('list');
      onShowList?.();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t('blockError'));
    }
  }

  async function handleReport() {
    if (!activeOtherUid) return;
    setMatchMenuOpen(false);
    const confirmed = window.confirm(t('reportConversationConfirm'));
    if (!confirmed) return;

    try {
      await reportProfile(currentUid, activeOtherUid, 'chat_conversation');
      setActionMessage(t('reportSent'));
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t('reportSendError'));
    }
  }

  async function handleRequestMatchUpgrade() {
    if (!activeMatch || activeMatch.connectionType !== 'friendship' || matchUpgradeBusy) return;
    setMatchMenuOpen(false);
    setMatchUpgradeBusy(true);
    setActionMessage('');
    try {
      await requestMatchUpgrade(activeMatch.id, currentUid, currentProfile.displayName);
      setActionMessage('Pedido de match enviado.');
      shouldStickToBottomRef.current = true;
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui enviar o pedido de match.');
    } finally {
      setMatchUpgradeBusy(false);
    }
  }

  async function handleRespondMatchUpgrade(accept: boolean) {
    if (!activeMatch || !matchUpgradeRequest || matchUpgradeBusy) return;
    setMatchUpgradeBusy(true);
    setActionMessage('');
    try {
      await respondMatchUpgrade(activeMatch.id, accept);
      setActionMessage(accept ? `Você e ${activeDisplayName} agora deram match!` : 'Pedido de match recusado.');
      shouldStickToBottomRef.current = true;
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui responder ao pedido de match.');
    } finally {
      setMatchUpgradeBusy(false);
    }
  }

  async function handlePreviewLike(profile: UserProfile) {
    const result = await trySendLike(currentProfile, profile.uid);
    setActionMessage(result.ok ? (result.matched ? t('matchedWith', { name: profile.displayName }) : t('likedPerson', { name: profile.displayName })) : result.message);
    if (result.ok) setPreviewProfile(null);
  }

  async function handlePreviewDislike(profile: UserProfile) {
    try {
      await sendDislike(currentUid, profile.uid);
      setActionMessage(t('declinedPerson', { name: profile.displayName }));
      setPreviewProfile(null);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t('dislikeError'));
    }
  }

  async function handlePreviewFriend(profile: UserProfile) {
    try {
      const connected = await sendFriendRequest(currentUid, profile.uid);
      setActionMessage(connected ? t('friendshipCreated', { name: profile.displayName }) : t('friendRequestSent', { name: profile.displayName }));
      setPreviewProfile(null);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t('friendshipError'));
    }
  }

  async function handleEditMessage(message: Message) {
    setOpenMessageMenuId('');
    const nextText = window.prompt(t('editMessage'), message.text);
    if (!nextText || nextText.trim() === message.text.trim()) return;

    try {
      await editMessage(message, currentUid, nextText);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t('editMessageError'));
    }
  }

  async function handleDeleteMessage(message: Message) {
    setOpenMessageMenuId('');
    const confirmed = window.confirm(t('deleteMessageConfirm'));
    if (!confirmed) return;

    try {
      await deleteMessage(message, currentUid);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t('deleteMessageError'));
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b1724] shadow-2xl">
      {showMatchUpgradeCelebration && (
        <div className="match-upgrade-celebration" aria-live="polite">
          <span className="match-upgrade-main-heart">
            <Heart className="h-16 w-16 fill-current" />
          </span>
          <div className="match-upgrade-floating-hearts" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => <span key={index}>♥</span>)}
          </div>
          <p>Agora é match!</p>
        </div>
      )}
      {previewProfile && (
        <ProfilePreview
          me={currentProfile}
          onClose={() => setPreviewProfile(null)}
          onDislike={previewProfile.uid !== currentUid ? handlePreviewDislike : undefined}
          onFriend={previewProfile.uid !== currentUid ? handlePreviewFriend : undefined}
          onLike={previewProfile.uid !== currentUid ? handlePreviewLike : undefined}
          profile={previewProfile}
        />
      )}
      {viewOnceViewerIds && (
        <div className="fixed inset-0 z-[1600] grid place-items-end bg-black/65 p-4 pb-[calc(var(--raddo-bottom-safe)+16px)] pt-[calc(env(safe-area-inset-top)+16px)] backdrop-blur-sm sm:place-items-center">
          <section className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-4 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{t('whoViewedImage')}</h2>
              <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/8" onClick={() => setViewOnceViewerIds(null)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid max-h-[55dvh] gap-2 overflow-auto scrollbar-hidden">
              {viewOnceViewerIds.length === 0 ? (
                <p className="rounded-lg bg-white/8 p-3 text-sm text-slate-300">{t('nobodyViewed')}</p>
              ) : (
                viewOnceViewerIds.map((uid) => {
                  const profile = uid === currentUid ? currentProfile : profilesByUid[uid];
                  return (
                    <button
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-left text-sm text-slate-100 disabled:opacity-70"
                      disabled={!profile}
                      key={uid}
                      onClick={() => {
                        if (!profile) return;
                        setViewOnceViewerIds(null);
                        setPreviewProfile(profile);
                      }}
                      type="button"
                    >
                      <span className="min-w-0 truncate font-semibold">{profile?.displayName ?? t('raddoPerson')}</span>
                      {profile && <span className="text-xs text-slate-400">{t('viewBio')}</span>}
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
      {chatView === 'list' && (
      <aside className="flex min-h-0 flex-1 flex-col bg-[#0f1f2d]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h1 className="text-lg font-semibold">{t('conversations')}</h1>
          <MessageCircle className="h-5 w-5 text-teal-300" />
        </div>

        <div className="border-b border-white/10 p-3">
          <label className="flex h-10 items-center gap-2 rounded-lg bg-[#07111f] px-3 text-slate-300">
            <Search className="h-4 w-4" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('searchConversation')}
              type="search"
              value={searchTerm}
            />
          </label>
          <div className="mt-3 grid grid-cols-3 rounded-lg border border-white/10 bg-[#07111f] p-1 text-xs font-semibold">
            {([
              ['all', 'allConnections'],
              ['romantic', 'romanticMatches'],
              ['friendship', 'friendships'],
            ] as const).map(([value, label]) => (
              <button
                className={`h-9 rounded-md transition ${connectionFilter === value ? value === 'friendship' ? 'bg-sky-400/15 text-sky-300' : 'bg-[#ff3f68] text-white' : 'text-slate-400 hover:bg-white/8'}`}
                key={value}
                onClick={() => setConnectionFilter(value)}
                type="button"
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>

        <div className="scrollbar-hidden min-h-0 flex-1 overflow-auto p-3">
          {filteredMatches.length === 0 && (
            <div className="raddo-empty-state">
              <div className="grid justify-items-center gap-3">
                <span className="raddo-empty-icon">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {connectionFilter === 'friendship' ? t('noFriendshipsYet') : connectionFilter === 'romantic' ? t('noRomanticMatchesYet') : t('noMatchesYet')}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{t('conversationStartHint')}</p>
                </div>
              </div>
            </div>
          )}
          {filteredMatches.map((match) => {
            const otherUid = match.users.find((uid) => uid !== currentUid) ?? match.users[0];
            const profile = profilesByUid[otherUid];
            const cached = cachedConversations[match.id];
            const isActive = activeMatchId === match.id;
            const displayName = profile?.displayName ?? cached?.displayName ?? t('savedProfile');
            const photoURL = profile?.photos?.[0] || profile?.photoURL || cached?.photoURL || '';
            const lastMessage = match.lastMessage || cached?.lastMessage || t('conversationStarted');
            const lastMessageAt = match.lastMessageAt ?? cached?.lastMessageAt ?? null;

            return (
              <article
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                  isActive ? 'bg-teal-300 text-slate-950' : 'text-slate-100 hover:bg-white/8'
                }`}
                key={match.id}
                onClick={() => selectMatch(match.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectMatch(match.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <button
                  className="relative shrink-0"
                  disabled={!profile}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (profile) {
                      setPreviewProfile(profile);
                    } else {
                      selectMatch(match.id);
                    }
                  }}
                  type="button"
                >
                  {photoURL ? (
                    <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-12 w-12 shrink-0 rounded-full" src={photoURL} thumbnailOnly />
                  ) : (
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-900 text-sm text-teal-200">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className={`absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full text-white ring-2 ring-[#0f1f2d] ${match.connectionType === 'friendship' ? 'bg-sky-400' : 'bg-[#ff3f68]'}`}>
                    {match.connectionType === 'friendship' ? <Handshake className="h-3 w-3" /> : <Heart className="h-3 w-3 fill-current" />}
                  </span>
                </button>
                <button
                  className="min-w-0 text-left"
                  disabled={false}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectMatch(match.id);
                  }}
                  type="button"
                >
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className={`truncate text-xs ${isActive ? 'text-slate-800' : 'text-slate-300'}`}>
                    {lastMessage}
                  </p>
                </button>
                {lastMessageAt && (
                  <span className={`ml-auto shrink-0 text-[11px] ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                    {new Date(lastMessageAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      </aside>
      )}

      {chatView === 'conversation' && (
      <div className="flex min-h-0 flex-1 flex-col bg-[#07111f]">
        {activeMatch && (
          <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#0f1f2d] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                aria-label={t('backToConversations')}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-100 transition hover:bg-white/8"
                onClick={() => {
                  setChatView('list');
                  setMatchMenuOpen(false);
                  setActiveMatchId('');
                  onShowList?.();
                }}
                type="button"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 items-center gap-2 text-left">
                <button
                  aria-label={t('openProfile')}
                  className="shrink-0"
                  disabled={!activeProfile}
                  onClick={() => {
                    if (activeProfile) setPreviewProfile(activeProfile);
                  }}
                  type="button"
                >
                  {activePhotoURL ? (
                    <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-10 w-10 shrink-0 rounded-full" src={activePhotoURL} thumbnailOnly />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-xs text-teal-200">
                      {activeDisplayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </button>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{activeDisplayName}</span>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] ${activeMatch.connectionType === 'friendship' ? 'bg-sky-400/15 text-sky-300' : 'bg-[#ff3f68]/15 text-rose-200'}`}>
                      {activeMatch.connectionType === 'friendship' ? <Handshake className="h-2.5 w-2.5" /> : <Heart className="h-2.5 w-2.5 fill-current" />}
                      {activeMatch.connectionType === 'friendship' ? t('friendshipBadge') : t('romanticMatches')}
                    </span>
                  </p>
                  {actionMessage && <p className="truncate text-xs text-slate-300">{actionMessage}</p>}
                </div>
              </div>
            </div>
            <div className="relative shrink-0" ref={matchMenuRef}>
              <button
                aria-label={t('conversationOptions')}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-100 transition hover:bg-white/12"
                onClick={() => setMatchMenuOpen((current) => !current)}
                type="button"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {matchMenuOpen && (
                <div className="match-options-menu absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-lg border border-white/10 bg-[#07111f] py-1 text-sm shadow-2xl">
                  {activeMatch.connectionType === 'friendship' && (
                    <button
                      className="match-upgrade-menu-action flex w-full items-center gap-2 px-3 py-2 text-left text-rose-200 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={matchUpgradeBusy || matchUpgradeRequest?.status === 'pending'}
                      onClick={() => void handleRequestMatchUpgrade()}
                      type="button"
                    >
                      <Heart className="h-4 w-4" />
                      {matchUpgradeRequest?.status === 'pending' ? 'Pedido de match pendente' : 'Evoluir para match'}
                    </button>
                  )}
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-100 transition hover:bg-white/8"
                    onClick={handleReport}
                    type="button"
                  >
                    <Flag className="h-4 w-4" />
                    {t('report')}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-100 transition hover:bg-white/8"
                    onClick={handleUnmatch}
                    type="button"
                  >
                    <UserX className="h-4 w-4" />
                    {t('undoMatch')}
                  </button>
                  <button
                    className="match-options-danger flex w-full items-center gap-2 px-3 py-2 text-left text-rose-100 transition hover:bg-rose-400/15"
                    onClick={handleBlock}
                    type="button"
                  >
                    <ShieldOff className="h-4 w-4" />
                    {t('blockPerson')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className="chat-message-area scrollbar-hidden flex-1 space-y-2 overflow-auto p-4"
          onScroll={handleMessageAreaScroll}
          ref={messageAreaRef}
        >
          {!activeMatch && <p className="text-sm text-slate-300">{t('chooseConversation')}</p>}
          {visibleMessages.map((message) => {
            const mine = message.senderUid === currentUid;
            const canEditMessage = mine && message.messageType === 'text';
            const canDeleteMessage = mine;
            const isImageMessage = message.messageType === 'image' && Boolean(message.imageURL || message.imagePath);
            const imageDisplayURL = message.imageURL || message.imagePath;
            const mediaType = isVideoMedia(message.imageURL, message.text) ? 'video' : 'image';
            const canDownloadMessage = isImageMessage && !message.viewOnce;
            const copyValue = isImageMessage ? message.imageURL : message.text;
            const downloadFilename = message.imagePath.split('/').pop() || `raddo-imagem-${message.id}.jpg`;
            const senderProfile = message.senderUid === currentUid ? currentProfile : profilesByUid[message.senderUid];

            return (
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`} key={message.id}>
                <div
                  className={`relative max-w-[82%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                    mine
                      ? 'chat-bubble-mine rounded-br-sm bg-[#d9fdd3] text-slate-950'
                      : 'chat-bubble-other rounded-bl-sm bg-[#162536] text-slate-100'
                  }`}
                >
                  <MessageActionsMenu
                    canCopy={!isImageMessage || !message.viewOnce}
                    canDelete={canDeleteMessage}
                    canDownload={canDownloadMessage}
                    canEdit={canEditMessage}
                    copyLabel={isImageMessage ? t('copyLink') : t('copy')}
                    copyValue={copyValue}
                    downloadFilename={downloadFilename}
                    downloadUrl={message.imageURL}
                    mine={mine}
                    onClose={() => setOpenMessageMenuId('')}
                    onDelete={() => handleDeleteMessage(message)}
                    onEdit={() => handleEditMessage(message)}
                    onFeedback={setActionMessage}
                    onReportProfile={!mine && activeOtherUid ? handleReport : undefined}
                    onToggle={() => setOpenMessageMenuId((current) => (current === message.id ? '' : message.id))}
                    onViewOnceViewers={
                      mine && isImageMessage && message.viewOnce
                        ? () => setViewOnceViewerIds([...new Set(message.viewedBy.filter((uid) => uid !== message.senderUid))])
                        : undefined
                    }
                    onViewProfile={senderProfile ? () => setPreviewProfile(senderProfile) : undefined}
                    open={openMessageMenuId === message.id}
                  />
                  <div className="pr-6">
                    {message.messageType === 'image' && imageDisplayURL ? (
                      <ChatImageMessage
                        cacheKey={message.imagePath || imageDisplayURL}
                        imageURL={imageDisplayURL}
                        mediaType={mediaType}
                        mine={mine}
                        onLoaded={() => {
                          if (shouldStickToBottomRef.current) scrollMessagesToBottom();
                        }}
                        onViewed={() => markMessageImageViewed(message, currentUid)}
                        viewed={message.viewedBy.includes(currentUid)}
                        viewedStorageKey={`raddo:view-once:match:${currentUid}:${message.imageURL || message.id}`}
                        viewOnce={message.viewOnce}
                      />
                    ) : message.messageType === 'image' ? (
                      <p className="text-xs text-slate-300">{t('imageUnavailable')}</p>
                    ) : (
                      message.text
                    )}
                    {message.id.startsWith('local-image-') && <p className="mt-1 text-[10px] font-semibold text-slate-400">{t('sendingNow')}</p>}
                  </div>
                  <span className={`ml-2 align-baseline text-[10px] ${mine ? 'text-slate-600' : 'text-slate-400'}`}>
                    {new Date(message.createdAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
          {showMatchUpgradeCard && matchUpgradeRequest && (
            <div className="flex justify-center py-2">
              <section className="w-full max-w-sm rounded-xl border border-rose-300/25 bg-gradient-to-br from-rose-400/15 to-fuchsia-400/10 p-4 text-center shadow-lg">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#ff3f68] text-white shadow-lg shadow-rose-950/30">
                  <Heart className="h-6 w-6 fill-current" />
                </span>
                {matchUpgradeRequest.status === 'pending' ? (
                  <>
                    <h2 className="mt-3 text-sm font-semibold text-white">Evoluir amizade para match?</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      {matchUpgradeRequest.requesterUid === currentUid
                        ? `Você convidou ${activeDisplayName} para transformar esta amizade em match.`
                        : `${activeDisplayName} quer transformar esta amizade em match.`}
                    </p>
                    {matchUpgradeRequest.requesterUid === currentUid ? (
                      <p className="match-upgrade-waiting mt-3 text-xs font-semibold text-rose-200">Aguardando a resposta...</p>
                    ) : (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          className="h-10 rounded-lg border border-white/10 bg-white/8 text-xs font-semibold text-slate-200 disabled:opacity-50"
                          disabled={matchUpgradeBusy}
                          onClick={() => void handleRespondMatchUpgrade(false)}
                          type="button"
                        >
                          Recusar
                        </button>
                        <button
                          className="h-10 rounded-lg bg-[#ff3f68] text-xs font-semibold text-white disabled:opacity-50"
                          disabled={matchUpgradeBusy}
                          onClick={() => void handleRespondMatchUpgrade(true)}
                          type="button"
                        >
                          {matchUpgradeBusy ? 'Respondendo...' : 'Aceitar'}
                        </button>
                      </div>
                    )}
                  </>
                ) : matchUpgradeRequest.status === 'accepted' ? (
                  <>
                    <h2 className="mt-3 text-sm font-semibold text-white">Agora é match!</h2>
                    <p className="mt-1 text-xs text-slate-300">Vocês dois aceitaram evoluir esta conexão.</p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-3 text-sm font-semibold text-white">Pedido de match recusado</h2>
                    <p className="mt-1 text-xs text-slate-300">A amizade continua normalmente.</p>
                  </>
                )}
                <p className="mt-3 text-[10px] text-slate-500">
                  {new Date(matchUpgradeRequest.createdAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
                </p>
              </section>
            </div>
          )}
          <div ref={messageEndRef} />
        </div>

        {actionMessage && (
          <p className="mx-3 mb-2 rounded-lg bg-amber-300/15 p-3 text-sm font-semibold text-amber-100">
            {actionMessage}
          </p>
        )}

        <form className="flex gap-2 border-t border-white/10 bg-[#0f1f2d] p-3" onSubmit={handleSubmit}>
          <input
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-[#07111f] px-4 text-sm outline-none placeholder:text-slate-500"
            onChange={(event) => setText(event.target.value)}
            placeholder={t('message')}
            value={text}
          />
          <button
            aria-label={t('send')}
            className="grid h-11 w-11 place-items-center rounded-full bg-teal-300 text-slate-950 disabled:cursor-wait disabled:opacity-60"
            disabled={sendingText || !text.trim()}
            type="submit"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
      )}
    </section>
  );
}



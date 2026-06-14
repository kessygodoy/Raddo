import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Flag, ImagePlus, MessageCircle, MoreVertical, Search, Send, ShieldOff, UserX } from 'lucide-react';
import type { Match, Message, UserProfile } from '../types';
import {
  blockProfile,
  deleteMessage,
  editMessage,
  markMessageImageViewed,
  reportProfile,
  sendDislike,
  sendMessage,
  trySendLike,
  unmatchProfile,
  useMatchProfiles,
  useMessages,
  useSortedMatches,
} from '../hooks/useMatches';
import ProfilePreview from './ProfilePreview';
import ChatImageMessage from './ChatImageMessage';
import { prepareChatImageFile, uploadChatMedia } from '../chatImages';
import PendingChatImageModal from './PendingChatImageModal';
import MessageActionsMenu from './MessageActionsMenu';
import CachedMediaImage from './CachedMediaImage';

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
  openMatchId?: string;
};

export default function ChatPanel({ currentProfile, currentUid, matches, openMatchId }: Props) {
  const sortedMatches = useSortedMatches(matches);
  const profilesByUid = useMatchProfiles(sortedMatches, currentUid);
  const [cachedConversations, setCachedConversations] = useState<Record<string, CachedConversation>>(() => readConversationCache(currentUid));
  const [activeMatchId, setActiveMatchId] = useState('');
  const [chatView, setChatView] = useState<'list' | 'conversation'>('list');
  const [text, setText] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [openMessageMenuId, setOpenMessageMenuId] = useState('');
  const [matchMenuOpen, setMatchMenuOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const handledOpenMatchIdRef = useRef('');
  const activeMatch = useMemo(
    () => sortedMatches.find((match) => match.id === activeMatchId) ?? null,
    [activeMatchId, sortedMatches],
  );
  const messages = useMessages(activeMatch?.id);
  const activeOtherUid = activeMatch?.users.find((uid) => uid !== currentUid) ?? activeMatch?.users[0] ?? '';
  const activeCachedConversation = activeMatch ? cachedConversations[activeMatch.id] : undefined;
  const activeProfile = profilesByUid[activeOtherUid];
  const activeDisplayName = activeProfile?.displayName ?? activeCachedConversation?.displayName ?? 'Perfil salvo';
  const activePhotoURL = activeProfile?.photos?.[0] || activeProfile?.photoURL || activeCachedConversation?.photoURL || '';
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
          lastMessage: match.lastMessage || previous?.lastMessage || 'Conversa iniciada',
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
  }, [currentUid, profilesByUid, sortedMatches]);
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
      }
    };

    window.addEventListener('raddo:android-back', handleBack);

    return () => {
      window.removeEventListener('raddo:android-back', handleBack);
    };
  }, [chatView, matchMenuOpen, openMessageMenuId, previewProfile]);

  useEffect(() => {
    if (!messageAreaRef.current || chatView !== 'conversation') return;
    if (!shouldStickToBottomRef.current) return;

    scrollMessagesToBottom('smooth');
  }, [chatView, visibleMessages.length]);

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
      setActionMessage(error instanceof Error ? error.message : 'Não consegui enviar a mensagem.');
    } finally {
      setSendingText(false);
    }
  }

  function selectMatch(matchId: string) {
    setActiveMatchId(matchId);
    setChatView('conversation');
    setMatchMenuOpen(false);
  }

  async function handleUnmatch() {
    if (!activeMatch || !activeOtherUid) return;
    setMatchMenuOpen(false);
    const confirmed = window.confirm('Desfazer este match? A conversa será removida.');
    if (!confirmed) return;

    try {
      await unmatchProfile(currentUid, activeOtherUid, activeMatch.id);
      setActionMessage('Match desfeito.');
      setActiveMatchId('');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui desfazer o match.');
    }
  }

  async function handleBlock() {
    if (!activeMatch || !activeOtherUid) return;
    setMatchMenuOpen(false);
    const confirmed = window.confirm('Bloquear esta pessoa? Ela também vai sumir do mapa para você.');
    if (!confirmed) return;

    try {
      await blockProfile(currentUid, activeOtherUid, activeMatch.id);
      setActionMessage('Pessoa bloqueada.');
      setActiveMatchId('');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui bloquear essa pessoa.');
    }
  }

  async function handleReport() {
    if (!activeOtherUid) return;
    setMatchMenuOpen(false);
    const confirmed = window.confirm('Denunciar esta conversa para análise?');
    if (!confirmed) return;

    try {
      await reportProfile(currentUid, activeOtherUid, 'chat_conversation');
      setActionMessage('Denuncia enviada.');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui enviar a denúncia.');
    }
  }

  async function handlePreviewLike(profile: UserProfile) {
    const result = await trySendLike(currentProfile, profile.uid);
    setActionMessage(result.ok ? (result.matched ? `Deu match com ${profile.displayName}.` : `Você curtiu ${profile.displayName}.`) : result.message);
    if (result.ok) setPreviewProfile(null);
  }

  async function handlePreviewDislike(profile: UserProfile) {
    try {
      await sendDislike(currentUid, profile.uid);
      setActionMessage(`Você recusou ${profile.displayName}.`);
      setPreviewProfile(null);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui registrar o dislike.');
    }
  }

  async function handleEditMessage(message: Message) {
    setOpenMessageMenuId('');
    const nextText = window.prompt('Editar mensagem', message.text);
    if (!nextText || nextText.trim() === message.text.trim()) return;

    try {
      await editMessage(message, currentUid, nextText);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui editar a mensagem.');
    }
  }

  async function handleDeleteMessage(message: Message) {
    setOpenMessageMenuId('');
    const confirmed = window.confirm('Excluir esta mensagem?');
    if (!confirmed) return;

    try {
      await deleteMessage(message, currentUid);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui excluir a mensagem.');
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b1724] shadow-2xl">
      {previewProfile && (
        <ProfilePreview
          me={currentProfile}
          onClose={() => setPreviewProfile(null)}
          onDislike={previewProfile.uid !== currentUid ? handlePreviewDislike : undefined}
          onLike={previewProfile.uid !== currentUid ? handlePreviewLike : undefined}
          profile={previewProfile}
        />
      )}
      {chatView === 'list' && (
      <aside className="flex min-h-0 flex-1 flex-col bg-[#0f1f2d]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h1 className="text-lg font-semibold">Conversas</h1>
          <MessageCircle className="h-5 w-5 text-teal-300" />
        </div>

        <div className="border-b border-white/10 p-3">
          <label className="flex h-10 items-center gap-2 rounded-lg bg-[#07111f] px-3 text-slate-300">
            <Search className="h-4 w-4" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
              placeholder="Pesquisar conversa"
              type="search"
            />
          </label>
        </div>

        <div className="scrollbar-hidden min-h-0 flex-1 overflow-auto">
          {sortedMatches.length === 0 && <p className="p-4 text-sm text-slate-300">Nenhum match ainda.</p>}
          {sortedMatches.map((match) => {
            const otherUid = match.users.find((uid) => uid !== currentUid) ?? match.users[0];
            const profile = profilesByUid[otherUid];
            const cached = cachedConversations[match.id];
            const isActive = activeMatchId === match.id;
            const displayName = profile?.displayName ?? cached?.displayName ?? 'Perfil salvo';
            const photoURL = profile?.photos?.[0] || profile?.photoURL || cached?.photoURL || '';
            const lastMessage = match.lastMessage || cached?.lastMessage || 'Conversa iniciada';
            const lastMessageAt = match.lastMessageAt ?? cached?.lastMessageAt ?? null;

            return (
              <article
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
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
                  className="shrink-0"
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
                    <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-12 w-12 shrink-0 rounded-full" src={photoURL} />
                  ) : (
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-900 text-sm text-teal-200">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
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
                    {new Date(lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                aria-label="Voltar para conversas"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-100 transition hover:bg-white/8"
                onClick={() => {
                  setChatView('list');
                  setMatchMenuOpen(false);
                }}
                type="button"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 items-center gap-2 text-left">
                <button
                  aria-label="Abrir perfil"
                  className="shrink-0"
                  disabled={!activeProfile}
                  onClick={() => {
                    if (activeProfile) setPreviewProfile(activeProfile);
                  }}
                  type="button"
                >
                  {activePhotoURL ? (
                    <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-10 w-10 shrink-0 rounded-full" src={activePhotoURL} />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-xs text-teal-200">
                      {activeDisplayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {activeDisplayName}
                  </p>
                  {actionMessage && <p className="truncate text-xs text-slate-300">{actionMessage}</p>}
                </div>
              </div>
            </div>
            <div className="relative shrink-0">
              <button
                aria-label="Opções da conversa"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-100 transition hover:bg-white/12"
                onClick={() => setMatchMenuOpen((current) => !current)}
                type="button"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {matchMenuOpen && (
                <div className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-lg border border-white/10 bg-[#07111f] py-1 text-sm shadow-2xl">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-100 transition hover:bg-white/8"
                    onClick={handleReport}
                    type="button"
                  >
                    <Flag className="h-4 w-4" />
                    Denunciar
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-100 transition hover:bg-white/8"
                    onClick={handleUnmatch}
                    type="button"
                  >
                    <UserX className="h-4 w-4" />
                    Desfazer match
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-100 transition hover:bg-rose-400/15"
                    onClick={handleBlock}
                    type="button"
                  >
                    <ShieldOff className="h-4 w-4" />
                    Bloquear pessoa
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
          {!activeMatch && <p className="text-sm text-slate-300">Escolha uma conversa para começar.</p>}
          {visibleMessages.map((message) => {
            const mine = message.senderUid === currentUid;
            const canEditMessage = mine && message.messageType === 'text';
            const canDeleteMessage = mine;
            const isImageMessage = message.messageType === 'image' && Boolean(message.imageURL);
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
                    copyLabel={isImageMessage ? 'Copiar link' : 'Copiar'}
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
                    onViewProfile={senderProfile ? () => setPreviewProfile(senderProfile) : undefined}
                    open={openMessageMenuId === message.id}
                  />
                  <div className="pr-6">
                    {message.messageType === 'image' && message.imageURL ? (
                      <ChatImageMessage
                        cacheKey={message.imagePath || message.imageURL}
                        imageURL={message.imageURL}
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
                    ) : (
                      message.text
                    )}
                    {message.id.startsWith('local-image-') && <p className="mt-1 text-[10px] font-semibold text-slate-400">Enviando...</p>}
                  </div>
                  <span className={`ml-2 align-baseline text-[10px] ${mine ? 'text-slate-600' : 'text-slate-400'}`}>
                    {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
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
            placeholder="Mensagem"
            value={text}
          />
          <button
            aria-label="Enviar"
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



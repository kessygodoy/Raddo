import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
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
import { uploadChatImage } from '../chatImages';
import PendingChatImageModal from './PendingChatImageModal';
import MessageActionsMenu from './MessageActionsMenu';

type Props = {
  currentUid: string;
  matches: Match[];
  currentProfile: UserProfile;
  openMatchId?: string;
};

export default function ChatPanel({ currentProfile, currentUid, matches, openMatchId }: Props) {
  const sortedMatches = useSortedMatches(matches);
  const profilesByUid = useMatchProfiles(sortedMatches, currentUid);
  const [activeMatchId, setActiveMatchId] = useState('');
  const [chatView, setChatView] = useState<'list' | 'conversation'>('list');
  const [text, setText] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [pendingImageURL, setPendingImageURL] = useState('');
  const [pendingImageViewOnce, setPendingImageViewOnce] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [openMessageMenuId, setOpenMessageMenuId] = useState('');
  const [matchMenuOpen, setMatchMenuOpen] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const activeMatch = useMemo(
    () => sortedMatches.find((match) => match.id === activeMatchId) ?? sortedMatches[0],
    [activeMatchId, sortedMatches],
  );
  const messages = useMessages(activeMatch?.id);
  const activeOtherUid = activeMatch?.users.find((uid) => uid !== currentUid) ?? activeMatch?.users[0] ?? '';
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
    if (openMatchId && sortedMatches.some((match) => match.id === openMatchId)) {
      setActiveMatchId(openMatchId);
      setChatView('conversation');
      setMatchMenuOpen(false);
    }
  }, [openMatchId, sortedMatches]);

  useEffect(() => {
    if (chatView !== 'conversation') return undefined;

    let removeListener: (() => void) | undefined;
    CapacitorApp.addListener('backButton', () => {
      if (previewProfile) {
        setPreviewProfile(null);
        return;
      }
      setChatView('list');
      setMatchMenuOpen(false);
    }).then((handle) => {
      removeListener = () => handle.remove();
    });

    return () => {
      removeListener?.();
    };
  }, [chatView, previewProfile]);

  useEffect(() => {
    const area = messageAreaRef.current;
    if (!area || chatView !== 'conversation') return;
    if (!shouldStickToBottomRef.current) return;

    area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
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
    if (!activeMatch || !cleanText) return;

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
    await sendMessage(activeMatch.id, currentUid, cleanText, currentProfile.displayName);
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeMatch) return;

    setUploadingImage(true);
    try {
      const imageURL = await uploadChatImage({
        allowRejected: true,
        contextId: activeMatch?.id,
        context: 'match-chat-image',
        file,
        ownerUid: currentUid,
      });
      setPendingImageURL(imageURL);
      setPendingImageViewOnce(false);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui enviar a imagem.');
    } finally {
      setUploadingImage(false);
    }
  }

  function cancelPendingImage() {
    if (uploadingImage || sendingImage) return;
    setPendingImageURL('');
    setPendingImageViewOnce(false);
  }

  async function confirmPendingImage() {
    if (!activeMatch || !pendingImageURL) return;

    setSendingImage(true);
    try {
      const nextMessage: Message = {
        id: `local-image-${Date.now()}`,
        senderUid: currentUid,
        text: 'Imagem',
        matchId: activeMatch.id,
        messageType: 'image',
        imageURL: pendingImageURL,
        imagePath: '',
        viewOnce: pendingImageViewOnce,
        viewedBy: [],
        createdAt: new Date().toISOString(),
      };
      setOptimisticMessages((current) => [...current, nextMessage]);
      shouldStickToBottomRef.current = true;
      await sendMessage(activeMatch.id, currentUid, 'Imagem', currentProfile.displayName, {
        imageURL: pendingImageURL,
        viewOnce: pendingImageViewOnce,
      });
      setPendingImageURL('');
      setPendingImageViewOnce(false);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não consegui enviar a imagem.');
    } finally {
      setSendingImage(false);
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
      {(uploadingImage || pendingImageURL) && (
        <PendingChatImageModal
          imageURL={pendingImageURL}
          onCancel={cancelPendingImage}
          onSend={confirmPendingImage}
          sending={sendingImage}
          setViewOnce={setPendingImageViewOnce}
          uploading={uploadingImage}
          viewOnce={pendingImageViewOnce}
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
            const isActive = activeMatch?.id === match.id;
            const displayName = profile?.displayName ?? `Match ${otherUid.slice(-4)}`;
            const photoURL = profile?.photoURL;

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
                    <img alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" src={photoURL} />
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
                    {match.lastMessage || 'Conversa iniciada'}
                  </p>
                </button>
                {match.lastMessageAt && (
                  <span className={`ml-auto shrink-0 text-[11px] ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                    {new Date(match.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                  disabled={!profilesByUid[activeOtherUid]}
                  onClick={() => {
                    const profile = profilesByUid[activeOtherUid];
                    if (profile) setPreviewProfile(profile);
                  }}
                  type="button"
                >
                  {profilesByUid[activeOtherUid]?.photoURL ? (
                    <img
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                      src={profilesByUid[activeOtherUid]?.photoURL}
                    />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-xs text-teal-200">
                      {(profilesByUid[activeOtherUid]?.displayName ?? `M${activeOtherUid.slice(-1)}`).slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {profilesByUid[activeOtherUid]?.displayName ?? `Match ${activeOtherUid.slice(-4)}`}
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
            const canDownloadMessage = isImageMessage && !message.viewOnce;
            const copyValue = isImageMessage ? message.imageURL : message.text;
            const downloadFilename = message.imagePath.split('/').pop() || `raddo-imagem-${message.id}.jpg`;

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
                    onToggle={() => setOpenMessageMenuId((current) => (current === message.id ? '' : message.id))}
                    open={openMessageMenuId === message.id}
                  />
                  <div className="pr-6">
                    {message.messageType === 'image' && message.imageURL ? (
                      <ChatImageMessage
                        imageURL={message.imageURL}
                        mine={mine}
                        onViewed={() => markMessageImageViewed(message, currentUid)}
                        viewed={message.viewedBy.includes(currentUid)}
                        viewOnce={message.viewOnce}
                      />
                    ) : (
                      message.text
                    )}
                  </div>
                  <span className={`ml-2 align-baseline text-[10px] ${mine ? 'text-slate-600' : 'text-slate-400'}`}>
                    {new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <form className="flex gap-2 border-t border-white/10 bg-[#0f1f2d] p-3" onSubmit={handleSubmit}>
          <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-white/10 bg-white/8 text-slate-100" title="Abrir câmera">
            <Camera className="h-5 w-5" />
            <input accept="image/*" capture="environment" className="hidden" disabled={uploadingImage || !activeMatch} onChange={handleImageUpload} type="file" />
          </label>
          <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-white/10 bg-white/8 text-slate-100" title="Escolher imagem">
            <ImagePlus className="h-5 w-5" />
            <input accept="image/*" className="hidden" disabled={uploadingImage || !activeMatch} onChange={handleImageUpload} type="file" />
          </label>
          <input
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-[#07111f] px-4 text-sm outline-none placeholder:text-slate-500"
            onChange={(event) => setText(event.target.value)}
            placeholder="Mensagem"
            value={text}
          />
          <button
            aria-label="Enviar"
            className="grid h-11 w-11 place-items-center rounded-full bg-teal-300 text-slate-950"
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



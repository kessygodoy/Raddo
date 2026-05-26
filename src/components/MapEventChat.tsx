import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Eye, ImagePlus, LogOut, MapPin, Megaphone, MoreVertical, Send, Shield, Trash2, Users, X } from 'lucide-react';
import {
  approveMapEventRequest,
  banMapEventUser,
  deleteMapEvent,
  deleteMapEventMessage,
  editMapEventMessage,
  leaveMapEvent,
  markMapEventMessageImageViewed,
  reportMapEvent,
  rejectMapEventRequest,
  sendMapEventMessage,
  setMapEventModerator,
  unbanMapEventUser,
  useMapEventBans,
  useMapEventJoinRequests,
  useMapEventMessages,
  useMapEventModerators,
  useMapEventParticipants,
} from '../hooks/useMapEvents';
import { sendDislike, trySendLike } from '../hooks/useMatches';
import type { MapEvent, UserProfile } from '../types';
import ProfilePreview from './ProfilePreview';
import { reportReasons, type ReportReason } from '../reportOptions';
import ExternalGpsModal from './ExternalGpsModal';
import ChatImageMessage from './ChatImageMessage';
import { uploadChatImage } from '../chatImages';
import PendingChatImageModal from './PendingChatImageModal';
import MessageActionsMenu from './MessageActionsMenu';

type Props = {
  event: MapEvent;
  me: UserProfile;
  onClose: () => void;
  onDeleted?: (eventId: string) => void;
};

type ManagementView = 'people' | 'moderators' | 'banned' | 'requests' | null;

function ProfileAvatar({ profile }: { profile: UserProfile }) {
  return profile.photoURL ? (
    <img alt="" className="h-12 w-12 rounded-lg object-cover" src={profile.photoURL} />
  ) : (
    <div className="grid h-12 w-12 place-items-center rounded-lg bg-teal-300 text-sm font-bold text-slate-950">
      {profile.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function MapEventChat({ event, me, onClose, onDeleted }: Props) {
  const messages = useMapEventMessages(event.id, me.uid);
  const participants = useMapEventParticipants(event.id, me);
  const moderators = useMapEventModerators(event.id);
  const isOwner = event.creatorUid === me.uid;
  const isModerator = moderators.includes(me.uid);
  const canManage = isOwner || isModerator;
  const joinRequests = useMapEventJoinRequests(event.id, me, canManage);
  const bannedUsers = useMapEventBans(event.id, me, canManage);
  const [optimisticMessages, setOptimisticMessages] = useState<typeof messages>([]);
  const [text, setText] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [pendingImageURL, setPendingImageURL] = useState('');
  const [pendingImageViewOnce, setPendingImageViewOnce] = useState(false);
  const [error, setError] = useState('');
  const [openMessageMenuId, setOpenMessageMenuId] = useState('');
  const [managementView, setManagementView] = useState<ManagementView>(null);
  const [actionProfile, setActionProfile] = useState<UserProfile | null>(null);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('harassment');
  const [gpsOpen, setGpsOpen] = useState(false);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const allMessages = useMemo(() => {
    const persistedKeys = new Set(
      messages.map((message) => `${message.eventId}:${message.senderUid}:${message.text.trim().toLowerCase()}`),
    );
    const pendingMessages = optimisticMessages.filter((message) => {
      const key = `${message.eventId}:${message.senderUid}:${message.text.trim().toLowerCase()}`;
      return !persistedKeys.has(key);
    });

    return [...messages, ...pendingMessages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }, [messages, optimisticMessages]);
  const moderatorProfiles = participants.filter((profile) => moderators.includes(profile.uid));
  const creatorName = participants.find((profile) => profile.uid === event.creatorUid)?.displayName ?? 'criador do chat';
  const expiresAt = new Date(Date.parse(event.createdAt) + 24 * 60 * 60 * 1000);

  useEffect(() => {
    const area = messageAreaRef.current;
    if (!area || !shouldStickToBottomRef.current) return;

    area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
  }, [allMessages.length]);

  function handleMessageAreaScroll() {
    const area = messageAreaRef.current;
    if (!area) return;
    const distanceFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  }

  async function handleSubmit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setError('');

    try {
      await sendMapEventMessage({
        eventId: event.id,
        senderUid: me.uid,
        senderName: me.displayName,
        text,
      });
      shouldStickToBottomRef.current = true;
      setOptimisticMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          eventId: event.id,
          senderUid: me.uid,
          senderName: me.displayName,
          text: text.trim(),
          messageType: 'text',
          imageURL: '',
          imagePath: '',
          viewOnce: false,
          viewedBy: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui enviar a mensagem.');
    }
  }

  async function handleImageUpload(eventInput: ChangeEvent<HTMLInputElement>) {
    const file = eventInput.target.files?.[0];
    eventInput.target.value = '';
    if (!file) return;

    setUploadingImage(true);
    setError('');
    try {
      const imageURL = await uploadChatImage({
        allowRejected: event.accessMode !== 'open',
        contextId: event.id,
        context: 'map-chat-image',
        file,
        ownerUid: me.uid,
      });
      setPendingImageURL(imageURL);
      setPendingImageViewOnce(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui enviar a imagem.');
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
    if (!pendingImageURL) return;

    setSendingImage(true);
    try {
      await sendMapEventMessage({
        eventId: event.id,
        image: { imageURL: pendingImageURL, viewOnce: pendingImageViewOnce },
        senderUid: me.uid,
        senderName: me.displayName,
        text: 'Imagem',
      });
      shouldStickToBottomRef.current = true;
      setOptimisticMessages((current) => [
        ...current,
        {
          id: `local-image-${Date.now()}`,
          eventId: event.id,
          senderUid: me.uid,
          senderName: me.displayName,
          text: 'Imagem',
          messageType: 'image',
          imageURL: pendingImageURL,
          imagePath: '',
          viewOnce: pendingImageViewOnce,
          viewedBy: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      setPendingImageURL('');
      setPendingImageViewOnce(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui enviar a imagem.');
    } finally {
      setSendingImage(false);
    }
  }

  async function handleLeave() {
    try {
      await leaveMapEvent(event.id, me.uid);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui sair do chat.');
    }
  }

  async function handleReport() {
    const confirmed = window.confirm('Denunciar este chat para revisão?');
    if (!confirmed) return;

    try {
      await reportMapEvent(event, me.uid, reportReason);
      setError('Denúncia enviada para revisão.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui denunciar o chat.');
    }
  }

  async function handleReportProfile(profile: UserProfile) {
    try {
      await reportMapEvent(event, me.uid, 'reported_chat_user', profile.uid);
      setError(`${profile.displayName} foi denunciado para revisão.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui denunciar essa pessoa.');
    }
  }

  async function handlePreviewLike(profile: UserProfile) {
    const result = await trySendLike(me, profile.uid);
    setError(result.ok ? (result.matched ? `Deu match com ${profile.displayName}.` : `Você curtiu ${profile.displayName}.`) : result.message);
    if (result.ok) setPreviewProfile(null);
  }

  async function handlePreviewDislike(profile: UserProfile) {
    try {
      await sendDislike(me.uid, profile.uid);
      setError(`Você recusou ${profile.displayName}.`);
      setPreviewProfile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui registrar o dislike.');
    }
  }


  async function handleDelete() {
    const confirmed = window.confirm('Excluir este chat do mapa? Todas as mensagens dele serão removidas.');
    if (!confirmed) return;

    try {
      await deleteMapEvent(event.id, me.uid);
      onDeleted?.(event.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui excluir o chat.');
    }
  }

  async function handleApprove(profile: UserProfile) {
    try {
      await approveMapEventRequest(event.id, profile.uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui aprovar a entrada.');
    }
  }

  async function handleReject(profile: UserProfile) {
    try {
      await rejectMapEventRequest(event.id, profile.uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui recusar a entrada.');
    }
  }

  async function handleModerator(profile: UserProfile, enabled: boolean) {
    const confirmed = window.confirm(
      enabled
        ? `Tornar ${profile.displayName} moderador deste chat?`
        : `Remover ${profile.displayName} da moderação deste chat?`,
    );
    if (!confirmed) return;

    try {
      await setMapEventModerator(event.id, profile.uid, enabled);
      setError(enabled ? `${profile.displayName} agora é moderador.` : `${profile.displayName} não é mais moderador.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui atualizar moderador.');
    }
  }

  async function handleBan(profile: UserProfile) {
    const confirmed = window.confirm(`Banir ${profile.displayName} deste chat?`);
    if (!confirmed) return;

    try {
      await banMapEventUser(event.id, profile.uid, me.uid);
      setError(`${profile.displayName} foi banido.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui banir a pessoa.');
    }
  }

  async function handleUnban(profile: UserProfile) {
    const confirmed = window.confirm(`Desbanir ${profile.displayName} deste chat?`);
    if (!confirmed) return;

    try {
      await unbanMapEventUser(event.id, profile.uid);
      setError(`${profile.displayName} foi desbanido.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui desbanir a pessoa.');
    }
  }

  function profileRole(profile: UserProfile) {
    if (event.creatorUid === profile.uid) return 'Dono do chat';
    if (moderators.includes(profile.uid)) return 'Moderador';
    return profile.bio || 'No chat local';
  }

  async function handleEditMessage(message: (typeof allMessages)[number]) {
    setOpenMessageMenuId('');
    const nextText = window.prompt('Editar mensagem', message.text);
    if (!nextText || nextText.trim() === message.text.trim()) return;

    try {
      await editMapEventMessage(message, me.uid, nextText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui editar a mensagem.');
    }
  }

  async function handleDeleteMessage(message: (typeof allMessages)[number]) {
    setOpenMessageMenuId('');
    const confirmed = window.confirm('Excluir esta mensagem?');
    if (!confirmed) return;

    try {
      await deleteMapEventMessage(message, me.uid, canManage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui excluir a mensagem.');
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] grid place-items-end bg-black/60 px-0 pb-[calc(var(--raddo-bottom-safe)+24px)] pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-sm sm:place-items-center sm:p-6">
      {gpsOpen && <ExternalGpsModal location={event.location} onClose={() => setGpsOpen(false)} title={event.title} />}
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
      <section className="flex h-[calc(100dvh-env(safe-area-inset-top)-var(--raddo-bottom-safe)-38px)] max-h-[calc(100dvh-env(safe-area-inset-top)-var(--raddo-bottom-safe)-38px)] w-full max-w-lg flex-col overflow-hidden border border-white/10 bg-[#07111f] text-white shadow-2xl sm:h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-lg">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{event.title}</h1>
            <p className="mt-1 text-xs font-semibold text-teal-200">Criado por {creatorName}</p>
            <p className="mt-1 text-sm text-slate-300">{event.description || 'Chat local do mapa'}</p>
            {!event.isPermanent && (
              <p className="mt-1 text-xs text-teal-200">
                Expira {expiresAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              aria-label="Abrir localização no GPS"
              className="grid h-10 w-10 place-items-center rounded-lg bg-white/8 text-slate-100"
              onClick={() => setGpsOpen(true)}
              type="button"
            >
              <MapPin className="h-5 w-5" />
            </button>
            {!isOwner && (
              <button
                aria-label="Denunciar chat"
                className="grid h-10 w-10 place-items-center rounded-lg bg-amber-300/15 text-amber-100"
                onClick={() => setReportOpen(true)}
                type="button"
              >
                <Megaphone className="h-5 w-5" />
              </button>
            )}
            {isOwner && (
              <button
                aria-label="Excluir chat"
                className="grid h-10 w-10 place-items-center rounded-lg bg-rose-400/20 text-rose-100"
                onClick={handleDelete}
                type="button"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button
              aria-label="Sair do chat"
              className="grid h-10 w-10 place-items-center rounded-lg bg-rose-400/20 text-rose-100"
              onClick={handleLeave}
              type="button"
            >
              <LogOut className="h-5 w-5" />
            </button>
            <button
              aria-label="Fechar"
              className="grid h-10 w-10 place-items-center rounded-lg bg-white/8"
              onClick={onClose}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {reportOpen && (
          <section className="border-b border-white/10 bg-slate-950/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Motivo da denúncia</p>
              <button className="text-xs text-slate-300" onClick={() => setReportOpen(false)} type="button">
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {reportReasons.map((reason) => (
                <button
                  className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${
                    reportReason === reason.value
                      ? 'border-teal-300 bg-teal-300 text-slate-950'
                      : 'border-white/10 bg-white/8 text-slate-100'
                  }`}
                  key={reason.value}
                  onClick={() => setReportReason(reason.value)}
                  type="button"
                >
                  {reason.label}
                </button>
              ))}
            </div>
            <button className="mt-3 h-10 w-full rounded-lg bg-teal-300 text-sm font-semibold text-slate-950" onClick={handleReport} type="button">
              Enviar denúncia
            </button>
          </section>
        )}

        <section className="border-b border-white/10 p-3">
          <button
            className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg bg-white/8 px-3 py-2 text-left text-sm font-semibold"
            onClick={() => setManagementView('people')}
            type="button"
          >
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-300" />
              Pessoas no chat ({participants.length})
            </span>
            <span className="text-xs text-teal-300">Ver lista</span>
          </button>
          {canManage && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                className="h-9 rounded-lg border border-white/10 bg-white/8 font-semibold text-slate-100"
                onClick={() => setManagementView('moderators')}
                type="button"
              >
                Moderadores ({moderatorProfiles.length})
              </button>
              <button
                className="h-9 rounded-lg border border-white/10 bg-white/8 font-semibold text-slate-100"
                onClick={() => setManagementView('banned')}
                type="button"
              >
                Banidos ({bannedUsers.length})
              </button>
              <button
                className="h-9 rounded-lg border border-white/10 bg-white/8 font-semibold text-slate-100"
                onClick={() => setManagementView('requests')}
                type="button"
              >
                Pedidos ({joinRequests.length})
              </button>
            </div>
          )}
        </section>

        <div
          className="min-h-64 flex-1 space-y-3 overflow-auto p-4"
          onScroll={handleMessageAreaScroll}
          ref={messageAreaRef}
        >
          {allMessages.length === 0 && <p className="text-sm text-slate-300">Seja a primeira pessoa a falar neste evento.</p>}
          {allMessages.map((message) => {
            const mine = message.senderUid === me.uid;
            const canEditMessage = mine && message.messageType === 'text';
            const canDeleteMessage = mine || canManage;
            const isImageMessage = message.messageType === 'image' && Boolean(message.imageURL);
            const canDownloadMessage = isImageMessage && !message.viewOnce;
            const copyValue = isImageMessage ? message.imageURL : message.text;
            const downloadFilename = message.imagePath.split('/').pop() || `raddo-imagem-${message.id}.jpg`;
            return (
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`} key={message.id}>
                <div className={`relative max-w-[82%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-teal-300 text-slate-950' : 'bg-slate-900 text-slate-100'}`}>
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
                    onFeedback={setError}
                    onToggle={() => setOpenMessageMenuId((current) => (current === message.id ? '' : message.id))}
                    open={openMessageMenuId === message.id}
                  />
                  <div className="pr-6">
                    {!mine && <p className="mb-1 text-xs font-semibold text-teal-200">{message.senderName}</p>}
                    {message.messageType === 'image' && message.imageURL ? (
                      <ChatImageMessage
                        imageURL={message.imageURL}
                        mine={mine}
                        onViewed={() => markMapEventMessageImageViewed(message, me.uid)}
                        viewed={message.viewedBy.includes(me.uid)}
                        viewOnce={message.viewOnce}
                      />
                    ) : (
                      <p>{message.text}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="mx-3 rounded-lg bg-rose-400/15 p-3 text-sm text-rose-100">{error}</p>}
        {managementView && (
          <div className="fixed inset-0 z-[1300] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
            <section className="max-h-[82dvh] w-full max-w-md overflow-auto rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {managementView === 'people' && 'Pessoas no chat'}
                    {managementView === 'moderators' && 'Moderadores'}
                    {managementView === 'banned' && 'Pessoas banidas'}
                    {managementView === 'requests' && 'Pedidos para entrar'}
                  </h2>
                  <p className="text-sm text-slate-300">
                    {managementView === 'people' && `${participants.length} pessoas participando`}
                    {managementView === 'moderators' && `${moderatorProfiles.length} moderadores escolhidos`}
                    {managementView === 'banned' && `${bannedUsers.length} pessoas banidas`}
                    {managementView === 'requests' && `${joinRequests.length} pedidos aguardando`}
                  </p>
                </div>
                <button
                  aria-label="Fechar"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
                  onClick={() => setManagementView(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-2">
                {managementView === 'people' &&
                  participants.map((profile) => {
                    const isMe = profile.uid === me.uid;
                    const profileIsModerator = moderators.includes(profile.uid);
                    return (
                      <article className="rounded-lg bg-slate-950/60 p-3" key={profile.uid}>
                        <div className="flex items-center gap-3">
                          <ProfileAvatar profile={profile} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{isMe ? 'Você' : profile.displayName}</p>
                            <p className="truncate text-xs text-slate-300">{profileRole(profile)}</p>
                          </div>
                          {profileIsModerator && <Shield className="h-4 w-4 shrink-0 text-teal-300" />}
                          <button
                            aria-label={`Ver perfil de ${profile.displayName}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8 text-slate-100"
                            onClick={() => setPreviewProfile(profile)}
                            type="button"
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                          {!isMe && (
                            <button
                              aria-label={`Denunciar ${profile.displayName}`}
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-300/15 text-amber-100"
                              onClick={() => handleReportProfile(profile)}
                              type="button"
                            >
                              <Megaphone className="h-5 w-5" />
                            </button>
                          )}
                          {!isMe && canManage && event.creatorUid !== profile.uid && (
                            <button
                              aria-label={`Opções de ${profile.displayName}`}
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8 text-slate-100"
                              onClick={() => setActionProfile(profile)}
                              type="button"
                            >
                              <MoreVertical className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}

                {managementView === 'moderators' && moderatorProfiles.length === 0 && (
                  <p className="rounded-lg bg-slate-950/60 p-3 text-sm text-slate-300">Nenhum moderador escolhido ainda.</p>
                )}
                {managementView === 'moderators' &&
                  moderatorProfiles.map((profile) => (
                    <article className="rounded-lg bg-slate-950/60 p-3" key={profile.uid}>
                      <div className="flex items-center gap-3">
                        <ProfileAvatar profile={profile} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{profile.displayName}</p>
                          <p className="truncate text-xs text-slate-300">Moderador do chat</p>
                        </div>
                      </div>
                      {isOwner && (
                        <button
                          className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-white/8 text-xs font-semibold text-slate-100"
                          onClick={() => handleModerator(profile, false)}
                          type="button"
                        >
                          Remover da moderação
                        </button>
                      )}
                    </article>
                  ))}

                {managementView === 'banned' && bannedUsers.length === 0 && (
                  <p className="rounded-lg bg-slate-950/60 p-3 text-sm text-slate-300">Nenhuma pessoa banida.</p>
                )}
                {managementView === 'banned' &&
                  bannedUsers.map((profile) => (
                    <article className="rounded-lg bg-slate-950/60 p-3" key={profile.uid}>
                      <div className="flex items-center gap-3">
                        <ProfileAvatar profile={profile} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{profile.displayName}</p>
                          <p className="truncate text-xs text-slate-300">Banido deste chat</p>
                        </div>
                      </div>
                      <button
                        className="mt-3 h-10 w-full rounded-lg bg-teal-300 text-xs font-semibold text-slate-950"
                        onClick={() => handleUnban(profile)}
                        type="button"
                      >
                        Desbanir
                      </button>
                    </article>
                  ))}

                {managementView === 'requests' && joinRequests.length === 0 && (
                  <p className="rounded-lg bg-slate-950/60 p-3 text-sm text-slate-300">Nenhum pedido pendente.</p>
                )}
                {managementView === 'requests' &&
                  joinRequests.map((profile) => (
                    <article className="rounded-lg bg-slate-950/60 p-3" key={profile.uid}>
                      <div className="flex items-center gap-3">
                        <ProfileAvatar profile={profile} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{profile.displayName}</p>
                          <p className="truncate text-xs text-slate-300">Quer entrar neste chat</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          className="h-10 rounded-lg bg-teal-300 text-xs font-semibold text-slate-950"
                          onClick={() => handleApprove(profile)}
                          type="button"
                        >
                          Aprovar
                        </button>
                        <button
                          className="h-10 rounded-lg bg-rose-400 text-xs font-semibold text-white"
                          onClick={() => handleReject(profile)}
                          type="button"
                        >
                          Recusar
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          </div>
        )}
        {actionProfile && (
          <div className="fixed inset-0 z-[1400] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
            <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{actionProfile.displayName}</h2>
                  <p className="text-sm text-slate-300">Escolha uma ação para esta pessoa.</p>
                </div>
                <button
                  aria-label="Fechar"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
                  onClick={() => setActionProfile(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid gap-2">
                {isOwner && event.creatorUid !== actionProfile.uid && (
                  <button
                    className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                    onClick={async () => {
                      await handleModerator(actionProfile, !moderators.includes(actionProfile.uid));
                      setActionProfile(null);
                    }}
                    type="button"
                  >
                    {moderators.includes(actionProfile.uid) ? 'Remover da moderação' : 'Tornar moderador'}
                  </button>
                )}
                {canManage && event.creatorUid !== actionProfile.uid && (
                  <button
                    className="h-11 rounded-lg bg-rose-400/20 text-sm font-semibold text-rose-100"
                    onClick={async () => {
                      await handleBan(actionProfile);
                      setActionProfile(null);
                    }}
                    type="button"
                  >
                    Banir pessoa
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
        {previewProfile && (
          <ProfilePreview
            me={me}
            onClose={() => setPreviewProfile(null)}
            onDislike={previewProfile.uid !== me.uid ? handlePreviewDislike : undefined}
            onLike={previewProfile.uid !== me.uid ? handlePreviewLike : undefined}
            overlayClassName="z-[1500]"
            profile={previewProfile}
          />
        )}
        <form className="flex gap-2 border-t border-white/10 p-3" onSubmit={handleSubmit}>
          <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-white/10 bg-white/8 text-slate-100" title="Abrir câmera">
            <Camera className="h-5 w-5" />
            <input accept="image/*" capture="environment" className="hidden" disabled={uploadingImage} onChange={handleImageUpload} type="file" />
          </label>
          <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-white/10 bg-white/8 text-slate-100" title="Escolher imagem">
            <ImagePlus className="h-5 w-5" />
            <input accept="image/*" className="hidden" disabled={uploadingImage} onChange={handleImageUpload} type="file" />
          </label>
          <input
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 outline-none"
            onChange={(inputEvent) => setText(inputEvent.target.value)}
            placeholder="Mensagem no evento"
            value={text}
          />
          <button
            aria-label="Enviar"
            className="grid h-11 w-11 place-items-center rounded-lg bg-teal-300 text-slate-950"
            type="submit"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </section>
    </div>
  );
}



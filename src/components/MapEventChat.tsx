import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Edit3, Eye, Heart, ImagePlus, Info, LogOut, MapPin, Megaphone, MessageCircle, MoreVertical, Plus, Send, Shield, Trash2, UserMinus, Users, Video, X } from 'lucide-react';
import {
  approveMapEventRequest,
  banMapEventUser,
  deleteMapEvent,
  deleteMapEventMessage,
  deleteMapEventStory,
  editMapEventMessage,
  hashMapEventPassword,
  leaveMapEvent,
  markMapEventMessageImageViewed,
  markMapEventStoryViewed,
  reportMapEvent,
  reportMapEventStory,
  toggleMapEventStoryLike,
  rejectMapEventRequest,
  sendMapEventMessage,
  setMapEventModerator,
  unbanMapEventUser,
  updateMapEventPassword,
  useMapEventBans,
  useMapEventJoinRequests,
  useMapEventMessages,
  useMapEventModerators,
  useMapEventParticipants,
} from '../hooks/useMapEvents';
import { useAppModeratorRole } from '../moderation';
import { sendDislike, sendMessage, trySendLike } from '../hooks/useMatches';
import type { MapEvent, MapEventStory, Match, UserProfile } from '../types';
import ProfilePreview from './ProfilePreview';
import { reportReasons, type ReportReason } from '../reportOptions';
import ExternalGpsModal from './ExternalGpsModal';
import ChatImageMessage from './ChatImageMessage';
import { prepareChatImageFile, uploadChatMedia } from '../chatImages';
import PendingChatImageModal from './PendingChatImageModal';
import MessageActionsMenu from './MessageActionsMenu';
import CachedMediaImage from './CachedMediaImage';
import { signedProfilePhotoUrl } from '../storageImages';

function isVideoMedia(url: string, text?: string) {
  return text === 'Vídeo' || /\.(mp4|mov|m4v|webm|ogg)(\?|#|$)/i.test(url);
}

type Props = {
  event: MapEvent;
  matches?: Match[];
  me: UserProfile;
  onClose: () => void;
  onCreateStory?: (event: MapEvent) => void;
  onDeleted?: (eventId: string) => void;
  onEditEvent?: (event: MapEvent) => void;
  stories?: MapEventStory[];
};

type ManagementView = 'people' | 'moderators' | 'banned' | 'requests' | null;
type AppDialog =
  | {
      confirmLabel?: string;
      destructive?: boolean;
      message: string;
      onConfirm: () => void | Promise<void>;
      title: string;
      type: 'confirm';
    }
  | {
      confirmLabel?: string;
      initialValue: string;
      message?: string;
      onConfirm: (value: string) => void | Promise<void>;
      title: string;
      type: 'prompt';
    };

function ProfileAvatar({ profile }: { profile: UserProfile }) {
  return profile.photoURL ? (
    <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-12 w-12 rounded-lg" src={profile.photoURL} />
  ) : (
    <div className="grid h-12 w-12 place-items-center rounded-lg bg-teal-300 text-sm font-bold text-slate-950">
      {profile.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function AppDialogModal({ dialog, onClose }: { dialog: AppDialog; onClose: () => void }) {
  const [value, setValue] = useState(dialog.type === 'prompt' ? dialog.initialValue : '');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    const nextValue = value.trim();
    if (dialog.type === 'prompt' && !nextValue) return;
    setBusy(true);
    try {
      if (dialog.type === 'prompt') await dialog.onConfirm(nextValue);
      else await dialog.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1700] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{dialog.title}</h2>
            {dialog.message && <p className="mt-1 text-sm text-slate-300">{dialog.message}</p>}
          </div>
          <button aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        {dialog.type === 'prompt' && (
          <textarea
            autoFocus
            className="min-h-28 w-full resize-none rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm outline-none"
            onChange={(inputEvent) => setValue(inputEvent.target.value)}
            value={value}
          />
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className={`h-11 rounded-lg text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${
              dialog.type === 'confirm' && dialog.destructive ? 'bg-rose-400 text-white' : 'bg-teal-300 text-slate-950'
            }`}
            disabled={busy}
            onClick={handleConfirm}
            type="button"
          >
            {busy ? 'Processando...' : dialog.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function MapEventChat({ event, matches = [], me, onClose, onCreateStory, onDeleted, onEditEvent, stories = [] }: Props) {
  const messages = useMapEventMessages(event.id, me.uid);
  const participants = useMapEventParticipants(event.id, me);
  const moderators = useMapEventModerators(event.id);
  const appModeratorRole = useAppModeratorRole(me.uid);
  const canManageApp = Boolean(appModeratorRole);
  const isOwner = event.creatorUid === me.uid;
  const isModerator = moderators.includes(me.uid);
  const canManage = isOwner || isModerator || canManageApp;
  const joinRequests = useMapEventJoinRequests(event.id, me, canManage);
  const bannedUsers = useMapEventBans(event.id, me, canManage);
  const [handledJoinRequestIds, setHandledJoinRequestIds] = useState<Set<string>>(new Set());
  const [optimisticMessages, setOptimisticMessages] = useState<typeof messages>([]);
  const [text, setText] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [pendingImageURL, setPendingImageURL] = useState('');
  const [pendingImagePath, setPendingImagePath] = useState('');
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingMediaType, setPendingMediaType] = useState<'image' | 'video'>('image');
  const [pendingImageViewOnce, setPendingImageViewOnce] = useState(false);
  const [error, setError] = useState('');
  const [openMessageMenuId, setOpenMessageMenuId] = useState('');
  const [managementView, setManagementView] = useState<ManagementView>(null);
  const [actionProfile, setActionProfile] = useState<UserProfile | null>(null);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [reportProfile, setReportProfile] = useState<UserProfile | null>(null);
  const [reportingProfile, setReportingProfile] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('harassment');
  const [gpsOpen, setGpsOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState('');
  const [storyProgressKey, setStoryProgressKey] = useState(0);
  const [storyProgressSeconds, setStoryProgressSeconds] = useState(7);
  const [storyPeopleModal, setStoryPeopleModal] = useState<{ title: string; userIds: string[] } | null>(null);
  const [optimisticStoryLikes, setOptimisticStoryLikes] = useState<Record<string, boolean>>({});
  const [storyLikeBursts, setStoryLikeBursts] = useState<Set<string>>(new Set());
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(() => {
    const saved = window.localStorage.getItem(`raddo:viewed-map-stories:${me.uid}`);
    if (!saved) return new Set();
    try {
      return new Set(JSON.parse(saved) as string[]);
    } catch {
      return new Set();
    }
  });
  const [dialog, setDialog] = useState<AppDialog | null>(null);
  const [requestActionUid, setRequestActionUid] = useState('');
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const allMessages = useMemo(() => {
    const persistedKeys = new Set(
      messages.map((message) => `${message.eventId}:${message.senderUid}:${message.text.trim().toLowerCase()}:${message.imageURL}`),
    );
    const pendingMessages = optimisticMessages.filter((message) => {
      const key = `${message.eventId}:${message.senderUid}:${message.text.trim().toLowerCase()}:${message.imageURL}`;
      return !persistedKeys.has(key);
    });

    return [...messages, ...pendingMessages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }, [messages, optimisticMessages]);
  const moderatorProfiles = participants.filter((profile) => moderators.includes(profile.uid));
  const visibleJoinRequests = useMemo(
    () => joinRequests.filter((profile) => !handledJoinRequestIds.has(profile.uid)),
    [handledJoinRequestIds, joinRequests],
  );
  const creatorName = participants.find((profile) => profile.uid === event.creatorUid)?.displayName ?? 'criador do chat';
  const expiresAt = new Date(Date.parse(event.createdAt) + 24 * 60 * 60 * 1000);
  const orderedStories = useMemo(
    () =>
      stories
        .map((story) => {
          const optimisticLiked = optimisticStoryLikes[story.id];
          if (typeof optimisticLiked !== 'boolean') return story;
          const likedBy = new Set(story.likedBy);
          if (optimisticLiked) likedBy.add(me.uid);
          else likedBy.delete(me.uid);
          return { ...story, likedBy: [...likedBy] };
        })
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [me.uid, optimisticStoryLikes, stories],
  );
  const storyGroups = useMemo(() => {
    const grouped = new Map<string, MapEventStory[]>();
    orderedStories.forEach((story) => {
      grouped.set(story.creatorUid, [...(grouped.get(story.creatorUid) ?? []), story]);
    });
    return [...grouped.entries()]
      .map(([creatorUid, groupStories]) => ({
        creatorUid,
        latestStory: groupStories[groupStories.length - 1],
        stories: groupStories,
      }))
      .sort((a, b) => Date.parse(b.latestStory.createdAt) - Date.parse(a.latestStory.createdAt));
  }, [orderedStories]);
  const latestStory = orderedStories[orderedStories.length - 1];
  const selectedStory = orderedStories.find((story) => story.id === selectedStoryId) ?? latestStory ?? null;
  const storyPeopleProfiles = useMemo(() => {
    const byUid = new Map<string, UserProfile>();
    [me, ...participants].forEach((profile) => byUid.set(profile.uid, profile));
    return byUid;
  }, [me, participants]);
  const storyViewerStories = useMemo(
    () => (selectedStory ? storyGroups.find((group) => group.creatorUid === selectedStory.creatorUid)?.stories ?? [] : orderedStories),
    [orderedStories, selectedStory, storyGroups],
  );

  useEffect(() => {
    orderedStories.slice(0, 24).forEach((story) => {
      if (!story.imageURL || story.mediaType === 'video') return;
      void signedProfilePhotoUrl(story.imageURL).catch(() => undefined);
      const image = new Image();
      image.src = story.imageURL;
    });
  }, [orderedStories]);

  function scrollMessagesToBottom(behavior: ScrollBehavior = 'auto') {
    const area = messageAreaRef.current;
    if (!area) return;
    area.scrollTo({ top: area.scrollHeight, behavior });
    messageEndRef.current?.scrollIntoView({ block: 'end', behavior });
  }

  useEffect(() => {
    setHandledJoinRequestIds(new Set());
  }, [event.id]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(''), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const handleBack = (backEvent: Event) => {
      if (uploadingImage || pendingImageURL) {
        backEvent.preventDefault();
        cancelPendingImage();
        return;
      }

      if (gpsOpen) {
        backEvent.preventDefault();
        setGpsOpen(false);
        return;
      }

      if (storyViewerOpen) {
        if (storyPeopleModal) {
          backEvent.preventDefault();
          setStoryPeopleModal(null);
          return;
        }

        backEvent.preventDefault();
        setStoryViewerOpen(false);
        return;
      }

      if (reportOpen) {
        backEvent.preventDefault();
        setReportOpen(false);
        return;
      }

      if (reportProfile) {
        backEvent.preventDefault();
        setReportProfile(null);
        return;
      }

      if (dialog) {
        backEvent.preventDefault();
        setDialog(null);
        return;
      }

      if (headerMenuOpen) {
        backEvent.preventDefault();
        setHeaderMenuOpen(false);
        return;
      }

      if (coverOpen) {
        backEvent.preventDefault();
        setCoverOpen(false);
        return;
      }

      if (infoOpen) {
        backEvent.preventDefault();
        setInfoOpen(false);
        return;
      }

      if (coverPreviewOpen) {
        backEvent.preventDefault();
        setCoverPreviewOpen(false);
        return;
      }

      if (previewProfile) {
        backEvent.preventDefault();
        setPreviewProfile(null);
        return;
      }

      if (actionProfile) {
        backEvent.preventDefault();
        setActionProfile(null);
        return;
      }

      if (openMessageMenuId) {
        backEvent.preventDefault();
        setOpenMessageMenuId('');
        return;
      }

      if (managementView) {
        backEvent.preventDefault();
        setManagementView(null);
      }
    };

    window.addEventListener('raddo:android-back', handleBack, { capture: true });

    return () => {
      window.removeEventListener('raddo:android-back', handleBack, { capture: true });
    };
  }, [actionProfile, coverOpen, coverPreviewOpen, dialog, gpsOpen, headerMenuOpen, infoOpen, managementView, openMessageMenuId, pendingImageURL, previewProfile, reportOpen, reportProfile, storyPeopleModal, storyViewerOpen, uploadingImage]);

  useEffect(() => {
    if (!headerMenuOpen) return undefined;

    const closeMenuOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && headerMenuRef.current?.contains(target)) return;
      setHeaderMenuOpen(false);
    };

    window.addEventListener('pointerdown', closeMenuOnOutsideClick, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', closeMenuOnOutsideClick, { capture: true });
    };
  }, [headerMenuOpen]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    scrollMessagesToBottom();
    const frame = window.requestAnimationFrame(() => scrollMessagesToBottom());
    const timers = [120, 400, 900].map((delay) => window.setTimeout(() => scrollMessagesToBottom(), delay));
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [event.id]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;

    scrollMessagesToBottom('smooth');
  }, [allMessages.length]);

  function handleMessageAreaScroll() {
    const area = messageAreaRef.current;
    if (!area) return;
    const distanceFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  }

  function markStoryViewed(storyId: string) {
    setViewedStoryIds((current) => {
      const next = new Set(current);
      next.add(storyId);
      window.localStorage.setItem(`raddo:viewed-map-stories:${me.uid}`, JSON.stringify([...next].slice(-200)));
      return next;
    });
  }

  function openStory(storyId: string) {
    setSelectedStoryId(storyId);
    markStoryViewed(storyId);
    const story = orderedStories.find((item) => item.id === storyId);
    if (story) void markMapEventStoryViewed(story, me.uid);
    setStoryProgressSeconds(7);
    setStoryProgressKey((current) => current + 1);
    setStoryViewerOpen(true);
  }

  function handleStoryStripPointerDown(event: { button: number; clientX: number; currentTarget: HTMLDivElement }) {
    if (event.button !== 0) return;
    const strip = event.currentTarget;
    const startX = event.clientX;
    const startScrollLeft = strip.scrollLeft;
    let moved = false;

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      const distance = moveEvent.clientX - startX;
      if (Math.abs(distance) > 4) moved = true;
      strip.scrollLeft = startScrollLeft - distance;
    }

    function finishDrag() {
      strip.dataset.dragging = moved ? 'true' : 'false';
      window.setTimeout(() => {
        delete strip.dataset.dragging;
      }, 0);
      window.removeEventListener('pointermove', handlePointerMove);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag, { once: true });
  }

  function showNextStory() {
    if (!selectedStory) return;
    const currentIndex = storyViewerStories.findIndex((story) => story.id === selectedStory.id);
    const nextStory = storyViewerStories[currentIndex + 1];
    if (!nextStory) {
      setStoryViewerOpen(false);
      return;
    }
    openStory(nextStory.id);
  }

  function showPreviousStory() {
    if (!selectedStory) return;
    const currentIndex = storyViewerStories.findIndex((story) => story.id === selectedStory.id);
    const previousStory = storyViewerStories[currentIndex - 1];
    if (!previousStory) {
      setStoryProgressKey((current) => current + 1);
      return;
    }
    openStory(previousStory.id);
  }

  function openStoryPerson(uid: string) {
    const profile = storyPeopleProfiles.get(uid);
    if (!profile) return;
    setStoryPeopleModal(null);
    setStoryViewerOpen(false);
    setPreviewProfile(profile);
  }

  async function handleReportStory(story: MapEventStory) {
    try {
      await reportMapEventStory(story, event, me.uid);
      setError('Story denunciado para revisão.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui denunciar o story.');
    }
  }

  async function handleDeleteStory(story: MapEventStory) {
    setDialog({
      confirmLabel: 'Apagar',
      destructive: true,
      message: 'Este story será removido do chat.',
      onConfirm: async () => {
        try {
          await deleteMapEventStory(story.id);
          if (selectedStoryId === story.id) {
            setStoryViewerOpen(false);
            setSelectedStoryId('');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui apagar o story.');
        }
      },
      title: 'Apagar story?',
      type: 'confirm',
    });
  }

  async function handleLikeStory(story: MapEventStory) {
    const nextLiked = !story.likedBy.includes(me.uid);
    setOptimisticStoryLikes((current) => ({ ...current, [story.id]: nextLiked }));
    setStoryLikeBursts((current) => new Set(current).add(story.id));
    window.setTimeout(() => {
      setStoryLikeBursts((current) => {
        const next = new Set(current);
        next.delete(story.id);
        return next;
      });
    }, 520);
    try {
      await toggleMapEventStoryLike(story, me.uid);
    } catch (err) {
      setOptimisticStoryLikes((current) => {
        const next = { ...current };
        delete next[story.id];
        return next;
      });
      setError(err instanceof Error ? err.message : 'Não consegui curtir o story.');
    }
  }

  function handleReplyStory(story: MapEventStory) {
    const match = matches.find((item) => item.users.includes(me.uid) && item.users.includes(story.creatorUid));
    if (!match) return;
    setDialog({
      confirmLabel: 'Enviar',
      initialValue: '',
      message: 'Envie uma mensagem para responder ao story.',
      onConfirm: async (value) => {
        const message = value.trim();
        if (!message) return;
        try {
          await sendMessage(match.id, me.uid, `Story: ${message}`, me.displayName);
          setError('Mensagem enviada.');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui enviar a mensagem.');
        }
      },
      title: 'Comentar story',
      type: 'prompt',
    });
  }

  useEffect(() => {
    if (!storyViewerOpen || !selectedStory) return undefined;
    if (selectedStory.mediaType === 'video') return undefined;
    const timer = window.setTimeout(showNextStory, 7000);
    return () => window.clearTimeout(timer);
  }, [selectedStory?.id, storyProgressKey, storyViewerOpen, storyViewerStories]);

  async function handleSubmit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    const cleanText = text.trim();
    if (sendingText || !cleanText) return;
    setError('');
    setSendingText(true);
    const nextMessage = {
      id: `local-${Date.now()}`,
      eventId: event.id,
      senderUid: me.uid,
      senderName: me.displayName,
      text: cleanText,
      messageType: 'text' as const,
      imageURL: '',
      imagePath: '',
      viewOnce: false,
      viewedBy: [],
      createdAt: new Date().toISOString(),
    };
    setOptimisticMessages((current) => [...current, nextMessage]);
    shouldStickToBottomRef.current = true;
    setText('');

    try {
      await sendMapEventMessage({
        eventId: event.id,
        senderUid: me.uid,
        senderName: me.displayName,
        text: cleanText,
      });
    } catch (err) {
      setOptimisticMessages((current) => current.filter((message) => message.id !== nextMessage.id));
      setText(cleanText);
      setError(err instanceof Error ? err.message : 'Não consegui enviar a mensagem.');
    } finally {
      setSendingText(false);
    }
  }

  async function handleImageUpload(eventInput: ChangeEvent<HTMLInputElement>) {
    const file = eventInput.target.files?.[0];
    eventInput.target.value = '';
    if (!file) return;
    const mediaType = 'image';

    setError('');
    setUploadingImage(true);
    try {
      const preparedFile = await prepareChatImageFile(file);
      setPendingImageURL(URL.createObjectURL(preparedFile));
      setPendingImageFile(preparedFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui preparar a imagem.');
      return;
    } finally {
      setUploadingImage(false);
    }
    setPendingImagePath('');
    setPendingMediaType(mediaType);
    setPendingImageViewOnce(false);
  }

  function cancelPendingImage() {
    if (uploadingImage || sendingImage) return;
    setPendingImageURL('');
    setPendingImagePath('');
    setPendingImageFile(null);
    setPendingMediaType('image');
    setPendingImageViewOnce(false);
  }

  async function confirmPendingImage() {
    if (!pendingImageURL) return;

    const previewURL = pendingImageURL;
    let imageURL = pendingImageURL;
    let imagePath = pendingImagePath;
    const uploadFile = pendingImageFile;
    const mediaType = pendingMediaType;
    const viewOnce = pendingImageViewOnce;
    setPendingImageURL('');
    setPendingImagePath('');
    setPendingImageFile(null);
    setPendingMediaType('image');
    setPendingImageViewOnce(false);
    setSendingImage(true);
    const mediaText = mediaType === 'video' ? 'Vídeo' : 'Imagem';
    const nextMessage = {
      id: `local-image-${Date.now()}`,
      eventId: event.id,
      senderUid: me.uid,
      senderName: me.displayName,
      text: mediaText,
      messageType: 'image' as const,
      imageURL: previewURL,
      imagePath,
      viewOnce,
      viewedBy: [],
      createdAt: new Date().toISOString(),
    };
    setOptimisticMessages((current) => [...current, nextMessage]);
    shouldStickToBottomRef.current = true;
    let uploadedImageURL = '';
    let uploadedImagePath = '';
    const trySendImage = async (attempt = 0): Promise<void> => {
      try {
        if (uploadFile && !uploadedImageURL) {
          const media = await uploadChatMedia({
            allowRejected: event.accessMode !== 'open',
            contextId: event.id,
            context: 'map-chat-image',
            file: uploadFile,
            ownerUid: me.uid,
          });
          uploadedImageURL = media.url;
          uploadedImagePath = media.path;
          imageURL = media.url;
          imagePath = media.path;
        }
        await sendMapEventMessage({
          eventId: event.id,
          image: { imagePath, imageURL, viewOnce },
          senderUid: me.uid,
          senderName: me.displayName,
          text: mediaText,
        });
        window.setTimeout(() => {
          setOptimisticMessages((current) => current.filter((message) => message.id !== nextMessage.id));
        }, 5000);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Não consegui enviar a imagem.';
        const retryable =
          message.toLowerCase().includes('fetch') ||
          message.toLowerCase().includes('network') ||
          message.toLowerCase().includes('timeout') ||
          !navigator.onLine;
        if (!retryable) {
          setOptimisticMessages((current) => current.filter((message) => message.id !== nextMessage.id));
          setError(message);
          return;
        }
        if (uploadedImageURL) {
          imageURL = uploadedImageURL;
          imagePath = uploadedImagePath;
        }
        const delayMs = Math.min(30000, 4000 * 2 ** Math.min(attempt, 3));
        setError('Internet instável. Vou continuar tentando enviar a imagem automaticamente.');
        window.setTimeout(() => {
          void trySendImage(attempt + 1);
        }, delayMs);
      }
    };

    setSendingImage(false);
    void trySendImage();
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
    setDialog({
      confirmLabel: 'Denunciar',
      message: 'Enviar este chat para análise da moderação?',
      onConfirm: async () => {
        try {
          await reportMapEvent(event, me.uid, reportReason);
          setReportOpen(false);
          setError('Denúncia enviada para revisão.');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui denunciar o chat.');
        }
      },
      title: 'Denunciar chat',
      type: 'confirm',
    });
  }

  function handleReportProfile(profile: UserProfile) {
    setReportReason('harassment');
    setActionProfile(null);
    setReportProfile(profile);
  }

  async function confirmReportProfile() {
    if (!reportProfile || reportingProfile) return;
    setReportingProfile(true);

    try {
      await reportMapEvent(event, me.uid, reportReason, reportProfile.uid);
      setError(`${reportProfile.displayName} foi denunciado para revisão.`);
      setReportProfile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui denunciar essa pessoa.');
    } finally {
      setReportingProfile(false);
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
    setDialog({
      confirmLabel: 'Excluir',
      destructive: true,
      message: 'Todas as mensagens dele serão removidas.',
      onConfirm: async () => {
        try {
          await deleteMapEvent(event.id, me.uid);
          onDeleted?.(event.id);
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui excluir o chat.');
        }
      },
      title: 'Excluir este chat?',
      type: 'confirm',
    });
  }

  async function handleApprove(profile: UserProfile) {
    setRequestActionUid(profile.uid);
    try {
      await approveMapEventRequest(event.id, profile.uid);
      setHandledJoinRequestIds((current) => new Set(current).add(profile.uid));
      setError(`${profile.displayName} foi aprovado para entrar no chat.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui aprovar a entrada.');
    } finally {
      setRequestActionUid('');
    }
  }

  async function handleReject(profile: UserProfile) {
    setRequestActionUid(profile.uid);
    try {
      await rejectMapEventRequest(event.id, profile.uid);
      setHandledJoinRequestIds((current) => new Set(current).add(profile.uid));
      setError(`Pedido de ${profile.displayName} recusado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui recusar a entrada.');
    } finally {
      setRequestActionUid('');
    }
  }

  async function handleModerator(profile: UserProfile, enabled: boolean) {
    setDialog({
      confirmLabel: enabled ? 'Tornar moderador' : 'Remover',
      message: enabled
        ? `${profile.displayName} poderá aprovar pedidos e moderar pessoas neste chat.`
        : `${profile.displayName} deixará de moderar este chat.`,
      onConfirm: async () => {
        try {
          await setMapEventModerator(event.id, profile.uid, enabled);
          setError(enabled ? `${profile.displayName} agora é moderador.` : `${profile.displayName} não é mais moderador.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui atualizar moderador.');
        }
      },
      title: enabled ? 'Tornar moderador?' : 'Remover moderação?',
      type: 'confirm',
    });
  }

  async function handleBan(profile: UserProfile) {
    setDialog({
      confirmLabel: 'Banir',
      destructive: true,
      message: `${profile.displayName} será removido e não poderá entrar novamente neste chat.`,
      onConfirm: async () => {
        try {
          await banMapEventUser(event.id, profile.uid, me.uid);
          setActionProfile(null);
          setError(`${profile.displayName} foi banido.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui banir a pessoa.');
        }
      },
      title: 'Banir pessoa?',
      type: 'confirm',
    });
  }

  async function handleUnban(profile: UserProfile) {
    setDialog({
      confirmLabel: 'Desbanir',
      message: `${profile.displayName} poderá pedir entrada ou entrar novamente, conforme as regras do chat.`,
      onConfirm: async () => {
        try {
          await unbanMapEventUser(event.id, profile.uid);
          setError(`${profile.displayName} foi desbanido.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui desbanir a pessoa.');
        }
      },
      title: 'Desbanir pessoa?',
      type: 'confirm',
    });
  }

  async function handleKick(profile: UserProfile) {
    setDialog({
      confirmLabel: 'Expulsar',
      destructive: true,
      message: `${profile.displayName} será removido do chat, mas poderá entrar novamente depois.`,
      onConfirm: async () => {
        try {
          await leaveMapEvent(event.id, profile.uid);
          setActionProfile(null);
          setError(`${profile.displayName} foi expulso do chat.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui expulsar a pessoa.');
        }
      },
      title: 'Expulsar do chat?',
      type: 'confirm',
    });
  }

  function handleChangePassword() {
    setDialog({
      confirmLabel: 'Salvar senha',
      initialValue: '',
      message: 'Defina a nova senha deste chat.',
      onConfirm: async (nextPassword) => {
        try {
          const passwordHash = await hashMapEventPassword(nextPassword);
          await updateMapEventPassword(event.id, passwordHash);
          setError('Senha do chat atualizada.');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui trocar a senha.');
        }
      },
      title: 'Trocar senha',
      type: 'prompt',
    });
  }

  function profileRole(profile: UserProfile) {
    if (event.creatorUid === profile.uid) return 'Dono do chat';
    if (moderators.includes(profile.uid)) return 'Moderador';
    return profile.bio || 'No chat local';
  }

  async function handleEditMessage(message: (typeof allMessages)[number]) {
    setOpenMessageMenuId('');
    setDialog({
      confirmLabel: 'Salvar',
      initialValue: message.text,
      onConfirm: async (nextText) => {
        if (nextText.trim() === message.text.trim()) return;
        try {
          await editMapEventMessage(message, me.uid, nextText);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui editar a mensagem.');
        }
      },
      title: 'Editar mensagem',
      type: 'prompt',
    });
  }

  async function handleDeleteMessage(message: (typeof allMessages)[number]) {
    setOpenMessageMenuId('');
    setDialog({
      confirmLabel: 'Excluir',
      destructive: true,
      message: 'Esta mensagem será removida do chat.',
      onConfirm: async () => {
        try {
          await deleteMapEventMessage(message, me.uid, canManage);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não consegui excluir a mensagem.');
        }
      },
      title: 'Excluir mensagem?',
      type: 'confirm',
    });
  }

  return (
    <div className="fixed inset-0 z-[1200] grid place-items-end bg-black/60 px-0 pb-[calc(var(--raddo-bottom-safe)+24px)] pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur-sm sm:place-items-center sm:p-6">
      {gpsOpen && <ExternalGpsModal location={event.location} onClose={() => setGpsOpen(false)} title={event.title} />}
      {infoOpen && (
        <div className="fixed inset-0 z-[1600] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{event.title}</h2>
                <p className="mt-1 text-xs text-slate-400">Informações do chat</p>
              </div>
              <button
                aria-label="Fechar informações"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8"
                onClick={() => setInfoOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="rounded-lg bg-white/8 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Criado por</p>
                <p className="mt-1 text-slate-100">{creatorName}</p>
              </div>
              <div className="rounded-lg bg-white/8 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Descrição</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-100">{event.description || 'Chat local do mapa'}</p>
              </div>
              <div className="rounded-lg bg-white/8 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Expiração</p>
                <p className="mt-1 text-slate-100">
                  {event.isPermanent
                    ? 'Chat permanente'
                    : expiresAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
      {storyViewerOpen && selectedStory && (
        <div className="fixed inset-0 z-[1700] bg-black/90 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
          <section className="relative flex h-full w-full flex-col bg-[#07111f] text-white shadow-2xl">
            <div className="grid grid-flow-col gap-1 bg-black/40 p-2">
              {storyViewerStories.map((story) => (
                <div className="h-1 overflow-hidden rounded-full bg-white/15" key={story.id}>
                  {Date.parse(story.createdAt) < Date.parse(selectedStory.createdAt) ? (
                    <div className="h-full w-full bg-white/80" />
                  ) : story.id === selectedStory.id ? (
                    <div
                      className="h-full bg-[#ff3f68]"
                      key={`${selectedStory.id}-${storyProgressKey}`}
                      style={{ animation: `raddoStoryProgress ${storyProgressSeconds}s linear forwards` }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{event.title}</p>
                <p className="truncate text-xs text-slate-400">{selectedStory.creatorName} · expira em 24h</p>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/8" onClick={() => setStoryViewerOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            {selectedStory.imageURL && selectedStory.mediaType === 'video' ? (
              <video
                autoPlay
                className="min-h-0 flex-1 bg-black object-contain"
                muted
                onEnded={showNextStory}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration;
                  if (Number.isFinite(duration) && duration > 0) {
                    setStoryProgressSeconds(Math.max(1, duration));
                    setStoryProgressKey((current) => current + 1);
                  }
                }}
                playsInline
                src={selectedStory.imageURL}
              />
            ) : selectedStory.imageURL ? (
              <CachedMediaImage className="h-full w-full object-contain" fallbackClassName="min-h-0 flex-1 bg-black" src={selectedStory.imageURL} />
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center bg-slate-950 p-6 text-center text-lg font-semibold">{selectedStory.text}</div>
            )}
            {selectedStory.text && selectedStory.imageURL && <p className="p-4 text-sm text-slate-100">{selectedStory.text}</p>}
            {selectedStory.id.startsWith('local-story-') && (
              <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 rounded-full bg-[#ff3f68] px-3 py-1 text-xs font-bold text-white shadow-lg">
                Publicando...
              </div>
            )}
            <button aria-label="Story anterior" className="absolute bottom-24 left-0 top-14 z-10 w-1/2 bg-transparent" onClick={showPreviousStory} type="button" />
            <button aria-label="Próximo story" className="absolute bottom-24 right-0 top-14 z-10 w-1/2 bg-transparent" onClick={showNextStory} type="button" />
            <div className="pointer-events-none absolute bottom-28 right-3 z-20 grid gap-2">
              {(selectedStory.creatorUid === me.uid || canManageApp) && (
                <button
                  aria-label="Apagar story"
                  className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-black/45 px-3 text-white backdrop-blur"
                  onClick={() => handleDeleteStory(selectedStory)}
                  type="button"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              {selectedStory.creatorUid !== me.uid && (
                <button
                  aria-label="Curtir story"
                  className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-black/45 px-3 text-white backdrop-blur"
                  onClick={() => handleLikeStory(selectedStory)}
                  type="button"
                >
                  <Heart
                    className={`h-5 w-5 ${
                      selectedStory.likedBy.includes(me.uid) ? 'fill-[#ff3f68] text-[#ff3f68]' : 'text-white'
                    } ${storyLikeBursts.has(selectedStory.id) ? 'raddo-like-burst' : ''}`}
                  />
                </button>
              )}
              {selectedStory.creatorUid === me.uid && selectedStory.likedBy.length > 0 && (
                <button
                  className="pointer-events-auto inline-flex h-10 items-center justify-center gap-1 rounded-full bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur"
                  onClick={() => setStoryPeopleModal({ title: 'Curtidas', userIds: [...new Set(selectedStory.likedBy)] })}
                  type="button"
                >
                  <Heart className="h-4 w-4 fill-[#ff3f68] text-[#ff3f68]" />
                  {selectedStory.likedBy.length}
                </button>
              )}
              {selectedStory.creatorUid === me.uid && selectedStory.viewedBy.length > 0 && (
                <button
                  className="pointer-events-auto inline-flex h-10 items-center justify-center gap-1 rounded-full bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur"
                  onClick={() => setStoryPeopleModal({ title: 'Visualizaram', userIds: [...new Set(selectedStory.viewedBy)] })}
                  type="button"
                >
                  <Eye className="h-4 w-4 text-white" />
                  {selectedStory.viewedBy.length}
                </button>
              )}
              {selectedStory.creatorUid !== me.uid && matches.some((item) => item.users.includes(me.uid) && item.users.includes(selectedStory.creatorUid)) && (
                <button
                  aria-label="Enviar mensagem"
                  className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-black/45 px-3 text-white backdrop-blur"
                  onClick={() => handleReplyStory(selectedStory)}
                  type="button"
                >
                  <MessageCircle className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3 pb-[calc(var(--raddo-bottom-safe)+12px)]">
              <button className="h-10 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100" onClick={() => setStoryViewerOpen(false)} type="button">
                Fechar
              </button>
              <button
                aria-label="Denunciar story"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-300/20 bg-rose-300/10 text-sm font-semibold text-rose-100"
                onClick={() => handleReportStory(selectedStory)}
                type="button"
              >
                <Megaphone className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      )}
      {storyPeopleModal && (
        <div className="fixed inset-0 z-[1800] grid place-items-end bg-black/65 p-4 pb-[calc(var(--raddo-bottom-safe)+16px)] pt-[calc(env(safe-area-inset-top)+16px)] backdrop-blur-sm sm:place-items-center">
          <section className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-4 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{storyPeopleModal.title}</h2>
              <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/8" onClick={() => setStoryPeopleModal(null)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid max-h-[55dvh] gap-2 overflow-auto scrollbar-hidden">
              {storyPeopleModal.userIds.length === 0 ? (
                <p className="rounded-lg bg-white/8 p-3 text-sm text-slate-300">Ainda não tem ninguém aqui.</p>
              ) : (
                storyPeopleModal.userIds.map((uid) => {
                  const profile = storyPeopleProfiles.get(uid);
                  return (
                    <button
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-left text-sm text-slate-100 disabled:opacity-70"
                      disabled={!profile}
                      key={uid}
                      onClick={() => openStoryPerson(uid)}
                      type="button"
                    >
                      <span className="min-w-0 truncate font-semibold">{profile?.displayName ?? 'Pessoa do Raddo'}</span>
                      {profile && <span className="text-xs text-slate-400">Ver bio</span>}
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
      {(uploadingImage || pendingImageURL) && (
        <PendingChatImageModal
          imageURL={pendingImageURL}
          mediaType={pendingMediaType}
          onCancel={cancelPendingImage}
          onSend={confirmPendingImage}
          sending={sendingImage}
          setViewOnce={setPendingImageViewOnce}
          uploading={uploadingImage}
          viewOnce={pendingImageViewOnce}
        />
      )}
      {coverPreviewOpen && event.coverURL && (
        <div className="fixed inset-0 z-[1700] grid place-items-center bg-black/90 p-4 backdrop-blur-sm">
          <button
            aria-label="Fechar capa"
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+16px)] grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white"
            onClick={() => setCoverPreviewOpen(false)}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
          <CachedMediaImage className="max-h-[86dvh] max-w-full object-contain shadow-2xl" fallbackClassName="max-h-[86dvh] max-w-full rounded-lg" src={event.coverURL} />
        </div>
      )}
      <section className="flex h-[calc(100dvh-env(safe-area-inset-top)-var(--raddo-bottom-safe)-38px)] max-h-[calc(100dvh-env(safe-area-inset-top)-var(--raddo-bottom-safe)-38px)] w-full max-w-lg flex-col overflow-hidden border border-white/10 bg-[#07111f] text-white shadow-2xl sm:h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-lg">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="flex min-w-0 items-center gap-3">
            {event.coverURL && (
              <button
                aria-label="Abrir capa do chat"
                className="grid h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/8"
                onClick={() => setCoverPreviewOpen(true)}
                type="button"
              >
                <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-full w-full" src={event.coverURL} />
              </button>
            )}
            <h1 className="truncate text-xl font-semibold">{event.title}</h1>
          </div>
          <div className="relative flex shrink-0 gap-2" ref={headerMenuRef}>
            <button
              aria-label="Pessoas no chat"
              className="relative grid h-10 w-10 place-items-center rounded-lg bg-white/8 text-slate-100"
              onClick={() => setManagementView('people')}
              type="button"
            >
              <Users className="h-5 w-5 text-[#ff3f68]" />
              <span className="absolute -bottom-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#07111f] px-1 text-[10px] font-semibold text-slate-100 ring-1 ring-white/10">
                {participants.length}
              </span>
            </button>
            <button
              aria-label="Opções do chat"
              className="grid h-10 w-10 place-items-center rounded-lg bg-white/8 text-slate-100"
              onClick={() => setHeaderMenuOpen((current) => !current)}
              type="button"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {headerMenuOpen && (
              <div className="absolute right-12 top-0 z-10 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#07111f] p-1 text-sm text-white shadow-2xl">
                <button
                  className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold hover:bg-white/8"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setInfoOpen(true);
                  }}
                  type="button"
                >
                  <Info className="h-4 w-4 text-teal-300" />
                  Informações
                </button>
                <button
                  className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold hover:bg-white/8"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setGpsOpen(true);
                  }}
                  type="button"
                >
                  <MapPin className="h-4 w-4 text-teal-300" />
                  Abrir localização
                </button>
                {!isOwner && (
                  <button
                    className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold hover:bg-white/8"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setReportOpen(true);
                    }}
                    type="button"
                  >
                    <Megaphone className="h-4 w-4 text-amber-300" />
                    Denunciar chat
                  </button>
                )}
                {canManage && (
                  <button
                    className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold hover:bg-white/8"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onEditEvent?.(event);
                    }}
                    type="button"
                  >
                    <Edit3 className="h-4 w-4 text-teal-300" />
                    Editar chat
                  </button>
                )}
                {canManage && (
                  <button
                    className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold hover:bg-white/8"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handleChangePassword();
                    }}
                    type="button"
                  >
                    <Shield className="h-4 w-4 text-teal-300" />
                    Trocar senha
                  </button>
                )}
                {(isOwner || canManageApp) && (
                  <button
                    className="raddo-delete-chat-button flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-white hover:bg-rose-400/10"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handleDelete();
                    }}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir chat
                  </button>
                )}
                <button
                  className="flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-rose-100 hover:bg-rose-400/10"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    handleLeave();
                  }}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  Sair do chat
                </button>
              </div>
            )}
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
        {reportProfile && (
          <div className="fixed inset-0 z-[1600] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
            <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Denunciar usuário</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Escolha o motivo para denunciar {reportProfile.displayName}. As últimas 10 mensagens dessa pessoa neste chat serão enviadas para análise.
                  </p>
                </div>
                <button
                  aria-label="Fechar"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8"
                  onClick={() => setReportProfile(null)}
                  type="button"
                >
                  <X className="h-5 w-5" />
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
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                  onClick={() => setReportProfile(null)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="h-11 rounded-lg bg-rose-400 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                  disabled={reportingProfile}
                  onClick={confirmReportProfile}
                  type="button"
                >
                  {reportingProfile ? 'Enviando...' : 'Confirmar denúncia'}
                </button>
              </div>
            </section>
          </div>
        )}

        <section className="border-b border-white/10 p-3">
          <div
            className="raddo-story-strip mb-2 flex gap-[3px] overflow-x-auto scrollbar-hidden"
            onClickCapture={(event) => {
              if ((event.currentTarget as HTMLDivElement).dataset.dragging === 'true') {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onPointerDown={handleStoryStripPointerDown}
          >
            {onCreateStory && (
              <button
                className="raddo-story-ring raddo-story-ring-new mx-2 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#ff3f68]/15 text-[10px] font-semibold text-white"
                onClick={() => onCreateStory(event)}
                type="button"
              >
                <Plus className="raddo-story-plus-icon h-4 w-4 text-white" />
                Story
              </button>
            )}
            {storyGroups.length === 0 && (
              <span className="rounded-lg bg-white/8 px-3 py-2 text-xs text-slate-300">Nenhum story neste chat.</span>
            )}
            {storyGroups.map((group) => {
              const allViewed = group.stories.every((story) => viewedStoryIds.has(story.id));
              const story = group.latestStory;
              return (
              <button
                className={`raddo-story-ring ${allViewed ? 'raddo-story-ring-viewed' : 'raddo-story-ring-new'} relative mx-2 grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-950`}
                key={group.creatorUid}
                onClick={() => openStory(story.id)}
                type="button"
              >
                {story.imageURL && story.mediaType === 'video' ? (
                  <Video className="h-5 w-5 text-white" />
                ) : story.imageURL ? (
                  <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-full w-full" src={story.imageURL} />
                ) : (
                  <span className="px-1 text-center text-[10px] text-slate-100">{story.text || 'Story'}</span>
                )}
                {story.id.startsWith('local-story-') && (
                  <span className="absolute inset-x-1 bottom-1 rounded bg-[#ff3f68] px-1 py-0.5 text-[8px] font-bold text-white">
                    Publicando...
                  </span>
                )}
              </button>
              );
            })}
          </div>
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
                Pedidos ({visibleJoinRequests.length})
              </button>
            </div>
          )}
        </section>

        <div
          className="chat-message-area scrollbar-hidden min-h-64 flex-1 space-y-3 overflow-auto p-4"
          onScroll={handleMessageAreaScroll}
          ref={messageAreaRef}
        >
          {allMessages.length === 0 && <p className="text-sm text-slate-300">Seja a primeira pessoa a falar neste evento.</p>}
          {allMessages.map((message) => {
            const mine = message.senderUid === me.uid;
            const canEditMessage = mine && message.messageType === 'text';
            const canDeleteMessage = mine || canManage;
            const isImageMessage = message.messageType === 'image' && Boolean(message.imageURL);
            const mediaType = isVideoMedia(message.imageURL, message.text) ? 'video' : 'image';
            const canDownloadMessage = isImageMessage && !message.viewOnce;
            const copyValue = isImageMessage ? message.imageURL : message.text;
            const downloadFilename = message.imagePath.split('/').pop() || `raddo-imagem-${message.id}.jpg`;
            const senderProfile = message.senderUid === me.uid ? me : participants.find((profile) => profile.uid === message.senderUid);
            return (
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`} key={message.id}>
                <div
                  className={`relative max-w-[82%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                    mine
                      ? 'chat-bubble-mine rounded-br-sm bg-teal-300 text-slate-950'
                      : 'chat-bubble-other rounded-bl-sm bg-slate-900 text-slate-100'
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
                    onFeedback={setError}
                    onReportProfile={!mine && senderProfile ? () => handleReportProfile(senderProfile) : undefined}
                    onToggle={() => setOpenMessageMenuId((current) => (current === message.id ? '' : message.id))}
                    onViewProfile={senderProfile ? () => setPreviewProfile(senderProfile) : undefined}
                    open={openMessageMenuId === message.id}
                  />
                  <div className="pr-6">
                    {!mine && <p className="mb-1 text-xs font-semibold text-teal-200">{message.senderName}</p>}
                    {message.messageType === 'image' && message.imageURL ? (
                      <ChatImageMessage
                        cacheKey={message.imagePath || message.imageURL}
                        imageURL={message.imageURL}
                        mediaType={mediaType}
                        mine={mine}
                        onLoaded={() => {
                          if (shouldStickToBottomRef.current) scrollMessagesToBottom();
                        }}
                        onViewed={() => markMapEventMessageImageViewed(message, me.uid)}
                        viewed={message.viewedBy.includes(me.uid)}
                        viewedStorageKey={`raddo:view-once:map:${me.uid}:${message.imageURL || message.id}`}
                        viewOnce={message.viewOnce}
                      />
                    ) : (
                      <p>{message.text}</p>
                    )}
                    {message.id.startsWith('local-image-') && <p className="mt-1 text-[10px] font-semibold text-slate-400">Enviando...</p>}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messageEndRef} />
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
                    {managementView === 'requests' && `${visibleJoinRequests.length} pedidos aguardando`}
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
                              className="raddo-report-person-button grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-300/15 text-amber-100"
                              onClick={() => handleReportProfile(profile)}
                              type="button"
                            >
                              <Megaphone className="h-5 w-5 text-amber-100" />
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

                {managementView === 'requests' && visibleJoinRequests.length === 0 && (
                  <p className="rounded-lg bg-slate-950/60 p-3 text-sm text-slate-300">Nenhum pedido pendente.</p>
                )}
                {managementView === 'requests' &&
                  visibleJoinRequests.map((profile) => (
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
                          className="h-10 rounded-lg bg-teal-300 text-xs font-semibold text-slate-950 disabled:cursor-wait disabled:opacity-60"
                          disabled={requestActionUid === profile.uid}
                          onClick={() => handleApprove(profile)}
                          type="button"
                        >
                          {requestActionUid === profile.uid ? 'Processando...' : 'Aprovar'}
                        </button>
                        <button
                          className="h-10 rounded-lg bg-rose-400 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                          disabled={requestActionUid === profile.uid}
                          onClick={() => handleReject(profile)}
                          type="button"
                        >
                          {requestActionUid === profile.uid ? 'Processando...' : 'Recusar'}
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
                <button
                  className="h-11 rounded-lg border border-amber-300/20 bg-amber-300/10 text-sm font-semibold text-amber-100"
                  onClick={() => handleReportProfile(actionProfile)}
                  type="button"
                >
                  Denunciar usuário
                </button>
                {canManage && event.creatorUid !== actionProfile.uid && (
                  <button
                    className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                    onClick={() => handleKick(actionProfile)}
                    type="button"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <UserMinus className="h-4 w-4" />
                      Expulsar do chat
                    </span>
                  </button>
                )}
                {canManage && event.creatorUid !== actionProfile.uid && (
                  <button
                    className="h-11 rounded-lg bg-rose-400/20 text-sm font-semibold text-rose-100"
                    onClick={() => handleBan(actionProfile)}
                    type="button"
                  >
                    Banir pessoa
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
        {dialog && <AppDialogModal dialog={dialog} onClose={() => setDialog(null)} />}
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
          <label className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/8 text-slate-100 ${sendingText ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} title="Abrir câmera">
            <Camera className="h-5 w-5" />
            <input accept="image/*" capture="environment" className="hidden" disabled={uploadingImage || sendingText} onChange={handleImageUpload} type="file" />
          </label>
          <label className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/8 text-slate-100 ${sendingText ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} title="Escolher imagem">
            <ImagePlus className="h-5 w-5" />
            <input accept="image/*" className="hidden" disabled={uploadingImage || sendingText} onChange={handleImageUpload} type="file" />
          </label>
          <input
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 outline-none disabled:cursor-wait disabled:opacity-70"
            disabled={sendingText}
            onChange={(inputEvent) => setText(inputEvent.target.value)}
            placeholder={sendingText ? 'Enviando...' : 'Mensagem no evento'}
            value={text}
          />
          <button
            aria-label="Enviar"
            className="grid h-11 w-11 place-items-center rounded-lg bg-teal-300 text-slate-950 disabled:cursor-wait disabled:opacity-60"
            disabled={sendingText || !text.trim()}
            type="submit"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </section>
    </div>
  );
}



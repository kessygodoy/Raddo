import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Eye, Handshake, Heart, MapPin, Play, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { UserProfile } from '../types';
import {
  sendDislike,
  sendFriendRequest,
  trySendLike,
  unlockLikedBy,
  unlockLikeBonus,
  undoProfileInteraction,
  useCrossedProfiles,
  useLikedBy,
  useSeenProfileIds,
} from '../hooks/useMatches';
import { distanceKm, formatPersonDistanceKm } from '../utils/geo';
import { showRewardedVideoAd } from '../adMob';
import ProfilePreview from './ProfilePreview';
import { matchesGenderPreferences, profileQualityScore } from '../hooks/useNearbyProfiles';
import { preloadImages, profileCoverUrl } from '../imagePreload';
import CachedMediaImage from './CachedMediaImage';
import { useI18n } from '../i18n';

type Props = {
  me: UserProfile;
  profiles: UserProfile[];
};

export default function Discovery({ me, profiles }: Props) {
  const { language, t } = useI18n();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [matchProfile, setMatchProfile] = useState<UserProfile | null>(null);
  const [connectionKind, setConnectionKind] = useState<'romantic' | 'friendship'>('romantic');
  const [videoAdContext, setVideoAdContext] = useState<'likes' | 'likedBy' | 'resetCards' | null>(null);
  const [likedByAdUnlocked, setLikedByAdUnlocked] = useState(false);
  const [likedByModalOpen, setLikedByModalOpen] = useState(false);
  const [crossedModalOpen, setCrossedModalOpen] = useState(false);
  const [crossedPage, setCrossedPage] = useState(0);
  const [likedByPage, setLikedByPage] = useState(0);
  const [handledLikedByIds, setHandledLikedByIds] = useState<Set<string>>(new Set());
  const [maxDistanceKm, setMaxDistanceKm] = useState(me.visibilityRadius || 50);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [withPhotoOnly, setWithPhotoOnly] = useState(true);
  const [newOnly, setNewOnly] = useState(false);
  const likedBy = useLikedBy(me);
  const crossedProfiles = useCrossedProfiles(me, profiles);
  const seenIds = useSeenProfileIds(me.uid);
  const likedByUnlocked =
    me.isPremium || likedByAdUnlocked || (me.likedByUnlockUntil ? Date.parse(me.likedByUnlockUntil) > Date.now() : false);
  const queue = useMemo(
    () =>
      profiles
        .filter((profile) => !skipped.has(profile.uid) && !seenIds.has(profile.uid))
        .filter((profile) => matchesGenderPreferences(me, profile))
        .filter((profile) => {
          if (!me.location || !profile.location) return true;
          return distanceKm(me.location, profile.location) <= maxDistanceKm;
        })
        .filter((profile) => !withPhotoOnly || Boolean(profile.photoURL))
        .filter((profile) => {
          if (!onlineOnly) return true;
          return profile.lastSeen ? Date.now() - Date.parse(profile.lastSeen) < 15 * 60 * 1000 : false;
        })
        .filter((profile) => {
          if (!newOnly) return true;
          return profile.lastSeen ? Date.now() - Date.parse(profile.lastSeen) < 7 * 24 * 60 * 60 * 1000 : true;
        })
        .sort((a, b) => {
          const goalDiff = sharedRelationshipGoalCount(me, b) - sharedRelationshipGoalCount(me, a);
          if (goalDiff !== 0) return goalDiff;
          const interestDiff = sharedInterestCount(me, b) - sharedInterestCount(me, a);
          if (interestDiff !== 0) return interestDiff;
          const qualityDiff = profileQualityScore(b) - profileQualityScore(a);
          if (qualityDiff !== 0) return qualityDiff;
          if (!me.location) return 0;
          const aDistance = a.location ? distanceKm(me.location, a.location) : Number.MAX_SAFE_INTEGER;
          const bDistance = b.location ? distanceKm(me.location, b.location) : Number.MAX_SAFE_INTEGER;
          return aDistance - bDistance;
        }),
    [maxDistanceKm, me, me.location, newOnly, onlineOnly, profiles, seenIds, skipped, withPhotoOnly],
  );
  const current = queue[0];
  const visibleLikedBy = likedByUnlocked ? likedBy.filter((profile) => !handledLikedByIds.has(profile.uid)) : [];
  const likedByPageSize = 6;
  const likedByTotalPages = Math.max(1, Math.ceil(visibleLikedBy.length / likedByPageSize));
  const safeLikedByPage = Math.min(likedByPage, likedByTotalPages - 1);
  const pagedLikedBy = visibleLikedBy.slice(safeLikedByPage * likedByPageSize, (safeLikedByPage + 1) * likedByPageSize);
  const crossedPageSize = 10;
  const crossedTotalPages = Math.max(1, Math.ceil(crossedProfiles.length / crossedPageSize));
  const safeCrossedPage = Math.min(crossedPage, crossedTotalPages - 1);
  const pagedCrossedProfiles = crossedProfiles.slice(safeCrossedPage * crossedPageSize, (safeCrossedPage + 1) * crossedPageSize);

  useEffect(() => {
    preloadImages(queue.slice(0, 12).map(profileCoverUrl));
  }, [queue]);

  useEffect(() => {
    const handleBack = (event: Event) => {
      if (previewProfile) {
        event.preventDefault();
        setPreviewProfile(null);
        return;
      }

      if (matchProfile) {
        event.preventDefault();
        setMatchProfile(null);
        return;
      }

      if (videoAdContext) {
        event.preventDefault();
        setVideoAdContext(null);
        return;
      }

      if (likedByModalOpen) {
        event.preventDefault();
        setLikedByModalOpen(false);
        return;
      }

      if (crossedModalOpen) {
        event.preventDefault();
        setCrossedModalOpen(false);
      }
    };

    window.addEventListener('raddo:android-back', handleBack);

    return () => {
      window.removeEventListener('raddo:android-back', handleBack);
    };
  }, [crossedModalOpen, likedByModalOpen, matchProfile, previewProfile, videoAdContext]);

  async function finishVideoAd() {
    if (videoAdContext === 'likedBy') {
      await unlockLikedBy(me.uid);
      setLikedByAdUnlocked(true);
      setLikedByModalOpen(true);
      setLikedByPage(0);
    } else if (videoAdContext === 'resetCards') {
      await resetCardInteractions(true);
    }
    setVideoAdContext(null);
  }

  async function handleUnlockLikedBy(openListAfterUnlock = false) {
    if (me.isPremium) return;

    const shownRealAd = await showRewardedVideoAd();
    if (shownRealAd) {
      await unlockLikedBy(me.uid);
      setLikedByAdUnlocked(true);
      if (openListAfterUnlock) {
        setLikedByModalOpen(true);
        setLikedByPage(0);
      }
      return;
    }

    setVideoAdContext('likedBy');
  }

  async function openLikedByList() {
    if (likedByUnlocked) {
      setLikedByModalOpen(true);
      setLikedByPage(0);
      return;
    }

    await handleUnlockLikedBy(true);
  }

  async function requireAdForResetCards() {
    if (me.isPremium) {
      await resetCardInteractions(true);
      return;
    }

    const shownRealAd = await showRewardedVideoAd();
    if (shownRealAd) {
      await resetCardInteractions(true);
      return;
    }

    setVideoAdContext('resetCards');
  }

  async function registerLikeForAds() {
    if (me.isPremium) return;

    const storageKey = `radar-match-like-ad-count:${me.uid}`;
    const currentCount = Number(window.localStorage.getItem(storageKey) ?? '0');
    const nextCount = currentCount + 1;
    window.localStorage.setItem(storageKey, String(nextCount));

    if (nextCount % 30 === 0) {
      const shownRealAd = await showRewardedVideoAd();
      if (!shownRealAd) setVideoAdContext('likes');
    }
  }

  async function likeProfile(profile: UserProfile) {
    const result = await trySendLike(me, profile.uid);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage('');
    if (result.matched) {
      setConnectionKind('romantic');
      setMatchProfile(profile);
    }
    await registerLikeForAds();
    setPreviewProfile(null);
    setSkipped((prev) => new Set(prev).add(profile.uid));
  }

  async function connectProfile(profile: UserProfile) {
    try {
      const connected = await sendFriendRequest(me.uid, profile.uid);
      setMessage(connected ? t('friendshipCreated', { name: profile.displayName }) : t('friendRequestSent', { name: profile.displayName }));
      setPreviewProfile(null);
      setSkipped((previous) => new Set(previous).add(profile.uid));
      if (connected) {
        setConnectionKind('friendship');
        setMatchProfile(profile);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('friendshipError'));
    }
  }

  async function likeLikedByProfile(profile: UserProfile) {
    await likeProfile(profile);
    setHandledLikedByIds((current) => new Set(current).add(profile.uid));
  }

  async function dislikeProfile(profile: UserProfile) {
    try {
      await sendDislike(me.uid, profile.uid);
      setPreviewProfile(null);
      setSkipped((prev) => new Set(prev).add(profile.uid));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('dislikeError'));
    }
  }

  async function dislikeLikedByProfile(profile: UserProfile) {
    await dislikeProfile(profile);
    setHandledLikedByIds((current) => new Set(current).add(profile.uid));
  }

  async function connectLikedByProfile(profile: UserProfile) {
    await connectProfile(profile);
    setHandledLikedByIds((current) => new Set(current).add(profile.uid));
  }

  async function likeCrossedProfile(profile: UserProfile) {
    await likeProfile(profile);
  }

  async function dislikeCrossedProfile(profile: UserProfile) {
    await dislikeProfile(profile);
  }

  async function connectCrossedProfile(profile: UserProfile) {
    await connectProfile(profile);
  }

  async function handleLike() {
    if (!current) return;
    await likeProfile(current);
  }

  async function handleDislike() {
    if (!current) return;
    await dislikeProfile(current);
  }

  async function handleFriend() {
    if (!current) return;
    await connectProfile(current);
  }

  async function resetCardInteractions(force = false) {
    if (!force) {
      await requireAdForResetCards();
      return;
    }

    setMessage('');
    try {
      await Promise.all([...seenIds].map((uid) => undoProfileInteraction(me.uid, uid)));
      setSkipped(new Set());
      setMessage('Interações desfeitas. Os perfis liberados podem aparecer novamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('unmatchError'));
    }
  }

  function videoAdText() {
    if (videoAdContext === 'likedBy') return 'Assista ao vídeo para liberar todas as pessoas que curtiram você.';
    if (videoAdContext === 'resetCards') return 'Assista ao vídeo para liberar novamente os perfis que você já curtiu ou recusou.';
    return 'Este espaço simula o vídeo que aparecerá a cada 30 curtidas. No app real, aqui entra o AdMob.';
  }

  function videoAdButtonLabel() {
    if (videoAdContext === 'likedBy') return 'Liberar lista';
    if (videoAdContext === 'resetCards') return 'Liberar perfis';
    return t('close');
  }

  return (
    <section className="mx-auto grid max-w-md gap-4">
      {previewProfile && (
        <ProfilePreview
          me={me}
          onClose={() => setPreviewProfile(null)}
          onDislike={dislikeProfile}
          onFriend={connectProfile}
          onLike={likeProfile}
          profile={previewProfile}
        />
      )}
      <AnimatePresence>
        {videoAdContext && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-6 backdrop-blur"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <motion.section
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm overflow-hidden rounded-lg border border-white/10 bg-[#07111f] text-white shadow-2xl"
              initial={{ scale: 0.92, y: 24 }}
            >
              <div className="grid aspect-video place-items-center bg-[linear-gradient(135deg,#0f172a,#1d4ed8_55%,#ec4899)]">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur">
                  <Play className="ml-1 h-8 w-8 fill-white text-white" />
                </div>
              </div>
              <div className="p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('ad')}</p>
                <h2 className="mt-1 text-lg font-semibold">{t('sponsoredVideo')}</h2>
                <p className="mt-2 text-sm text-slate-300">{videoAdText()}</p>
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    animate={{ width: '100%' }}
                    className="h-full rounded-full bg-teal-300"
                    initial={{ width: '0%' }}
                    transition={{ duration: 1.4 }}
                  />
                </div>
                <button
                  className="mt-4 h-11 w-full rounded-lg bg-teal-300 font-semibold text-slate-950"
                  onClick={finishVideoAd}
                  type="button"
                >
                  {videoAdButtonLabel()}
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
        {matchProfile && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <motion.section
              animate={{ scale: 1, y: 0 }}
              className={`w-full max-w-sm rounded-lg border bg-[#07111f] p-6 text-center shadow-2xl ${connectionKind === 'friendship' ? 'border-sky-400/40 shadow-sky-950/50' : 'border-[#ff3f68]/40 shadow-rose-950/50'}`}
              initial={{ scale: 0.86, y: 30 }}
            >
              <div className={`mx-auto grid h-16 w-16 place-items-center rounded-lg text-white ${connectionKind === 'friendship' ? 'bg-sky-400' : 'bg-[#ff3f68]'}`}>
                {connectionKind === 'friendship' ? <Handshake className="h-8 w-8" /> : <Sparkles className="h-8 w-8" />}
              </div>
              <h1 className="mt-4 text-3xl font-semibold">{connectionKind === 'friendship' ? t('newFriendship') : t('notificationNewMatch')}</h1>
              {connectionKind === 'friendship' && <p className="mt-2 text-sm text-slate-300">{t('notificationNewFriendshipText', { name: matchProfile.displayName })}</p>}
              {connectionKind !== 'friendship' && <p className="mt-2 text-sm text-slate-300">{t('notificationNewMatchText', { name: matchProfile.displayName })}</p>}
              <div className="mt-5 flex justify-center -space-x-4">
                <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-20 w-20 rounded-lg border-2 border-[#07111f]" src={me.photoURL} />
                <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-20 w-20 rounded-lg border-2 border-[#07111f]" src={matchProfile.photoURL} />
              </div>
              <button
                className={`mt-6 h-11 w-full rounded-lg font-semibold text-white ${connectionKind === 'friendship' ? 'bg-sky-400' : 'bg-[#ff3f68]'}`}
                onClick={() => setMatchProfile(null)}
                type="button"
              >
                {t('continue')}
              </button>
            </motion.section>
          </motion.div>
        )}
        {likedByModalOpen && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[65] grid place-items-center bg-black/70 p-4 backdrop-blur"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <motion.section
              animate={{ scale: 1, y: 0 }}
              className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-white/10 bg-[#07111f] text-white shadow-2xl"
              initial={{ scale: 0.94, y: 18 }}
            >
              <header className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                <div>
                  <h2 className="text-lg font-semibold">{t('likedByTitle')}</h2>
                  <p className="text-sm text-slate-300">
                    {t(visibleLikedBy.length === 1 ? 'personCount' : 'peopleCount', { count: visibleLikedBy.length })}
                  </p>
                </div>
                <button
                  aria-label={t('closeList')}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white"
                  onClick={() => setLikedByModalOpen(false)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-hidden">
                {visibleLikedBy.length === 0 ? (
                  <p className="rounded-lg border border-white/10 bg-white/8 p-4 text-sm text-slate-300">
                    {t('noLikesYet')}
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {pagedLikedBy.map((profile) => (
                      <article className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2" key={profile.uid}>
                        <button
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => setPreviewProfile(profile)}
                          type="button"
                        >
                          <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-11 w-11 rounded-lg" src={profile.photoURL} thumbnailOnly />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{profile.displayName}</span>
                        </button>
                        <button
                          aria-label={t('rejectPerson', { name: profile.displayName })}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-rose-100"
                          onClick={() => dislikeLikedByProfile(profile)}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`${t('connectFriend')} ${profile.displayName}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-sky-400/60 bg-sky-400/10 text-sky-300"
                          onClick={() => connectLikedByProfile(profile)}
                          type="button"
                        >
                          <Handshake className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Curtir ${profile.displayName}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-300 text-slate-950"
                          onClick={() => likeLikedByProfile(profile)}
                          type="button"
                        >
                          <Heart className="h-4 w-4" />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {visibleLikedBy.length > likedByPageSize && (
                <footer className="flex items-center justify-between gap-3 border-t border-white/10 p-4">
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 text-sm font-semibold disabled:opacity-40"
                    disabled={safeLikedByPage === 0}
                    onClick={() => setLikedByPage((page) => Math.max(0, page - 1))}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('previous')}
                  </button>
                  <span className="text-sm text-slate-300">
                    {safeLikedByPage + 1} / {likedByTotalPages}
                  </span>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 text-sm font-semibold disabled:opacity-40"
                    disabled={safeLikedByPage >= likedByTotalPages - 1}
                    onClick={() => setLikedByPage((page) => Math.min(likedByTotalPages - 1, page + 1))}
                    type="button"
                  >
                    {t('next')}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </footer>
              )}
            </motion.section>
          </motion.div>
        )}
        {crossedModalOpen && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[65] grid place-items-center bg-black/70 p-4 backdrop-blur"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <motion.section
              animate={{ scale: 1, y: 0 }}
              className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-white/10 bg-[#07111f] text-white shadow-2xl"
              initial={{ scale: 0.94, y: 18 }}
            >
              <header className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                <div>
                  <h2 className="text-lg font-semibold">{t('peopleCrossed')}</h2>
                  <p className="text-sm text-slate-300">
                    {t(crossedProfiles.length === 1 ? 'personCount' : 'peopleCount', { count: crossedProfiles.length })}
                  </p>
                </div>
                <button
                  aria-label={t('closeCrossedPeople')}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white"
                  onClick={() => setCrossedModalOpen(false)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-hidden">
                {crossedProfiles.length === 0 ? (
                  <p className="rounded-lg border border-white/10 bg-white/8 p-4 text-sm text-slate-300">
                    {t('crossedHelp')}
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {pagedCrossedProfiles.map(({ distanceMeters, lastCrossedAt, profile }) => (
                      <article className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2" key={profile.uid}>
                        <button
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => setPreviewProfile(profile)}
                          type="button"
                        >
                          {profile.photoURL ? (
                            <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-11 w-11 rounded-lg" src={profile.photoURL} thumbnailOnly />
                          ) : (
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/10 text-sm font-semibold text-white">
                              {profile.displayName.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{profile.displayName}</span>
                            <span className="block truncate text-xs text-slate-300">
                              Cruzou a {formatPersonDistanceKm(distanceMeters / 1000)} - {formatCrossedTime(lastCrossedAt)}
                            </span>
                          </span>
                        </button>
                        <button
                          aria-label={t('rejectPerson', { name: profile.displayName })}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-rose-100"
                          onClick={() => dislikeCrossedProfile(profile)}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`${t('connectFriend')} ${profile.displayName}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-sky-400/60 bg-sky-400/10 text-sky-300"
                          onClick={() => connectCrossedProfile(profile)}
                          type="button"
                        >
                          <Handshake className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Curtir ${profile.displayName}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-300 text-slate-950"
                          onClick={() => likeCrossedProfile(profile)}
                          type="button"
                        >
                          <Heart className="h-4 w-4" />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {crossedProfiles.length > crossedPageSize && (
                <footer className="flex items-center justify-between gap-3 border-t border-white/10 p-4">
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 text-sm font-semibold disabled:opacity-40"
                    disabled={safeCrossedPage === 0}
                    onClick={() => setCrossedPage((page) => Math.max(0, page - 1))}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('previous')}
                  </button>
                  <span className="text-sm text-slate-300">
                    {safeCrossedPage + 1} / {crossedTotalPages}
                  </span>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 text-sm font-semibold disabled:opacity-40"
                    disabled={safeCrossedPage >= crossedTotalPages - 1}
                    onClick={() => setCrossedPage((page) => Math.min(crossedTotalPages - 1, page + 1))}
                    type="button"
                  >
                    {t('next')}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </footer>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="raddo-surface relative h-[68dvh] min-h-[480px] overflow-hidden">
        <AnimatePresence mode="popLayout">
          {current ? (
            <motion.article
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="absolute inset-0"
              exit={{ opacity: 0, scale: 0.96, y: -20 }}
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              key={current.uid}
            >
              <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-full w-full" src={current.photoURL} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/24 to-transparent p-4 pt-28">
                <div className="rounded-lg border border-white/15 bg-slate-950/82 p-4 text-white shadow-2xl backdrop-blur-md">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="truncate text-3xl font-semibold">{current.displayName}</h1>
                      <p className="mt-1 text-sm text-slate-200">
                        {me.location && current.location
                          ? t('distanceAway', { distance: formatPersonDistanceKm(distanceKm(me.location, current.location)) })
                          : t('distanceUnavailable')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-white/15 px-2 py-1 text-xs text-slate-100">
                      {current.privacyMode === 'exact'
                        ? t('visibleOnMap')
                        : current.privacyMode === 'city'
                          ? t('cityOnly')
                          : t('outsideMap')}
                    </span>
                  </div>
                  {current.bio && <p className="mt-3 line-clamp-3 text-sm text-slate-200">{current.bio}</p>}
                  <button
                    className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white"
                    onClick={() => setPreviewProfile(current)}
                    type="button"
                  >
                    <Eye className="h-4 w-4" />
                    {t('viewBioPhotos')}
                  </button>
                </div>
              </div>
            </motion.article>
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-slate-200">
              <div className="raddo-empty-state max-w-xs">
                <div>
                  <p className="text-base font-semibold text-white">{t('noCards')}</p>
                  <p className="mt-2 text-sm text-slate-300">
                  {t('noCardsHelp')}
                  </p>
                  {seenIds.size > 0 && (
                    <button
                      className="raddo-primary-action mt-4 h-10 rounded-lg px-4 text-sm font-semibold"
                      onClick={() => resetCardInteractions()}
                      type="button"
                    >
                      {me.isPremium ? t('unlockProfilesAgain') : t('watchAdUnlockProfiles')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          aria-label="Dislike"
          className="raddo-secondary-action grid h-14 place-items-center rounded-lg text-rose-100"
          onClick={handleDislike}
          type="button"
        >
          <X className="h-6 w-6" />
        </button>
        <button
          aria-label={t('connectFriend')}
          className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-sky-400/60 bg-sky-400/10 text-sky-300"
          onClick={handleFriend}
          type="button"
        >
          <Handshake className="h-6 w-6" />
          <span className="text-[10px] font-semibold">{t('connectFriend')}</span>
        </button>
        <button
          aria-label="Like"
          className="raddo-primary-action grid h-14 place-items-center rounded-lg"
          onClick={handleLike}
          type="button"
        >
          <Heart className="h-6 w-6" />
        </button>
      </div>

      <section className="raddo-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-teal-300" />
          {t('cardFilters')}
        </div>
        <label className="grid gap-2 text-sm text-slate-200">
          {t('maximumDistance', { distance: maxDistanceKm.toLocaleString(language, { maximumFractionDigits: 0 }) })}
          <input
            max={500}
            min={1}
            onChange={(event) => setMaxDistanceKm(Number(event.target.value))}
            type="range"
            value={maxDistanceKm}
          />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <ToggleButton active={onlineOnly} label={t('online')} onClick={() => setOnlineOnly((current) => !current)} />
          <ToggleButton active={withPhotoOnly} label={t('withPhoto')} onClick={() => setWithPhotoOnly((current) => !current)} />
          <ToggleButton active={newOnly} label={t('newProfiles')} onClick={() => setNewOnly((current) => !current)} />
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/8 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t('likedByTitle')}</h2>
            <p className="text-2xl font-semibold">{likedBy.length}</p>
            <p className="text-xs text-slate-300">{likedBy.length === 1 ? 'pessoa curtiu você' : 'pessoas curtiram você'}</p>
          </div>
          {false && (
            <button
              className="h-10 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950"
              onClick={() => handleUnlockLikedBy()}
              type="button"
            >
              Ver anúncio
            </button>
          )}
          <button
            className="h-10 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950"
            onClick={openLikedByList}
            type="button"
          >
            {likedByUnlocked ? t('viewList') : t('watchAd')}
          </button>
        </div>
        {false && (
          <div className="mt-3 grid gap-2">
            {likedBy.length === 0 && <p className="text-sm text-slate-300">{t('noLikesYet')}</p>}
            {visibleLikedBy.map((profile) => (
              <article className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2" key={profile.uid}>
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setPreviewProfile(profile)}
                  type="button"
                >
                  <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-10 w-10 rounded-lg" src={profile.photoURL} thumbnailOnly />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{profile.displayName}</span>
                </button>
                <button
                  aria-label={t('rejectPerson', { name: profile.displayName })}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-rose-100"
                  onClick={() => dislikeLikedByProfile(profile)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  aria-label={`${t('connectFriend')} ${profile.displayName}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-sky-400/60 bg-sky-400/10 text-sky-300"
                  onClick={() => connectLikedByProfile(profile)}
                  type="button"
                >
                  <Handshake className="h-4 w-4" />
                </button>
                <button
                  aria-label={`Curtir ${profile.displayName}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-300 text-slate-950"
                  onClick={() => likeLikedByProfile(profile)}
                  type="button"
                >
                  <Heart className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-white/10 bg-white/8 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-rose-300" />
              <h2 className="text-sm font-semibold">{t('peopleCrossed')}</h2>
            </div>
            <p className="text-2xl font-semibold">{crossedProfiles.length}</p>
            <p className="text-xs text-slate-300">{t('crossedAvailableAll')}</p>
          </div>
          <button
            className="h-10 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950"
            onClick={() => {
              setCrossedPage(0);
              setCrossedModalOpen(true);
            }}
            type="button"
          >
            {t('viewList')}
          </button>
        </div>
        {crossedProfiles.length === 0 && (
          <p className="mt-3 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">
            {t('crossedHelp')}
          </p>
        )}
      </section>

      {message && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-50">
          <p>{message}</p>
          <button
            className="mt-3 h-10 rounded-lg bg-teal-300 px-3 font-semibold text-slate-950"
            onClick={async () => {
              await unlockLikeBonus(me.uid, me.likesBonus);
              setMessage('Mais 30 curtidas liberadas. No app final, este botão abre um anúncio recompensado.');
            }}
            type="button"
          >
            Assistir anúncio
          </button>
        </div>
      )}

    </section>
  );
}

function formatCrossedTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'agora';
  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `há ${diffDays} d`;
}

function sharedInterestCount(me: UserProfile, profile: UserProfile) {
  if (me.interests.length === 0 || profile.interests.length === 0) return 0;
  return profile.interests.filter((interest) => me.interests.includes(interest)).length;
}

function sharedRelationshipGoalCount(me: UserProfile, profile: UserProfile) {
  if (me.relationshipGoals.length === 0 || profile.relationshipGoals.length === 0) return 0;
  return profile.relationshipGoals.filter((goal) => me.relationshipGoals.includes(goal)).length;
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`h-10 rounded-lg font-semibold ${
        active ? 'bg-teal-300 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-200'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}



import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Eye, Heart, Play, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { UserProfile } from '../types';
import {
  sendDislike,
  trySendLike,
  unlockLikedBy,
  unlockLikeBonus,
  undoProfileInteraction,
  useLikedBy,
  useSeenProfileIds,
} from '../hooks/useMatches';
import { distanceKm } from '../utils/geo';
import { showRewardedVideoAd } from '../adMob';
import ProfilePreview from './ProfilePreview';

type Props = {
  me: UserProfile;
  profiles: UserProfile[];
};

export default function Discovery({ me, profiles }: Props) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [matchProfile, setMatchProfile] = useState<UserProfile | null>(null);
  const [videoAdContext, setVideoAdContext] = useState<'likes' | 'likedBy' | null>(null);
  const [likedByAdUnlocked, setLikedByAdUnlocked] = useState(false);
  const [likedByModalOpen, setLikedByModalOpen] = useState(false);
  const [likedByPage, setLikedByPage] = useState(0);
  const [handledLikedByIds, setHandledLikedByIds] = useState<Set<string>>(new Set());
  const [maxDistanceKm, setMaxDistanceKm] = useState(me.visibilityRadius || 50);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [withPhotoOnly, setWithPhotoOnly] = useState(true);
  const [newOnly, setNewOnly] = useState(false);
  const likedBy = useLikedBy(me);
  const seenIds = useSeenProfileIds(me.uid);
  const likedByUnlocked =
    me.isPremium || likedByAdUnlocked || (me.likedByUnlockUntil ? Date.parse(me.likedByUnlockUntil) > Date.now() : false);
  const queue = useMemo(
    () =>
      profiles
        .filter((profile) => !skipped.has(profile.uid) && !seenIds.has(profile.uid))
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
        }),
    [maxDistanceKm, me.location, newOnly, onlineOnly, profiles, seenIds, skipped, withPhotoOnly],
  );
  const current = queue[0];
  const visibleLikedBy = likedByUnlocked ? likedBy.filter((profile) => !handledLikedByIds.has(profile.uid)) : [];
  const likedByPageSize = 6;
  const likedByTotalPages = Math.max(1, Math.ceil(visibleLikedBy.length / likedByPageSize));
  const safeLikedByPage = Math.min(likedByPage, likedByTotalPages - 1);
  const pagedLikedBy = visibleLikedBy.slice(safeLikedByPage * likedByPageSize, (safeLikedByPage + 1) * likedByPageSize);

  async function finishVideoAd() {
    if (videoAdContext === 'likedBy') {
      await unlockLikedBy(me.uid);
      setLikedByAdUnlocked(true);
      setLikedByModalOpen(true);
      setLikedByPage(0);
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
      setMatchProfile(profile);
    }
    await registerLikeForAds();
    setPreviewProfile(null);
    setSkipped((prev) => new Set(prev).add(profile.uid));
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
      setMessage(error instanceof Error ? error.message : 'Não consegui registrar o dislike.');
    }
  }

  async function dislikeLikedByProfile(profile: UserProfile) {
    await dislikeProfile(profile);
    setHandledLikedByIds((current) => new Set(current).add(profile.uid));
  }

  async function handleLike() {
    if (!current) return;
    await likeProfile(current);
  }

  async function handleDislike() {
    if (!current) return;
    await dislikeProfile(current);
  }

  async function resetCardInteractions() {
    setMessage('');
    try {
      await Promise.all([...seenIds].map((uid) => undoProfileInteraction(me.uid, uid)));
      setSkipped(new Set());
      setMessage('Interações desfeitas. Os perfis liberados podem aparecer novamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não consegui liberar os perfis agora.');
    }
  }

  return (
    <section className="mx-auto grid max-w-md gap-4">
      {previewProfile && (
        <ProfilePreview
          me={me}
          onClose={() => setPreviewProfile(null)}
          onDislike={dislikeProfile}
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
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Anúncio</p>
                <h2 className="mt-1 text-lg font-semibold">Video patrocinado</h2>
                <p className="mt-2 text-sm text-slate-300">
                  {videoAdContext === 'likedBy'
                    ? 'Assista ao vídeo para liberar todas as pessoas que curtiram você.'
                    : 'Este espaço simula o vídeo que aparecerá a cada 30 curtidas. No app real, aqui entra o AdMob.'}
                </p>
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
                  {videoAdContext === 'likedBy' ? 'Liberar lista' : 'Fechar anúncio'}
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
              className="w-full max-w-sm rounded-lg border border-teal-300/40 bg-[#07111f] p-6 text-center shadow-2xl shadow-teal-950/50"
              initial={{ scale: 0.86, y: 30 }}
            >
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-teal-300 text-slate-950">
                <Sparkles className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-3xl font-semibold">Deu match!</h1>
              <p className="mt-2 text-sm text-slate-300">Você e {matchProfile.displayName} se curtiram.</p>
              <div className="mt-5 flex justify-center -space-x-4">
                <img alt="" className="h-20 w-20 rounded-lg border-2 border-[#07111f] object-cover" src={me.photoURL} />
                <img alt="" className="h-20 w-20 rounded-lg border-2 border-[#07111f] object-cover" src={matchProfile.photoURL} />
              </div>
              <button
                className="mt-6 h-11 w-full rounded-lg bg-teal-300 font-semibold text-slate-950"
                onClick={() => setMatchProfile(null)}
                type="button"
              >
                Continuar
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
                  <h2 className="text-lg font-semibold">Quem te curtiu</h2>
                  <p className="text-sm text-slate-300">
                    {visibleLikedBy.length} {visibleLikedBy.length === 1 ? 'pessoa' : 'pessoas'}
                  </p>
                </div>
                <button
                  aria-label="Fechar lista"
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
                    Ninguém te curtiu ainda.
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
                          <img alt="" className="h-11 w-11 rounded-lg object-cover" src={profile.photoURL} />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{profile.displayName}</span>
                        </button>
                        <button
                          aria-label={`Recusar ${profile.displayName}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-rose-100"
                          onClick={() => dislikeLikedByProfile(profile)}
                          type="button"
                        >
                          <X className="h-4 w-4" />
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
                    Anterior
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
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </footer>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative h-[68dvh] min-h-[480px] overflow-hidden rounded-lg border border-white/10 bg-white/8">
        <AnimatePresence mode="popLayout">
          {current ? (
            <motion.article
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="absolute inset-0"
              exit={{ opacity: 0, scale: 0.96, y: -20 }}
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              key={current.uid}
            >
              <img alt="" className="h-full w-full object-cover" src={current.photoURL} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/24 to-transparent p-4 pt-28">
                <div className="rounded-lg border border-white/15 bg-slate-950/82 p-4 text-white shadow-2xl backdrop-blur-md">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="truncate text-3xl font-semibold">{current.displayName}</h1>
                      <p className="mt-1 text-sm text-slate-200">
                        {me.location && current.location
                          ? `${distanceKm(me.location, current.location).toFixed(1)} km de distância`
                          : 'Distância indisponível'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-white/15 px-2 py-1 text-xs text-slate-100">
                      {current.privacyMode === 'exact' ? 'Visível no mapa' : 'Fora do mapa'}
                    </span>
                  </div>
                  {current.bio && <p className="mt-3 line-clamp-3 text-sm text-slate-200">{current.bio}</p>}
                  <button
                    className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white"
                    onClick={() => setPreviewProfile(current)}
                    type="button"
                  >
                    <Eye className="h-4 w-4" />
                    Ver bio e fotos
                  </button>
                </div>
              </div>
            </motion.article>
          ) : (
            <div className="grid h-full place-items-center bg-slate-950/70 p-6 text-center text-slate-200">
              <div className="max-w-xs">
                <p className="text-base font-semibold text-white">Sem cards disponíveis</p>
                <p className="mt-2 text-sm text-slate-300">
                  Você pode ter curtido ou recusado todos os perfis disponíveis nos filtros atuais.
                </p>
                {seenIds.size > 0 && (
                  <button
                    className="mt-4 h-10 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950"
                    onClick={resetCardInteractions}
                    type="button"
                  >
                    Liberar perfis novamente
                  </button>
                )}
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          aria-label="Dislike"
          className="grid h-14 place-items-center rounded-lg border border-white/10 bg-white/8 text-rose-100"
          onClick={handleDislike}
          type="button"
        >
          <X className="h-6 w-6" />
        </button>
        <button
          aria-label="Like"
          className="grid h-14 place-items-center rounded-lg bg-teal-300 text-slate-950"
          onClick={handleLike}
          type="button"
        >
          <Heart className="h-6 w-6" />
        </button>
      </div>

      <section className="rounded-lg border border-white/10 bg-white/8 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-teal-300" />
          Filtros dos cards
        </div>
        <label className="grid gap-2 text-sm text-slate-200">
          Distância máxima: {maxDistanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km
          <input
            max={500}
            min={1}
            onChange={(event) => setMaxDistanceKm(Number(event.target.value))}
            type="range"
            value={maxDistanceKm}
          />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <ToggleButton active={onlineOnly} label="Online" onClick={() => setOnlineOnly((current) => !current)} />
          <ToggleButton active={withPhotoOnly} label="Com foto" onClick={() => setWithPhotoOnly((current) => !current)} />
          <ToggleButton active={newOnly} label="Novos" onClick={() => setNewOnly((current) => !current)} />
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/8 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Quem te curtiu</h2>
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
            Ver lista
          </button>
        </div>
        {false && (
          <div className="mt-3 grid gap-2">
            {likedBy.length === 0 && <p className="text-sm text-slate-300">Ninguém te curtiu ainda.</p>}
            {visibleLikedBy.map((profile) => (
              <article className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2" key={profile.uid}>
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setPreviewProfile(profile)}
                  type="button"
                >
                  <img alt="" className="h-10 w-10 rounded-lg object-cover" src={profile.photoURL} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{profile.displayName}</span>
                </button>
                <button
                  aria-label={`Recusar ${profile.displayName}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-rose-100"
                  onClick={() => dislikeLikedByProfile(profile)}
                  type="button"
                >
                  <X className="h-4 w-4" />
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



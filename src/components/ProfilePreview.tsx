import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Handshake, Heart, Users, X } from 'lucide-react';
import type { UserProfile } from '../types';
import { genderLabel, sexualityLabel, useI18n } from '../i18n';
import { distanceKm, formatPersonDistanceKm } from '../utils/geo';
import { reportProfile, useProfileConnectionCount, useProfileInteractionStatus } from '../hooks/useMatches';
import { reportReasons, type ReportReason } from '../reportOptions';
import CachedMediaImage from './CachedMediaImage';

type Props = {
  me: UserProfile;
  profile: UserProfile;
  onClose: () => void;
  onDislike?: (profile: UserProfile) => void | Promise<void>;
  onFriend?: (profile: UserProfile) => void | Promise<void>;
  onLike?: (profile: UserProfile) => void | Promise<void>;
  showReport?: boolean;
  overlayClassName?: string;
};

export default function ProfilePreview({ me, profile, onClose, onDislike, onFriend, onLike, showReport = true, overlayClassName = 'z-[1600]' }: Props) {
  const { t } = useI18n();
  const photos = useMemo(() => {
    const orderedPhotos = [profile.photoURL, ...profile.photos].filter(Boolean);
    return [...new Set(orderedPhotos)];
  }, [profile.photoURL, profile.photos]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [reportMessage, setReportMessage] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('harassment');
  const photo = photos[photoIndex] ?? profile.photoURL;
  const hasInteraction = useProfileInteractionStatus(me.uid, profile.uid);
  const connectionCount = useProfileConnectionCount(profile.uid);

  useEffect(() => {
    setPhotoIndex(0);
  }, [profile.uid]);

  function previousPhoto() {
    setPhotoIndex((current) => (current === 0 ? photos.length - 1 : current - 1));
  }

  function nextPhoto() {
    setPhotoIndex((current) => (current + 1) % photos.length);
  }

  async function handleReport() {
    try {
      await reportProfile(me.uid, profile.uid, reportReason);
      setReportMessage(t('reportSent'));
      setReportOpen(false);
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : t('reportError'));
    }
  }

  return (
    <div className={`fixed inset-0 grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-6 ${overlayClassName}`}>
      <section className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-lg border border-white/10 bg-[#07111f] text-white shadow-2xl sm:rounded-lg">
        <div className="relative aspect-[4/5] bg-slate-900">
          <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-full w-full" src={photo} />
          <button
            aria-label={t('close')}
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-lg bg-black/45"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                aria-label={t('previousPhoto')}
                className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg bg-black/45"
                onClick={previousPhoto}
                type="button"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                aria-label={t('nextPhoto')}
                className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg bg-black/45"
                onClick={nextPhoto}
                type="button"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute inset-x-4 bottom-4 flex gap-1">
                {photos.map((item, index) => (
                  <span
                    className={`h-1 flex-1 rounded-full ${index === photoIndex ? 'bg-teal-300' : 'bg-white/35'}`}
                    key={`${item}-${index}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="space-y-4 p-5">
          <div>
            <h1 className="text-2xl font-semibold">{profile.displayName}</h1>
            <p className="mt-1 text-sm text-slate-300">
              {profile.showDistance && me.location && profile.location
                ? t('distanceKm', { distance: formatPersonDistanceKm(distanceKm(me.location, profile.location)).replace(' km', '') })
                : t('distanceUnavailable')}
            </p>
            {connectionCount !== null && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-xs font-semibold text-slate-200">
                <Users className="h-3.5 w-3.5 text-sky-300" />
                {connectionCount} {t(connectionCount === 1 ? 'connectionSingular' : 'connectionPlural')}
              </p>
            )}
          </div>
          {profile.bio && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{profile.bio}</p>}
          <div className="grid gap-3 text-sm">
            <div>
              <span className="text-slate-400">{t('gender')}</span>
              <p>{genderLabel(profile.gender, t)}</p>
            </div>
            <div>
              <span className="text-slate-400">{t('sexuality')}</span>
              <p>
                {profile.sexualities.length
                  ? profile.sexualities.map((value) => sexualityLabel(value, t)).join(', ')
                  : t('notInformed')}
              </p>
            </div>
          </div>
          {reportMessage && <p className="rounded-lg bg-white/8 p-2 text-xs text-slate-100">{reportMessage}</p>}
          {showReport && (
            <div className="grid gap-2">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-rose-100"
                onClick={() => setReportOpen((current) => !current)}
                type="button"
              >
                <Flag className="h-4 w-4" />
                {t('reportProfile')}
              </button>
              {reportOpen && (
                <div className="grid gap-2 rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-300">Escolha o motivo da denúncia.</p>
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
                        {t(reason.value)}
                      </button>
                    ))}
                  </div>
                  <button className="h-10 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950" onClick={handleReport} type="button">
                    {t('sendReport')}
                  </button>
                </div>
              )}
            </div>
          )}
          {hasInteraction === false && (onLike || onDislike || onFriend) && (
            <div
              className="grid gap-3 pt-2"
              style={{ gridTemplateColumns: `repeat(${[onDislike, onFriend, onLike].filter(Boolean).length}, minmax(0, 1fr))` }}
            >
              {onDislike && (
                <button
                  className="grid h-14 place-items-center rounded-lg border border-white/10 bg-white/8 text-rose-100"
                  onClick={() => onDislike(profile)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
              {onFriend && (
                <button
                  aria-label={t('connectFriend')}
                  className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-sky-400/60 bg-sky-400/10 text-sky-300"
                  onClick={() => onFriend(profile)}
                  type="button"
                >
                  <Handshake className="h-5 w-5" />
                  <span className="text-[10px] font-semibold">{t('connectFriend')}</span>
                </button>
              )}
              {onLike && (
                <button
                  className="grid h-14 place-items-center rounded-lg bg-teal-300 text-slate-950"
                  onClick={() => onLike(profile)}
                  type="button"
                >
                  <Heart className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

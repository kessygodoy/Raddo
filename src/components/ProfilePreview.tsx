import { useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Heart, X } from 'lucide-react';
import type { UserProfile } from '../types';
import { genderLabel, sexualityLabel, useI18n } from '../i18n';
import { distanceKm } from '../utils/geo';
import { reportProfile } from '../hooks/useMatches';

type Props = {
  me: UserProfile;
  profile: UserProfile;
  onClose: () => void;
  onDislike?: (profile: UserProfile) => void | Promise<void>;
  onLike?: (profile: UserProfile) => void | Promise<void>;
  showReport?: boolean;
  overlayClassName?: string;
};

export default function ProfilePreview({ me, profile, onClose, onDislike, onLike, showReport = true, overlayClassName = 'z-40' }: Props) {
  const { t } = useI18n();
  const photos = profile.photos.length ? profile.photos : [profile.photoURL];
  const [photoIndex, setPhotoIndex] = useState(0);
  const [reportMessage, setReportMessage] = useState('');
  const photo = photos[photoIndex] ?? profile.photoURL;

  function previousPhoto() {
    setPhotoIndex((current) => (current === 0 ? photos.length - 1 : current - 1));
  }

  function nextPhoto() {
    setPhotoIndex((current) => (current + 1) % photos.length);
  }

  async function handleReport() {
    const confirmed = window.confirm(t('reportProfileConfirm'));
    if (!confirmed) return;

    try {
      await reportProfile(me.uid, profile.uid);
      setReportMessage(t('reportSent'));
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : t('reportError'));
    }
  }

  return (
    <div className={`fixed inset-0 grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-6 ${overlayClassName}`}>
      <section className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-lg border border-white/10 bg-[#07111f] text-white shadow-2xl sm:rounded-lg">
        <div className="relative aspect-[4/5] bg-slate-900">
          <img alt="" className="h-full w-full object-cover" src={photo} />
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
              {me.location && profile.location
                ? t('distanceKm', { distance: distanceKm(me.location, profile.location).toFixed(1) })
                : t('distanceUnavailable')}
            </p>
          </div>
          {profile.bio && <p className="text-sm leading-6 text-slate-200">{profile.bio}</p>}
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
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 text-sm text-rose-100"
              onClick={handleReport}
              type="button"
            >
              <Flag className="h-4 w-4" />
              {t('reportProfile')}
            </button>
          )}
          {(onLike || onDislike) && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {onDislike && (
                <button
                  className="grid h-12 place-items-center rounded-lg border border-white/10 bg-white/8 text-rose-100"
                  onClick={() => onDislike(profile)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
              {onLike && (
                <button
                  className="grid h-12 place-items-center rounded-lg bg-teal-300 text-slate-950"
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

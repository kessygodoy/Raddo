import { SyntheticEvent, useEffect, useState } from 'react';
import { profilePhotoPathFromValue, signedProfilePhotoUrl } from '../storageImages';
import { encryptedCachedObjectUrlOnly } from '../encryptedMediaCache';

type Props = {
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  onLoaded?: () => void;
  src: string;
};

const SNAPSHOT_PREFIX = 'raddo-media-snapshot:';
const SNAPSHOT_SIZE = 96;

function snapshotKey(src: string) {
  const stableValue = profilePhotoPathFromValue(src) || src;
  try {
    return `${SNAPSHOT_PREFIX}${btoa(unescape(encodeURIComponent(stableValue))).slice(0, 180)}`;
  } catch {
    return `${SNAPSHOT_PREFIX}${stableValue.slice(0, 180)}`;
  }
}

function readSnapshot(src: string) {
  try {
    return window.localStorage.getItem(snapshotKey(src)) ?? '';
  } catch {
    return '';
  }
}

function writeSnapshot(src: string, image: HTMLImageElement) {
  try {
    if (!src || !image.naturalWidth || !image.naturalHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = SNAPSHOT_SIZE;
    canvas.height = SNAPSHOT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return;

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = Math.max(0, Math.round((image.naturalWidth - sourceSize) / 2));
    const sourceY = Math.max(0, Math.round((image.naturalHeight - sourceSize) / 2));
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, SNAPSHOT_SIZE, SNAPSHOT_SIZE);
    const dataUrl = canvas.toDataURL('image/webp', 0.62);
    if (dataUrl.length < 45000) window.localStorage.setItem(snapshotKey(src), dataUrl);
  } catch {
    // Some remote images cannot be drawn to canvas because of CORS. Full cache still handles them.
  }
}

export default function CachedMediaImage({ alt = '', className = '', fallbackClassName = '', onLoaded, src }: Props) {
  const [displaySrc, setDisplaySrc] = useState(() => readSnapshot(src));
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const snapshot = readSnapshot(src);
    setLoaded(Boolean(snapshot));
    setFailed(false);
    setDisplaySrc(snapshot);

    async function resolveCachedSource() {
      const path = profilePhotoPathFromValue(src);
      if (!path) {
        if (active) setDisplaySrc(src);
        return;
      }
      const cached = await encryptedCachedObjectUrlOnly(path, '').catch(() => '');
      if (active && cached) {
        setDisplaySrc(cached);
        return;
      }
      if (active) setDisplaySrc(src);
    }

    void resolveCachedSource();

    return () => {
      active = false;
    };
  }, [src]);

  async function handleError() {
    if (failed) return;
    setFailed(true);
    const renewed = await signedProfilePhotoUrl(src, { encryptedCache: true }).catch(() => '');
    if (renewed && renewed !== displaySrc) {
      setFailed(false);
      setDisplaySrc(renewed);
    }
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    setLoaded(true);
    setFailed(false);
    writeSnapshot(src, event.currentTarget);
    onLoaded?.();
  }

  return (
    <span className={`relative block overflow-hidden ${fallbackClassName}`}>
      {!loaded && (
        <span className="absolute inset-0 grid place-items-center bg-slate-900/90">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-[#ff3f68]" />
        </span>
      )}
      {failed && <span className="absolute inset-0 bg-slate-900" />}
      {displaySrc && (
        <img
          alt={alt}
          className={`${className} ${loaded && !failed ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150`}
          draggable={false}
          onError={handleError}
        onLoad={handleLoad}
          src={displaySrc}
        />
      )}
    </span>
  );
}

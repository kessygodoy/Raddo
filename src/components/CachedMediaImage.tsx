import { SyntheticEvent, useEffect, useState } from 'react';
import { profilePhotoPathFromValue, signedProfilePhotoThumbnailUrl, signedProfilePhotoUrl } from '../storageImages';
import { encryptedCachedObjectUrlOnly } from '../encryptedMediaCache';

type Props = {
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  onLoaded?: () => void;
  src: string;
  thumbnailOnly?: boolean;
};

const SNAPSHOT_PREFIX = 'raddo-media-thumb-v2:';
const SNAPSHOT_SIZE = 72;
const SNAPSHOT_MAX_LENGTH = 18000;
const SNAPSHOT_MAX_ITEMS = 120;
const lastGoodSources = new Map<string, string>();

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
    const dataUrl = canvas.toDataURL('image/webp', 0.5);
    if (dataUrl.length < SNAPSHOT_MAX_LENGTH) {
      pruneSnapshots();
      window.localStorage.setItem(snapshotKey(src), dataUrl);
    }
  } catch {
    // Some remote images cannot be drawn to canvas because of CORS. Full cache still handles them.
  }
}

function pruneSnapshots() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(SNAPSHOT_PREFIX)) keys.push(key);
    }
    keys.slice(0, Math.max(0, keys.length - SNAPSHOT_MAX_ITEMS)).forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Snapshot cache is best-effort only.
  }
}

function stableMediaKey(src: string) {
  return profilePhotoPathFromValue(src) || src;
}

export default function CachedMediaImage({ alt = '', className = '', fallbackClassName = '', onLoaded, src, thumbnailOnly = false }: Props) {
  const [displaySrc, setDisplaySrc] = useState(() => {
    const path = profilePhotoPathFromValue(src);
    return lastGoodSources.get(stableMediaKey(src)) || readSnapshot(src) || (path ? '' : src);
  });
  const [loaded, setLoaded] = useState(Boolean(displaySrc));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const mediaKey = stableMediaKey(src);
    const path = profilePhotoPathFromValue(src);
    const snapshot = readSnapshot(src);
    const lastGood = lastGoodSources.get(mediaKey);
    const immediateSrc = lastGood || snapshot || (path ? '' : src);
    setLoaded(Boolean(immediateSrc));
    setFailed(false);
    setDisplaySrc(immediateSrc);

    async function resolveCachedSource() {
      if (!path) {
        if (active) {
          setDisplaySrc(src);
          lastGoodSources.set(mediaKey, src);
        }
        return;
      }
      if (!thumbnailOnly) {
        const cached = await encryptedCachedObjectUrlOnly(path, '').catch(() => '');
        if (active && cached) {
          setDisplaySrc(cached);
          setLoaded(true);
          lastGoodSources.set(mediaKey, cached);
          return;
        }
      }
      const renewed = await (thumbnailOnly
        ? signedProfilePhotoThumbnailUrl(src)
        : signedProfilePhotoUrl(src, { encryptedCache: true })
      ).catch(() => '');
      if (active && renewed) {
        setDisplaySrc(renewed);
        lastGoodSources.set(mediaKey, renewed);
      }
    }

    void resolveCachedSource();

    return () => {
      active = false;
    };
  }, [src, thumbnailOnly]);

  async function handleError() {
    if (failed) return;
    setFailed(true);
    const mediaKey = stableMediaKey(src);
    const renewed = await (thumbnailOnly
      ? signedProfilePhotoThumbnailUrl(src)
      : signedProfilePhotoUrl(src, { encryptedCache: true })
    ).catch(() => '');
    if (renewed && renewed !== displaySrc) {
      setFailed(false);
      setDisplaySrc(renewed);
      lastGoodSources.set(mediaKey, renewed);
    }
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    setLoaded(true);
    setFailed(false);
    writeSnapshot(src, event.currentTarget);
    lastGoodSources.set(stableMediaKey(src), event.currentTarget.currentSrc || displaySrc);
    onLoaded?.();
  }

  return (
    <span className={`relative block overflow-hidden ${fallbackClassName}`}>
      {!loaded && (
        <span className="raddo-media-skeleton grid place-items-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-[#ff3f68]" />
        </span>
      )}
      {displaySrc && (
        <img
          alt={alt}
          className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150`}
          draggable={false}
          onError={handleError}
        onLoad={handleLoad}
          src={displaySrc}
        />
      )}
    </span>
  );
}

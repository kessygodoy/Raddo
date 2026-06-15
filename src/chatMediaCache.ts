import { useEffect, useState } from 'react';
import {
  deleteEncryptedCachedMedia,
  deleteEncryptedCachedMediaKeys,
  encryptedCachedObjectUrl,
} from './encryptedMediaCache';

export async function deleteCachedChatMedia(cacheKey: string) {
  await deleteEncryptedCachedMedia(cacheKey);
}

export async function deleteCachedChatMediaKeys(cacheKeys: string[]) {
  await deleteEncryptedCachedMediaKeys(cacheKeys);
}

export function useCachedChatMediaUrl(input: {
  cacheKey: string;
  enabled: boolean;
  url: string;
}) {
  const [cachedUrl, setCachedUrl] = useState(input.url);

  useEffect(() => {
    setCachedUrl(input.url);
    if (input.url.startsWith('blob:') || input.url.startsWith('data:')) return undefined;
    if (!input.enabled || !input.url || !input.cacheKey) return undefined;

    let active = true;

    async function loadFromDeviceCache() {
      try {
        const nextUrl = await encryptedCachedObjectUrl(input.cacheKey, input.url);
        if (active) setCachedUrl(nextUrl);
      } catch {
        if (active) setCachedUrl(input.url);
      }
    }

    void loadFromDeviceCache();

    return () => {
      active = false;
    };
  }, [input.cacheKey, input.enabled, input.url]);

  return cachedUrl;
}

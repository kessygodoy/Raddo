const DISPOSABLE_PREFIXES = [
  'raddo-media-thumb-v2:',
  'raddo-match-messages-cache:',
  'raddo-map-event-messages-cache:',
  'raddo-map-events-cache:',
  'raddo-local-map-events-cache:',
  'raddo-nearby-profiles-cache:',
  'raddo-connections-matches:',
  'raddo-connections-summary:',
  'raddo-match-profiles-cache:',
  'raddo-auth-profile-cache:',
  'raddo-device-notifications:',
  'raddo:viewed-map-stories:',
  'raddo:view-once:',
];

export function clearRaddoDisposableLocalCaches() {
  if (typeof window === 'undefined') return;

  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && DISPOSABLE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Best-effort cleanup only.
  }
}

export function clearRaddoAuthBlockingLocalCaches() {
  if (typeof window === 'undefined') return;

  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && (key.startsWith('raddo-') || key.startsWith('raddo:') || key.startsWith('radar-match-'))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Best-effort cleanup only.
  }
}

export function hasAuthCallbackInUrl(url = typeof window !== 'undefined' ? window.location.href : '') {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    return Boolean(
      parsed.searchParams.get('code') ||
        parsed.searchParams.get('access_token') ||
        hashParams.get('access_token') ||
        parsed.searchParams.get('refresh_token') ||
        hashParams.get('refresh_token') ||
        parsed.searchParams.get('token_hash') ||
        hashParams.get('token_hash'),
    );
  } catch {
    return false;
  }
}

export function prepareLocalStorageForAuthCallback() {
  if (!hasAuthCallbackInUrl()) return;
  clearRaddoDisposableLocalCaches();
  clearRaddoAuthBlockingLocalCaches();
}

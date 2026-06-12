const DB_NAME = 'raddo-encrypted-media-cache';
const DB_VERSION = 1;
const STORE_MEDIA = 'media';
const STORE_KEYS = 'keys';
const KEY_ID = 'device-media-key';
const KEY_ALGORITHM = 'AES-GCM';

type CachedMediaRecord = {
  cacheKey: string;
  createdAt: number;
  data: ArrayBuffer;
  iv: ArrayBuffer;
  type: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;
const objectUrls = new Map<string, string>();

function supportsEncryptedCache() {
  return typeof window !== 'undefined' && 'indexedDB' in window && window.crypto?.subtle;
}

function openDatabase() {
  if (!supportsEncryptedCache()) return Promise.reject(new Error('Encrypted cache is not supported.'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MEDIA)) db.createObjectStore(STORE_MEDIA, { keyPath: 'cacheKey' });
      if (!db.objectStoreNames.contains(STORE_KEYS)) db.createObjectStore(STORE_KEYS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function transaction<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = run(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

async function getDeviceKey() {
  const stored = await transaction<CryptoKey | undefined>(STORE_KEYS, 'readonly', (store) => store.get(KEY_ID)).catch(() => undefined);
  if (stored) return stored;

  const key = await window.crypto.subtle.generateKey({ name: KEY_ALGORITHM, length: 256 }, false, ['encrypt', 'decrypt']);
  await transaction<IDBValidKey>(STORE_KEYS, 'readwrite', (store) => store.put(key, KEY_ID));
  return key;
}

async function readEncryptedBlob(cacheKey: string) {
  if (!supportsEncryptedCache() || !cacheKey) return null;

  const record = await transaction<CachedMediaRecord | undefined>(STORE_MEDIA, 'readonly', (store) => store.get(cacheKey)).catch(() => undefined);
  if (!record) return null;

  try {
    const key = await getDeviceKey();
    const decrypted = await window.crypto.subtle.decrypt({ name: KEY_ALGORITHM, iv: new Uint8Array(record.iv) }, key, record.data);
    return new Blob([decrypted], { type: record.type || 'application/octet-stream' });
  } catch {
    await deleteEncryptedCachedMedia(cacheKey);
    return null;
  }
}

async function writeEncryptedBlob(cacheKey: string, blob: Blob) {
  if (!supportsEncryptedCache() || !cacheKey || blob.size === 0) return;

  const key = await getDeviceKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt({ name: KEY_ALGORITHM, iv }, key, await blob.arrayBuffer());
  const record: CachedMediaRecord = {
    cacheKey,
    createdAt: Date.now(),
    data: encrypted,
    iv: iv.buffer.slice(0),
    type: blob.type || 'application/octet-stream',
  };
  await transaction<IDBValidKey>(STORE_MEDIA, 'readwrite', (store) => store.put(record));
}

function objectUrlForBlob(cacheKey: string, blob: Blob) {
  const existing = objectUrls.get(cacheKey);
  if (existing) URL.revokeObjectURL(existing);
  const url = URL.createObjectURL(blob);
  objectUrls.set(cacheKey, url);
  return url;
}

export async function encryptedCachedObjectUrl(cacheKey: string, sourceUrl: string) {
  if (!cacheKey || !sourceUrl || sourceUrl.startsWith('blob:')) return sourceUrl;
  if (!supportsEncryptedCache()) return sourceUrl;

  const cachedBlob = await readEncryptedBlob(cacheKey);
  if (cachedBlob) return objectUrlForBlob(cacheKey, cachedBlob);

  const response = await fetch(sourceUrl, { cache: 'force-cache' });
  if (!response.ok) return sourceUrl;
  const blob = await response.blob();
  await writeEncryptedBlob(cacheKey, blob);
  return objectUrlForBlob(cacheKey, blob);
}

export async function encryptedCachedObjectUrlOnly(cacheKey: string, fallbackUrl: string) {
  if (!cacheKey || !supportsEncryptedCache()) return fallbackUrl;
  const cachedBlob = await readEncryptedBlob(cacheKey);
  return cachedBlob ? objectUrlForBlob(cacheKey, cachedBlob) : fallbackUrl;
}

export async function deleteEncryptedCachedMedia(cacheKey: string) {
  if (!cacheKey || !supportsEncryptedCache()) return;
  const objectUrl = objectUrls.get(cacheKey);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrls.delete(cacheKey);
  }
  await transaction<undefined>(STORE_MEDIA, 'readwrite', (store) => store.delete(cacheKey));
}

export async function deleteEncryptedCachedMediaKeys(cacheKeys: string[]) {
  await Promise.all([...new Set(cacheKeys.filter(Boolean))].map((cacheKey) => deleteEncryptedCachedMedia(cacheKey)));
}

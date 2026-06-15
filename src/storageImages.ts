import { supabase } from './supabase';
import type { UserProfile } from './types';
import { encryptedCachedObjectUrl, encryptedCachedObjectUrlOnly, encryptedCacheKeyForObjectUrl, writeEncryptedCachedMedia } from './encryptedMediaCache';

const PROFILE_BUCKET = 'profile-photos';
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
const MAX_UPLOAD_IMAGE_EDGE = 820;
const MAX_UPLOAD_IMAGE_BYTES = 160 * 1024;
const UPLOAD_IMAGE_QUALITY = 0.64;
const MIN_UPLOAD_IMAGE_QUALITY = 0.36;
const MIN_UPLOAD_IMAGE_EDGE = 480;
const MAX_UPLOAD_VIDEO_EDGE = 540;
const UPLOAD_VIDEO_BITRATE = 650_000;

export function profilePhotoPathFromValue(value: string) {
  if (!value) return '';
  if (value.startsWith('blob:') || value.startsWith('data:')) return '';
  if (!value.startsWith('http')) return value.replace(/^profile-photos\//, '');

  try {
    const url = new URL(value);
    const marker = `/storage/v1/object/public/${PROFILE_BUCKET}/`;
    const privateMarker = `/storage/v1/object/sign/${PROFILE_BUCKET}/`;
    if (url.pathname.includes(privateMarker)) return decodeURIComponent(url.pathname.split(privateMarker)[1] ?? '');
    if (url.pathname.includes(marker)) return decodeURIComponent(url.pathname.split(marker)[1] ?? '');
  } catch {
    return '';
  }

  return '';
}

export function permanentProfilePhotoValue(value: string) {
  if (!value) return '';
  if (value.startsWith('blob:')) return encryptedCacheKeyForObjectUrl(value);
  return profilePhotoPathFromValue(value) || value;
}

export async function signedProfilePhotoUrl(value: string, options: { encryptedCache?: boolean } = {}) {
  const path = profilePhotoPathFromValue(value);
  if (!path) return value;
  if (options.encryptedCache !== false) {
    const cachedUrl = await encryptedCachedObjectUrlOnly(path, '');
    if (cachedUrl) return cachedUrl;
  }

  const { data, error } = await supabase.storage.from(PROFILE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return encryptedCachedObjectUrlOnly(path, value).catch(() => value);
  if (options.encryptedCache === false) return data.signedUrl;
  return encryptedCachedObjectUrl(path, data.signedUrl).catch(() => data.signedUrl);
}

export async function signedProfilePhotoThumbnailUrl(value: string, size = 96) {
  void size;
  return signedProfilePhotoUrl(value, { encryptedCache: false });
}

export async function signedProfilePhotoUrls(values: string[]) {
  return Promise.all(values.filter(Boolean).map((value) => signedProfilePhotoUrl(value)));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Não consegui preparar a imagem para envio.'));
      },
      type,
      quality,
    );
  });
}

function mediaRecorderMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não consegui ler a imagem escolhida.'));
    };
    image.src = url;
  });
}

async function compressImageForUpload(file: File) {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;

  const image = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_UPLOAD_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  if (scale === 1 && file.size <= MAX_UPLOAD_IMAGE_BYTES) return file;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return file;

  context.drawImage(image, 0, 0, width, height);
  const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  let blob = await canvasToBlob(canvas, outputType, UPLOAD_IMAGE_QUALITY);
  let quality = UPLOAD_IMAGE_QUALITY;
  while (blob.size > MAX_UPLOAD_IMAGE_BYTES && quality > MIN_UPLOAD_IMAGE_QUALITY) {
    quality = Math.max(MIN_UPLOAD_IMAGE_QUALITY, quality - 0.08);
    blob = await canvasToBlob(canvas, outputType, quality);
  }

  let currentWidth = width;
  let currentHeight = height;
  while (blob.size > MAX_UPLOAD_IMAGE_BYTES && Math.max(currentWidth, currentHeight) > MIN_UPLOAD_IMAGE_EDGE) {
    const resizeScale = Math.max(MIN_UPLOAD_IMAGE_EDGE / Math.max(currentWidth, currentHeight), 0.72);
    currentWidth = Math.max(1, Math.round(currentWidth * resizeScale));
    currentHeight = Math.max(1, Math.round(currentHeight * resizeScale));
    canvas.width = currentWidth;
    canvas.height = currentHeight;
    context.drawImage(image, 0, 0, currentWidth, currentHeight);
    blob = await canvasToBlob(canvas, outputType, MIN_UPLOAD_IMAGE_QUALITY);
  }

  if (blob.size >= file.size && file.size <= MAX_UPLOAD_IMAGE_BYTES) return file;

  const extension = outputType === 'image/jpeg' ? 'jpg' : outputType.split('/')[1] || 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagem';
  return new File([blob], `${baseName}.${extension}`, { type: outputType, lastModified: Date.now() });
}

function loadVideoMetadata(file: File) {
  return new Promise<{ url: string; video: HTMLVideoElement }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = false;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ url, video });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Nao consegui ler o video escolhido.'));
    };
    video.src = url;
  });
}

function waitForVideoEnd(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    video.onended = () => resolve();
    video.onerror = () => reject(new Error('Nao consegui comprimir o video.'));
  });
}

async function compressVideoForUpload(file: File) {
  if (!file.type.startsWith('video/')) return file;
  if (typeof MediaRecorder === 'undefined') return file;

  const mimeType = mediaRecorderMimeType();
  if (!mimeType) return file;

  const { url, video } = await loadVideoMetadata(file);
  const width = video.videoWidth || 720;
  const height = video.videoHeight || 720;
  const scale = Math.min(1, MAX_UPLOAD_VIDEO_EDGE / Math.max(width, height));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return file;

  const chunks: Blob[] = [];
  const stream = canvas.captureStream(24);
  const streamVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream };
  const sourceStream = typeof streamVideo.captureStream === 'function' ? streamVideo.captureStream() : null;
  sourceStream?.getAudioTracks().forEach((track: MediaStreamTrack) => stream.addTrack(track));
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: UPLOAD_VIDEO_BITRATE,
  });

  const recorded = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error('Nao consegui comprimir o video.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' }));
  });

  let frame = 0;
  const drawFrame = () => {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (!video.paused && !video.ended) frame = window.requestAnimationFrame(drawFrame);
  };

  try {
    recorder.start(1000);
    try {
      await video.play();
    } catch {
      video.muted = true;
      await video.play();
    }
    drawFrame();
    await waitForVideoEnd(video);
    recorder.stop();
    const blob = await recorded;
    if (blob.size === 0 || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([blob], `${baseName}.webm`, { type: blob.type || 'video/webm', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    if (frame) window.cancelAnimationFrame(frame);
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
    stream.getTracks().forEach((track) => track.stop());
  }
}

export async function prepareStorageUploadFile(file: File) {
  if (file.type.startsWith('image/')) return compressImageForUpload(file);
  if (file.type.startsWith('video/')) return compressVideoForUpload(file);
  return file;
}

export async function uploadProfilePhoto(path: string, file: File) {
  const uploadFile = await prepareStorageUploadFile(file);

  const { error } = await supabase.storage.from(PROFILE_BUCKET).upload(path, uploadFile, {
    cacheControl: '3600',
    contentType: uploadFile.type || undefined,
    upsert: true,
  });
  if (error) throw error;
  await writeEncryptedCachedMedia(path, uploadFile).catch(() => undefined);
  return signedProfilePhotoUrl(path, { encryptedCache: false });
}

export async function removeProfilePhoto(path: string) {
  await supabase.storage.from(PROFILE_BUCKET).remove([path]);
}

export async function withSignedProfilePhotos(profile: UserProfile) {
  const [photoURL, photos] = await Promise.all([
    signedProfilePhotoUrl(profile.photoURL),
    signedProfilePhotoUrls(profile.photos),
  ]);

  return {
    ...profile,
    photoURL,
    photos: photos.length ? photos : photoURL ? [photoURL] : [],
  };
}

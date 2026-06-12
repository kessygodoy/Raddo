import { moderateUploadedImage } from './imageModeration';
import { removeProfilePhoto, uploadProfilePhoto } from './storageImages';

const VIDEO_FRAME_COUNT = 5;
const VIDEO_FRAME_EDGE = 720;
const VIDEO_FRAME_QUALITY = 0.82;

function waitForVideoEvent(video: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked') {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Nao consegui analisar o video. Tente um video menor ou grave novamente.'));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener('error', handleError);
    }

    function handleEvent() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error('Nao consegui carregar o video para verificacao.'));
    }

    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function canvasToJpegFile(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Nao consegui preparar a verificacao do video.'));
          return;
        }
        resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
      },
      'image/jpeg',
      VIDEO_FRAME_QUALITY,
    );
  });
}

async function extractVideoFrame(video: HTMLVideoElement, time: number, index: number) {
  video.currentTime = time;
  await waitForVideoEvent(video, 'seeked');

  const scale = Math.min(1, VIDEO_FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nao consegui verificar o video neste aparelho.');

  context.drawImage(video, 0, 0, width, height);
  return canvasToJpegFile(canvas, `video-frame-${index}.jpg`);
}

async function extractVideoFrames(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;

  try {
    await waitForVideoEvent(video, 'loadedmetadata');
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const frameCount = Math.min(VIDEO_FRAME_COUNT, Math.max(1, Math.floor(duration)));
    const times = Array.from({ length: frameCount }, (_, index) => {
      const fraction = (index + 1) / (frameCount + 1);
      return Math.min(Math.max(0.1, duration * fraction), Math.max(0.1, duration - 0.1));
    });

    const frames: File[] = [];
    for (let index = 0; index < times.length; index += 1) {
      frames.push(await extractVideoFrame(video, times[index], index + 1));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

export async function moderateVideoFile(input: {
  allowRejected?: boolean;
  contextId?: string;
  context?: 'map-chat-image' | 'match-chat-image';
  file: File;
  ownerUid: string;
}) {
  const frames = await extractVideoFrames(input.file);
  const uploadedFramePaths: string[] = [];

  try {
    for (let index = 0; index < frames.length; index += 1) {
      const path = `${input.ownerUid}/video-moderation/${Date.now()}-${index + 1}.jpg`;
      uploadedFramePaths.push(path);
      const signedUrl = await uploadProfilePhoto(path, frames[index]);
      const result = await moderateUploadedImage({
        allowRejected: input.allowRejected ?? false,
        context: input.context ?? 'map-chat-image',
        contextId: input.contextId,
        path,
        publicUrl: signedUrl,
      });

      if (result?.allowed === false && !input.allowRejected) {
        const reasonText = result.reasons?.length ? ` Motivo: ${result.reasons.join(', ')}.` : '';
        throw new Error(`Video bloqueado pela verificacao de seguranca.${reasonText}`);
      }
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Video bloqueado pela verificacao de seguranca.');
  } finally {
    await Promise.all(uploadedFramePaths.map((path) => removeProfilePhoto(path)));
  }
}

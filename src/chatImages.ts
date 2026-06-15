import { isDemoMode } from './demoData';
import { moderateUploadedImage } from './imageModeration';
import { prepareStorageUploadFile, uploadProfilePhoto } from './storageImages';

export type ChatImageContext = 'map-chat-image' | 'match-chat-image';
export type ChatMediaUpload = { path: string; url: string };

export async function prepareChatImageFile(file: File) {
  if (!file.type.startsWith('image/')) return file;
  return prepareStorageUploadFile(file);
}

export async function uploadChatMedia(input: {
  allowAdultInRestrictedChat?: boolean;
  allowRejected?: boolean;
  contextId?: string;
  context: ChatImageContext;
  file: File;
  ownerUid: string;
}): Promise<ChatMediaUpload> {
  const isVideo = input.file.type.startsWith('video/');
  if (isVideo) {
    throw new Error('Por enquanto, envie apenas imagens no chat para economizar armazenamento.');
  }

  if (isDemoMode) return { path: '', url: URL.createObjectURL(input.file) };

  const uploadFile = await prepareChatImageFile(input.file);
  const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${input.ownerUid}/chat-images/${Date.now()}-${safeName}`;

  const signedUrl = await uploadProfilePhoto(path, uploadFile);

  await moderateUploadedImage({
    allowAdultInRestrictedChat: input.allowAdultInRestrictedChat ?? input.allowRejected ?? false,
    allowRejected: input.allowRejected ?? false,
    context: input.context,
    contextId: input.contextId,
    path,
    publicUrl: signedUrl,
  });

  return { path, url: signedUrl };
}

export async function uploadChatImage(input: {
  allowRejected?: boolean;
  contextId?: string;
  context: ChatImageContext;
  file: File;
  ownerUid: string;
}) {
  return (await uploadChatMedia(input)).url;
}

import { isDemoMode } from './demoData';
import { moderateUploadedImage } from './imageModeration';
import { uploadProfilePhoto } from './storageImages';

export type ChatImageContext = 'map-chat-image' | 'match-chat-image';

export async function uploadChatImage(input: {
  allowRejected?: boolean;
  contextId?: string;
  context: ChatImageContext;
  file: File;
  ownerUid: string;
}) {
  if (isDemoMode) return URL.createObjectURL(input.file);

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${input.ownerUid}/chat-images/${Date.now()}-${safeName}`;
  const signedUrl = await uploadProfilePhoto(path, input.file);
  await moderateUploadedImage({
    allowRejected: input.allowRejected ?? false,
    context: input.context,
    contextId: input.contextId,
    path,
    publicUrl: signedUrl,
  });
  return signedUrl;
}

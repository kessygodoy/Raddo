import { isDemoMode } from './demoData';
import { moderateUploadedImage } from './imageModeration';
import { supabase } from './supabase';

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
  const { error } = await supabase.storage.from('profile-photos').upload(path, input.file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) throw new Error(error.message || 'Não consegui enviar a imagem.');

  const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
  await moderateUploadedImage({
    allowRejected: input.allowRejected ?? false,
    context: input.context,
    contextId: input.contextId,
    path,
    publicUrl: data.publicUrl,
  });
  return data.publicUrl;
}

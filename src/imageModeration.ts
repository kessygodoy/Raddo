import { supabase } from './supabase';

type ModerationResult = {
  allowed?: boolean;
  error?: string;
  reportCreated?: boolean;
  reportError?: string;
  reasons?: string[];
};

export async function moderateUploadedImage(input: {
  allowRejected?: boolean;
  contextId?: string;
  context: 'chat-cover' | 'map-chat-image' | 'match-chat-image' | 'profile-carousel' | 'profile-photo';
  path: string;
  publicUrl: string;
}) {
  const { data, error } = await supabase.functions.invoke<ModerationResult>('moderate-image', {
    body: {
      bucket: 'profile-photos',
      context: input.context,
      contextId: input.contextId,
      imageUrl: input.publicUrl,
      path: input.path,
    },
  });

  if (error) {
    throw new Error('Não consegui verificar a imagem. Tente outra imagem ou tente novamente.');
  }

  if (!data?.allowed) {
    if (input.allowRejected) return data;
    const reasonText = data?.reasons?.length ? ` Motivo: ${data.reasons.join(', ')}.` : '';
    const reportText = data?.reportError ? ` A denúncia automática não foi registrada: ${data.reportError}` : '';
    throw new Error(`Imagem recusada pela verificação de segurança.${reasonText}${reportText}`);
  }

  return data;
}

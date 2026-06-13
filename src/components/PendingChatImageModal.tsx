import { Eye, Loader2, Send, X } from 'lucide-react';
import CachedMediaImage from './CachedMediaImage';

type Props = {
  imageURL?: string;
  mediaType?: 'image' | 'video';
  onCancel: () => void;
  onSend: () => void;
  sending?: boolean;
  title?: string;
  uploading: boolean;
  viewOnce: boolean;
  setViewOnce: (value: boolean) => void;
};

export default function PendingChatImageModal({
  imageURL,
  mediaType = 'image',
  onCancel,
  onSend,
  sending = false,
  setViewOnce,
  title,
  uploading,
  viewOnce,
}: Props) {
  const busy = uploading || sending;
  const resolvedTitle = title ?? (mediaType === 'video' ? 'Enviar vídeo' : 'Enviar imagem');

  return (
    <div className="fixed inset-0 z-[1600] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <section className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#07111f] text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <h2 className="text-lg font-semibold">{resolvedTitle}</h2>
            <p className="mt-1 text-xs text-slate-300">
              {uploading ? 'Enviando mídia...' : 'Confira antes de enviar.'}
            </p>
          </div>
          <button
            aria-label="Cancelar"
            className="grid h-10 w-10 place-items-center rounded-lg bg-white/8 text-slate-100 disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-72 place-items-center bg-slate-950/70 p-3">
          {uploading && (
            <div className="grid place-items-center gap-3 text-slate-200">
              <Loader2 className="h-9 w-9 animate-spin text-teal-300" />
              <span className="text-sm">Fazendo upload e verificação...</span>
            </div>
          )}
          {!uploading && imageURL && mediaType === 'video' && (
            <video className="max-h-[52dvh] w-full rounded-xl object-contain" controls playsInline src={imageURL} />
          )}
          {!uploading && imageURL && mediaType === 'image' && (
            <CachedMediaImage className="max-h-[52dvh] w-full object-contain" fallbackClassName="max-h-[52dvh] w-full rounded-xl" src={imageURL} />
          )}
        </div>

        <div className="grid gap-3 p-4">
          <button
            className={`flex h-11 items-center justify-between rounded-lg border px-3 text-sm font-semibold ${
              viewOnce
                ? 'border-teal-300 bg-teal-300 text-slate-950'
                : 'border-white/10 bg-white/8 text-slate-100'
            }`}
            disabled={uploading}
            onClick={() => setViewOnce(!viewOnce)}
            type="button"
          >
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Visualização única
            </span>
            <span>{viewOnce ? 'Ativada' : 'Desativada'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100 disabled:opacity-50"
              disabled={busy}
              onClick={onCancel}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950 disabled:opacity-50"
              disabled={busy || !imageURL}
              onClick={onSend}
              type="button"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

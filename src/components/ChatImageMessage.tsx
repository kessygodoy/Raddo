import { useEffect, useState } from 'react';

type Props = {
  imageURL: string;
  mine: boolean;
  onViewed?: () => Promise<void> | void;
  viewed: boolean;
  viewOnce: boolean;
};

export default function ChatImageMessage({ imageURL, mine, onViewed, viewed, viewOnce }: Props) {
  const [open, setOpen] = useState(false);
  const [expiredHere, setExpiredHere] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(10);
  const expired = viewOnce && (expiredHere || (!open && !mine && viewed));

  useEffect(() => {
    if (!open || !viewOnce) return undefined;

    setSecondsLeft(10);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.max(0, 10 - Math.floor((Date.now() - startedAt) / 1000));
      setSecondsLeft(next);
      if (next <= 0) closeImage();
    }, 250);

    return () => window.clearInterval(timer);
  }, [open, viewOnce]);

  async function openImage() {
    if (expired) return;
    setOpen(true);
    if (!viewOnce) return;

    void onViewed?.();
  }

  function closeImage() {
    setOpen(false);
    if (viewOnce) setExpiredHere(true);
  }

  if (expired) {
    return <div className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs text-slate-300">Imagem expirada.</div>;
  }

  return (
    <>
      <button className="block overflow-hidden rounded-lg" onClick={openImage} type="button">
        <img
          alt=""
          className={`max-h-56 w-full max-w-64 object-cover ${viewOnce ? 'scale-110 blur-2xl brightness-75' : ''}`}
          src={imageURL}
        />
        {viewOnce && (
          <span className={`mt-1 block text-left text-[11px] ${mine ? 'text-slate-700' : 'text-slate-300'}`}>
            Ver uma vez
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-[1800] grid place-items-center bg-black/92 p-4">
          {viewOnce && (
            <div className="absolute left-4 top-[calc(env(safe-area-inset-top)+16px)] rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">
              {secondsLeft}s
            </div>
          )}
          <button
            aria-label="Fechar imagem"
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+16px)] grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
            onClick={closeImage}
            type="button"
          >
            x
          </button>
          <img alt="" className="max-h-[84dvh] max-w-full rounded-lg object-contain" src={imageURL} />
        </div>
      )}
    </>
  );
}

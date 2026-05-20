import { useEffect } from 'react';
import { Crown } from 'lucide-react';
import type { AppView } from '../types';
import { hideAdMobBanner, isNativeAdMobAvailable } from '../adMob';

type Props = {
  isPremium: boolean;
  view: AppView;
};

export default function AdBanner({ isPremium, view }: Props) {
  const shouldShowBanner = !isPremium && view !== 'chat';

  useEffect(() => {
    hideAdMobBanner();
  }, []);

  if (!shouldShowBanner || isNativeAdMobAvailable()) return null;

  return (
    <aside className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-20 mx-auto max-w-xl rounded-lg border border-white/10 bg-slate-950/92 px-3 py-2 text-white shadow-xl backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-300 text-slate-950">
          <Crown className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Publicidade</p>
          <p className="truncate text-[11px] text-slate-300">Assine premium por R$4,99/mês e remova anúncios.</p>
        </div>
      </div>
    </aside>
  );
}

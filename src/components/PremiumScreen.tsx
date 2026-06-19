import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BadgeCheck, Eye, Heart, MessageCircle, RefreshCcw, ShoppingBag, VideoOff } from 'lucide-react';
import { useI18n } from '../i18n';
import type { UserProfile } from '../types';
import { buyPremiumSubscription, restorePremiumSubscription } from '../premiumBilling';

type Props = {
  onPremiumActivated?: () => void;
  profile: UserProfile;
};

const perks = [
  { icon: Heart, title: 'premiumPerkLikesTitle', text: 'premiumPerkLikesText' },
  { icon: VideoOff, title: 'premiumPerkAdsTitle', text: 'premiumPerkAdsText' },
  { icon: Eye, title: 'premiumPerkLikedByTitle', text: 'premiumPerkLikedByText' },
  { icon: MessageCircle, title: 'premiumPerkMapChatsTitle', text: 'premiumPerkMapChatsText' },
];

const PREMIUM_SIGNUP_AVAILABLE = false;
const WEB_PREMIUM_CHECKOUT_URL = import.meta.env.VITE_WEB_PREMIUM_CHECKOUT_URL as string | undefined;

export default function PremiumScreen({ onPremiumActivated, profile }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const isNativeApp = Capacitor.isNativePlatform();
  const canUseWebCheckout = !isNativeApp && Boolean(WEB_PREMIUM_CHECKOUT_URL);

  async function handleBuyPremium() {
    setBusy(true);
    setMessage('');
    try {
      await buyPremiumSubscription();
      setMessage('Premium ativado com sucesso.');
      onPremiumActivated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('premiumSubscribeError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestorePremium() {
    setBusy(true);
    setMessage('');
    try {
      await restorePremiumSubscription();
      setMessage('Premium restaurado com sucesso.');
      onPremiumActivated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('premiumRestoreError'));
    } finally {
      setBusy(false);
    }
  }

  function openWebCheckout() {
    if (!WEB_PREMIUM_CHECKOUT_URL) {
      setMessage('Checkout web ainda não configurado.');
      return;
    }

    const checkoutUrl = new URL(WEB_PREMIUM_CHECKOUT_URL);
    checkoutUrl.searchParams.set('uid', profile.uid);
    checkoutUrl.searchParams.set('plan', 'raddo_premium_monthly');
    window.open(checkoutUrl.toString(), '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="mx-auto grid max-w-3xl gap-4">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#07111f]">
        <div className="bg-[linear-gradient(135deg,#0f172a,#1d4ed8_45%,#ec4899)] p-6">
          <div className="grid h-14 w-14 place-items-center rounded-lg bg-white/20 backdrop-blur">
            <BadgeCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold">Raddo Premium</h1>
          <p className="mt-2 text-sm text-slate-100">{t('premiumPrice')}</p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {perks.map((perk) => {
            const Icon = perk.icon;
            return (
              <article className="rounded-lg border border-white/10 bg-white/8 p-4" key={perk.title}>
                <Icon className="h-5 w-5 text-teal-300" />
                <h2 className="mt-3 text-sm font-semibold">{t(perk.title)}</h2>
                <p className="mt-1 text-sm text-slate-300">{t(perk.text)}</p>
              </article>
            );
          })}
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="rounded-lg border border-white/10 bg-white/8 p-4 text-center">
            <p className="text-sm font-semibold">{profile.isPremium ? t('premiumActive') : isNativeApp ? t('premiumPlayStore') : 'Premium web'}</p>
            <p className="mt-2 text-xs text-slate-400">
              {isNativeApp
                ? 'Assinatura mensal de R$4,99 processada pela Google Play. Cancele quando quiser pela Play Store.'
                : 'Assinatura mensal de R$4,99 para a versão web. Após o pagamento, o Premium é liberado na sua conta Raddo.'}
            </p>
            {!profile.isPremium && isNativeApp && !PREMIUM_SIGNUP_AVAILABLE && (
              <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-50">
                Ainda não é possível assinar o Premium. A assinatura será liberada assim que a Google Play permitir ativar o produto mensal do Raddo.
              </div>
            )}
            {!profile.isPremium && canUseWebCheckout && (
              <div className="mt-4 grid gap-2">
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#ff3f68] px-4 text-sm font-semibold text-white"
                  onClick={openWebCheckout}
                  type="button"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Assinar R$4,99/mês
                </button>
                <p className="text-xs text-slate-400">O pagamento abre em uma nova aba. Use a mesma conta do Raddo.</p>
              </div>
            )}
            {!profile.isPremium && !isNativeApp && !canUseWebCheckout && (
              <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-50">
                Checkout web ainda não configurado.
              </div>
            )}
            {!profile.isPremium && isNativeApp && PREMIUM_SIGNUP_AVAILABLE && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950 disabled:cursor-wait disabled:opacity-60"
                  disabled={busy}
                  onClick={handleBuyPremium}
                  type="button"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Assinar R$4,99/mês
                </button>
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 px-4 text-sm font-semibold text-slate-100 disabled:cursor-wait disabled:opacity-60"
                  disabled={busy}
                  onClick={handleRestorePremium}
                  type="button"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Restaurar
                </button>
              </div>
            )}
            {message && <p className="mt-3 rounded-lg bg-white/8 p-3 text-xs text-slate-100">{message}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

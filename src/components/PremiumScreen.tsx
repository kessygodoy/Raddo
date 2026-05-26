import { BadgeCheck, Eye, Heart, MessageCircle, VideoOff } from 'lucide-react';
import { useI18n } from '../i18n';
import type { UserProfile } from '../types';

type Props = {
  profile: UserProfile;
};

const perks = [
  { icon: Heart, title: 'premiumPerkLikesTitle', text: 'premiumPerkLikesText' },
  { icon: VideoOff, title: 'premiumPerkAdsTitle', text: 'premiumPerkAdsText' },
  { icon: Eye, title: 'premiumPerkLikedByTitle', text: 'premiumPerkLikedByText' },
  { icon: MessageCircle, title: 'premiumPerkMapChatsTitle', text: 'premiumPerkMapChatsText' },
];

export default function PremiumScreen({ profile }: Props) {
  const { t } = useI18n();

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
            <p className="text-sm font-semibold">{profile.isPremium ? t('premiumActive') : t('premiumPlayStore')}</p>
            <p className="mt-2 text-xs text-slate-400">{t('premiumInfo')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

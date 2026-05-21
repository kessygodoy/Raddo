import { useState } from 'react';
import { Chrome, MapPin, Radar, ShieldCheck, Sparkles } from 'lucide-react';
import { getAuthRedirectUrl } from '../authCallback';
import { useI18n } from '../i18n';
import { supabase } from '../supabase';
import RaddoMark from './RaddoMark';

export default function AuthOverlay() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleLogin() {
    setBusy(true);
    setError('');

    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (googleError) {
      setError(googleError.message);
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_50%_12%,rgba(255,31,69,0.24),transparent_34%),radial-gradient(circle_at_80%_5%,rgba(29,78,216,0.22),transparent_28%),linear-gradient(155deg,#020409_0%,#09111f_54%,#111827_100%)] p-5 text-white">
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-white/8 to-transparent" />
      <section className="relative mx-auto grid min-h-[calc(100dvh-2.5rem)] w-full max-w-md content-center gap-5">
        <div className="grid justify-items-center text-center">
          <RaddoMark className="h-36 w-36 drop-shadow-[0_0_28px_rgba(255,23,68,0.35)]" showTile />
          <h1 className="mt-6 text-4xl font-semibold tracking-normal">Raddo</h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-300">
            Conheça pessoas por perto, combine interesses e entre em chats locais no mapa.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/8 p-3 text-center backdrop-blur">
            <Radar className="mx-auto h-5 w-5 text-[#ff6b81]" />
            <p className="mt-2 text-[11px] font-semibold text-slate-200">Radar</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/8 p-3 text-center backdrop-blur">
            <Sparkles className="mx-auto h-5 w-5 text-teal-300" />
            <p className="mt-2 text-[11px] font-semibold text-slate-200">Matches</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/8 p-3 text-center backdrop-blur">
            <MapPin className="mx-auto h-5 w-5 text-blue-300" />
            <p className="mt-2 text-[11px] font-semibold text-slate-200">Chats</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/10 shadow-2xl shadow-black/35 backdrop-blur">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-slate-950">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{t('authSubtitle')}</h2>
                <p className="text-xs text-slate-300">Seguro, rápido e com sua foto do Google.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white font-semibold text-slate-950"
            disabled={busy}
            onClick={handleGoogleLogin}
            type="button"
          >
            <Chrome className="h-5 w-5" />
            {t('googleLogin')}
          </button>

          <p className="text-center text-xs leading-5 text-slate-400">{t('authHelp')}</p>

          {error && <p className="rounded-lg bg-rose-400/15 p-3 text-sm text-rose-100">{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

import { useState } from 'react';
import { Chrome, Mail, MapPin, Radar, ShieldCheck, Sparkles } from 'lucide-react';
import { getAuthRedirectUrl } from '../authCallback';
import { useI18n } from '../i18n';
import { supabase } from '../supabase';
import type { ResolvedAppTheme } from '../types';
import RaddoMark from './RaddoMark';

type Props = {
  theme: ResolvedAppTheme;
};

export default function AuthOverlay({ theme }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

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

  async function handleEmailLogin() {
    setBusy(true);
    setError('');
    setEmailMessage('');

    const { error: emailError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (emailError) setError(emailError.message);
    setBusy(false);
  }

  async function handleEmailSignup() {
    setBusy(true);
    setError('');
    setEmailMessage('');

    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    if (signupError) {
      setError(signupError.message);
    } else if (data.user?.identities?.length === 0) {
      setError(t('emailAlreadyRegistered'));
    } else if (data.session) {
      setEmailMessage(t('emailSignupReady'));
    } else {
      setEmailMessage(t('emailSignupConfirmationSent'));
    }
    setBusy(false);
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setError(t('emailRequired'));
      return;
    }

    setBusy(true);
    setError('');
    setEmailMessage('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthRedirectUrl(),
    });
    if (resetError) {
      setError(resetError.message);
    } else {
      setEmailMessage(t('passwordResetSent'));
    }
    setBusy(false);
  }

  return (
    <main className={`app-shell theme-${theme} relative min-h-dvh overflow-hidden p-5 text-white`}>
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-white/8 to-transparent" />
      <section className="relative mx-auto grid min-h-[calc(100dvh-2.5rem)] w-full max-w-md content-center gap-5">
        <div className="grid justify-items-center text-center">
          <RaddoMark className="h-[min(20.25rem,72vw)] w-[min(20.25rem,72vw)] drop-shadow-[0_0_28px_rgba(255,23,68,0.35)]" showTile />
          <h1 className="mt-1 text-4xl font-semibold tracking-normal">Raddo</h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-300">
            {t('authIntro')}
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
                <p className="text-xs text-slate-300">{t('authSecureLine')}</p>
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

            <div className="grid gap-3 rounded-lg border border-white/10 bg-slate-950/35 p-3">
              <label className="grid gap-1 text-xs font-semibold text-slate-300">
                {t('email')}
                <input
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('emailPlaceholder')}
                  type="email"
                  value={email}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-300">
                {t('password')}
                <input
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none"
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  type="password"
                  value={password}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950"
                  disabled={busy || !email.trim() || password.length < 6}
                  onClick={handleEmailLogin}
                  type="button"
                >
                  <Mail className="h-4 w-4" />
                  {t('emailLogin')}
                </button>
                <button
                  className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                  disabled={busy || !email.trim() || password.length < 6}
                  onClick={handleEmailSignup}
                  type="button"
                >
                  {t('emailSignup')}
                </button>
              </div>
              <button
                className="text-left text-xs font-semibold text-teal-200"
                disabled={busy}
                onClick={handlePasswordReset}
                type="button"
              >
                {t('forgotPassword')}
              </button>
            </div>

            <p className="text-center text-xs leading-5 text-slate-400">{t('authHelp')}</p>

            {emailMessage && <p className="rounded-lg bg-teal-300/15 p-3 text-sm text-teal-100">{emailMessage}</p>}
            {error && <p className="rounded-lg bg-rose-400/15 p-3 text-sm text-rose-100">{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

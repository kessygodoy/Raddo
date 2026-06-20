import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export const nativeAuthRedirectUrl = 'com.raddo.app://auth/callback';

let authCallbackInFlight = '';
const completedAuthCallbacks = new Set<string>();

export function getAuthRedirectUrl() {
  return Capacitor.isNativePlatform() ? nativeAuthRedirectUrl : window.location.origin;
}

export async function processAuthUrl(url: string) {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const authType = parsed.searchParams.get('type') ?? hashParams.get('type');
  const accessToken = hashParams.get('access_token') ?? parsed.searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
  const tokenHash = parsed.searchParams.get('token_hash') ?? hashParams.get('token_hash');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return { isRecovery: authType === 'recovery' };
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return { isRecovery: authType === 'recovery' };
  }

  if (tokenHash && authType === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (error) throw error;
    return { isRecovery: true };
  }

  return { isRecovery: authType === 'recovery' };
}

export function registerAuthCallbackHandler() {
  if (!Capacitor.isNativePlatform()) return;

  async function handleAuthCallback(url: string) {
    if (!url.startsWith(nativeAuthRedirectUrl)) return;
    if (completedAuthCallbacks.has(url) || authCallbackInFlight === url) return;

    authCallbackInFlight = url;
    await Browser.close().catch(() => undefined);

    try {
      const result = await processAuthUrl(url);
      completedAuthCallbacks.add(url);
      if (result.isRecovery) {
        window.localStorage.setItem('raddo:password-recovery-url', url);
        window.dispatchEvent(new CustomEvent('raddo:password-recovery', { detail: { url } }));
      }
      window.dispatchEvent(new CustomEvent('raddo:auth-callback-complete'));
    } catch (error) {
      console.error('Supabase auth callback failed', error);
      window.dispatchEvent(
        new CustomEvent('raddo:auth-callback-error', {
          detail: { message: error instanceof Error ? error.message : '' },
        }),
      );
    } finally {
      authCallbackInFlight = '';
    }
  }

  CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    void handleAuthCallback(url);
  });

  void CapacitorApp.getLaunchUrl().then((launch) => {
    if (launch?.url) void handleAuthCallback(launch.url);
  });
}

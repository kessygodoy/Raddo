import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export const nativeAuthRedirectUrl = 'com.raddo.app://auth/callback';

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
    await supabase.auth.exchangeCodeForSession(code);
    return { isRecovery: authType === 'recovery' };
  }

  if (accessToken && refreshToken) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
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

  CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(nativeAuthRedirectUrl)) return;

    try {
      const result = await processAuthUrl(url);
      if (result.isRecovery) {
        window.localStorage.setItem('raddo:password-recovery-url', url);
        window.dispatchEvent(new CustomEvent('raddo:password-recovery', { detail: { url } }));
      }
    } catch (error) {
      console.error('Supabase auth callback failed', error);
    }
  });
}

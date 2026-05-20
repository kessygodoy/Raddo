import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export const nativeAuthRedirectUrl = 'com.raddo.app://auth/callback';

export function getAuthRedirectUrl() {
  return Capacitor.isNativePlatform() ? nativeAuthRedirectUrl : window.location.origin;
}

async function handleAuthUrl(url: string) {
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const accessToken = hashParams.get('access_token') ?? parsed.searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') ?? parsed.searchParams.get('refresh_token');

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return;
  }

  if (accessToken && refreshToken) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }
}

export function registerAuthCallbackHandler() {
  if (!Capacitor.isNativePlatform()) return;

  CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(nativeAuthRedirectUrl)) return;

    try {
      await handleAuthUrl(url);
    } catch (error) {
      console.error('Supabase auth callback failed', error);
    }
  });
}

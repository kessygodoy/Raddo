import { createClient } from '@supabase/supabase-js';
import {
  clearRaddoAuthBlockingLocalCaches,
  clearRaddoDisposableLocalCaches,
  prepareLocalStorageForAuthCallback,
} from './localStorageMaintenance';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

prepareLocalStorageForAuthCallback();

const protectedLocalStorage = {
  getItem(key: string) {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch (firstError) {
      clearRaddoDisposableLocalCaches();
      try {
        window.localStorage.setItem(key, value);
      } catch (secondError) {
        clearRaddoAuthBlockingLocalCaches();
        try {
          window.localStorage.setItem(key, value);
        } catch {
          throw secondError;
        }
      }
    }
  },
  removeItem(key: string) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
  },
};

export const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseAnonKey || 'anon-key', {
  auth: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    storage: protectedLocalStorage,
  },
});

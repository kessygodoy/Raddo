import { isDemoMode } from './demoData';
import { supabase } from './supabase';

export async function deleteMyAccount() {
  if (isDemoMode) {
    window.localStorage.clear();
    return;
  }

  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

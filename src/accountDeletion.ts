import { isDemoMode } from './demoData';
import { supabase } from './supabase';

async function deleteOwnStorageFolder(uid: string) {
  const { data, error } = await supabase.storage.from('profile-photos').list(uid, {
    limit: 1000,
  });

  if (error) return;

  const paths = (data ?? [])
    .filter((item) => item.name && item.id)
    .map((item) => `${uid}/${item.name}`);

  if (paths.length > 0) {
    await supabase.storage.from('profile-photos').remove(paths);
  }
}

export async function deleteMyAccount() {
  if (isDemoMode) {
    window.localStorage.clear();
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.id) {
    await deleteOwnStorageFolder(userData.user.id);
  }

  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(error.message || 'Nao foi possivel excluir sua conta.');
  await supabase.auth.signOut();
}

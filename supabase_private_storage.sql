-- Torna o bucket de imagens privado.
-- Rode depois de publicar a versao do app que usa URLs assinadas.

update storage.buckets
set public = false
where id = 'profile-photos';

drop policy if exists "profile photos are public" on storage.objects;

drop policy if exists "authenticated users read profile photos" on storage.objects;
create policy "authenticated users read profile photos"
on storage.objects for select
to authenticated
using (bucket_id = 'profile-photos');

drop policy if exists "users delete own profile photos" on storage.objects;
create policy "users delete own profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage privado definitivo - parte 1/2.
-- Rode somente depois que a versao nova do app estiver publicada/instalada.

update storage.buckets
set public = false
where id = 'profile-photos';

drop policy if exists "profile photos are public" on storage.objects;
drop policy if exists "public read profile photos" on storage.objects;
drop policy if exists "anyone can read profile photos" on storage.objects;

drop policy if exists "authenticated users read profile photos" on storage.objects;
create policy "authenticated users read profile photos"
on storage.objects for select
to authenticated
using (bucket_id = 'profile-photos');

drop policy if exists "users upload own profile photos" on storage.objects;
create policy "users upload own profile photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users update own profile photos" on storage.objects;
create policy "users update own profile photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

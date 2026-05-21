grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.passes to authenticated;

drop policy if exists "users delete own likes" on public.likes;
create policy "users delete own likes"
on public.likes for delete
to authenticated
using (auth.uid() = from_uid);

drop policy if exists "users delete own passes" on public.passes;
create policy "users delete own passes"
on public.passes for delete
to authenticated
using (auth.uid() = from_uid);

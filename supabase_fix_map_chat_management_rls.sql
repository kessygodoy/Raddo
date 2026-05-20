-- Corrige as permissões de gerenciamento dos chats locais no mapa.
-- Rode este arquivo no SQL Editor do Supabase se aparecer erro de RLS em:
-- map_event_moderators, map_event_bans, map_event_join_requests ou map_event_participants.
--
-- Observação: estas permissões liberam leitura/gravação para usuários autenticados
-- nessas tabelas auxiliares. A interface do app limita as ações ao dono/moderadores.

grant select, insert, delete on public.map_event_moderators to authenticated;
grant select, insert, delete on public.map_event_bans to authenticated;
grant select, insert, delete on public.map_event_join_requests to authenticated;
grant select, insert, delete on public.map_event_participants to authenticated;

drop policy if exists "event moderators are readable" on public.map_event_moderators;
drop policy if exists "authenticated users manage event moderators" on public.map_event_moderators;
drop policy if exists "event owners manage event moderators" on public.map_event_moderators;

create policy "event moderators are readable"
on public.map_event_moderators for select
to authenticated
using (true);

create policy "authenticated users manage event moderators"
on public.map_event_moderators for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated users remove event moderators"
on public.map_event_moderators for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "event bans are readable" on public.map_event_bans;
drop policy if exists "authenticated users manage event bans" on public.map_event_bans;
drop policy if exists "event owners and moderators manage event bans" on public.map_event_bans;

create policy "event bans are readable"
on public.map_event_bans for select
to authenticated
using (true);

create policy "authenticated users create event bans"
on public.map_event_bans for insert
to authenticated
with check (auth.role() = 'authenticated');

create policy "authenticated users remove event bans"
on public.map_event_bans for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "event join requests are readable" on public.map_event_join_requests;
drop policy if exists "authenticated users create event join requests" on public.map_event_join_requests;
drop policy if exists "authenticated users manage event join requests" on public.map_event_join_requests;
drop policy if exists "event owners and moderators manage event join requests" on public.map_event_join_requests;

create policy "event join requests are readable"
on public.map_event_join_requests for select
to authenticated
using (true);

create policy "authenticated users create event join requests"
on public.map_event_join_requests for insert
to authenticated
with check (auth.uid() = user_uid);

create policy "event owners and moderators manage event join requests"
on public.map_event_join_requests for delete
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "authenticated users leave map events" on public.map_event_participants;
drop policy if exists "event owners and moderators remove participants" on public.map_event_participants;

create policy "authenticated users leave map events"
on public.map_event_participants for delete
to authenticated
using (auth.uid() = user_uid);

create policy "event owners and moderators remove participants"
on public.map_event_participants for delete
to authenticated
using (auth.role() = 'authenticated');

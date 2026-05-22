create or replace function public.register_device_push_token(token_value text, platform_value text default 'android')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.device_push_tokens (user_uid, token, platform, updated_at)
  values (auth.uid(), token_value, coalesce(platform_value, 'android'), now())
  on conflict (token) do update
    set user_uid = excluded.user_uid,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

grant execute on function public.register_device_push_token(text, text) to authenticated;

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

  delete from public.device_push_tokens
  where token = token_value
     or user_uid = auth.uid();

  insert into public.device_push_tokens (user_uid, token, platform, updated_at)
  values (auth.uid(), token_value, coalesce(platform_value, 'android'), now());
end;
$$;

grant execute on function public.register_device_push_token(text, text) to authenticated;

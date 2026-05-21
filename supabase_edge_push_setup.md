# Raddo - Setup de Edge Function para Push

## 1. Rodar SQL no Supabase

Abra o SQL Editor do Supabase e rode:

```sql
create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_uid uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

alter table public.device_push_tokens enable row level security;

drop policy if exists "users read own push tokens" on public.device_push_tokens;
create policy "users read own push tokens"
  on public.device_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_uid);

drop policy if exists "users insert own push tokens" on public.device_push_tokens;
create policy "users insert own push tokens"
  on public.device_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_uid);

drop policy if exists "users update own push tokens" on public.device_push_tokens;
create policy "users update own push tokens"
  on public.device_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_uid)
  with check (auth.uid() = user_uid);

drop policy if exists "users delete own push tokens" on public.device_push_tokens;
create policy "users delete own push tokens"
  on public.device_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_uid);
```

## 2. Baixar `google-services.json`

No Firebase Console:

1. Project settings.
2. Your apps.
3. Android app com pacote `com.raddo.app`.
4. Baixe `google-services.json`.
5. Coloque o arquivo em:

```txt
C:\Codex\Raddo\android\app\google-services.json
```

## 3. Criar chave de service account do Firebase

No Google Cloud/Firebase:

1. Project settings.
2. Service accounts.
3. Generate new private key.
4. Guarde o JSON baixado.

Você vai usar:

```txt
project_id
client_email
private_key
```

## 4. Login no Supabase CLI

```bash
npx supabase login
```

## 5. Linkar o projeto

```bash
npx supabase link --project-ref zsmfrfiemthftuiyursr
```

## 6. Configurar secrets

Troque os valores pelos dados do JSON de service account.

```bash
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="SUA_SERVICE_ROLE_KEY_DO_SUPABASE"
npx supabase secrets set FCM_PROJECT_ID="project_id_do_firebase"
npx supabase secrets set FCM_CLIENT_EMAIL="client_email_do_firebase"
npx supabase secrets set FCM_PRIVATE_KEY="private_key_do_firebase"
```

## 7. Fazer deploy da função

```bash
npx supabase functions deploy send-map-event-push --project-ref zsmfrfiemthftuiyursr
```

## 8. Gerar APK depois de colocar `google-services.json`

```bash
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

APK:

```txt
C:\Codex\Raddo\android\app\build\outputs\apk\debug\app-debug.apk
```

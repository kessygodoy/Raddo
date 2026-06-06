# Checklist de segurança para publicar o Raddo Web

## Antes de abrir o link publicamente

1. Rode os SQLs nesta ordem:
   - `supabase_web_hardening_part1.sql`
   - `supabase_web_hardening_part2.sql`
   - `supabase_web_hardening_part3.sql`
   - `supabase_fix_app_bans_rpc.sql`
   - `supabase_smart_features_part1.sql`
   - `supabase_smart_features_part2.sql`

2. No Supabase Auth, configure:
   - Site URL: `https://SEU-DOMINIO`
   - Redirect URLs:
     - `https://SEU-DOMINIO`
     - `https://SEU-DOMINIO/*`
     - `http://localhost:5173/*` somente para teste local

3. No Google OAuth, adicione o redirect do Supabase:
   - `https://SEU-PROJETO.supabase.co/auth/v1/callback`

4. No hosting web, confirme que os headers foram publicados:
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Content-Security-Policy`

5. Nunca coloque no frontend:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FCM_PRIVATE_KEY`
   - `GOOGLE_PLAY_PRIVATE_KEY`
   - qualquer chave privada JSON do Google

6. No Supabase Storage:
   - bucket `profile-photos` deve estar privado
   - imagens devem carregar por URL assinada

7. Teste com uma conta comum:
   - não consegue abrir painel de moderação
   - não consegue ler `push_delivery_logs`
   - não consegue ler `app_bans` de outras pessoas
   - não consegue banir/desbanir
   - não consegue ver mensagens de chats/matches onde não participa

8. Teste com admin/mod:
   - consegue abrir painel de moderação
   - consegue ler denúncias
   - consegue banir/desbanir via modal

## Observação

Publicar web aumenta exposição porque qualquer pessoa pode inspecionar o código do frontend. A segurança real precisa estar no Supabase RLS, nas Edge Functions e nos headers do hosting.

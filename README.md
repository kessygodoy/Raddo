# Raddo

Aplicativo mobile-first para descoberta social por localizacao, com privacidade configuravel entre posicao exata e posicao aproximada.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Motion
- Supabase Auth por e-mail + Postgres + Realtime
- Capacitor Android
- Leaflet com tiles abertos da Carto/OpenStreetMap
- Lucide React

## Configuracao

1. Instale dependencias:

```bash
npm install
```

2. Crie um projeto no Supabase.

3. No Supabase SQL Editor, rode o arquivo:

```text
supabase.sql
```

4. Copie `.env.example` para `.env` e preencha:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

5. No Supabase, configure Auth:

- Authentication > Providers > Email: habilitado.
- Authentication > URL Configuration > Site URL:
  - `http://localhost:5173`
- Authentication > URL Configuration > Redirect URLs:
  - `http://localhost:5173/*`
  - `http://127.0.0.1:5173/*`
  - `https://localhost/*`
  - `com.radarmatch.app://auth/callback`

6. Rode o app:

```bash
npm run dev
```

## Scripts

- `npm run dev`: servidor local Vite.
- `npm run build`: valida TypeScript e gera `dist`.
- `npm run preview`: previa do build.
- `npm run android:sync`: gera build e sincroniza Capacitor.
- `npm run android:debug-apk`: gera o APK debug, cria `raddo-VERSAO.apk` e `version.json` na pasta do APK.
- `npm run android:open`: abre o projeto Android.

## Atualizacao por APK fora da Play Store

O app consulta `VITE_APP_UPDATE_URL` para saber se existe uma versao nova. Esse arquivo precisa estar online, fora do APK instalado.

Sugestao no Supabase Storage:

1. Crie um bucket publico chamado `raddo-updates`.
2. Envie o APK novo com nome versionado, por exemplo `raddo-1.0.2.apk`.
3. Envie um `version.json` publico no mesmo bucket, usando o modelo em `store-assets/update-version.example.json`.
4. Aumente tambem `VITE_APP_VERSION`, `versionName` e `versionCode` antes de gerar o proximo APK.
5. Para gerar o APK junto do manifest de update, rode `npm run android:debug-apk`.

Exemplo de manifest remoto:

```json
{
  "version": "1.0.2",
  "message": "Nova versao do Raddo disponivel. Atualize para receber melhorias e correcoes.",
  "apkUrl": "https://zsmfrfiemthftuiyursr.supabase.co/storage/v1/object/public/raddo-updates/raddo-1.0.2.apk"
}
```

Observacao: esse fluxo serve para APK instalado fora da Play Store. Para distribuicao pela Play Store, use o mecanismo oficial de atualizacao da Google Play.

## Tabelas

O schema em `supabase.sql` cria:

- `profiles`
- `likes`
- `matches`
- `messages`

As tabelas usam Row Level Security para permitir leitura/escrita apenas para usuarios autenticados e membros dos matches.

## Privacidade de localizacao

O perfil aceita `privacy_mode` com:

- `exact`: usa a coordenada real.
- `nearby`: mostra uma coordenada deslocada de forma deterministica dentro do raio configurado.

Para producao, a logica de aproximacao deve ser movida para Edge Functions/RPC no Supabase para impedir que a coordenada real seja entregue ao cliente de outros usuarios.

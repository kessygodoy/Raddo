# Raddo

Aplicativo mobile-first para descoberta social por localizacao, com privacidade configuravel entre posicao exata e posicao aproximada.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Motion
- Supabase Auth por e-mail + Postgres + Realtime
- Capacitor Android
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
VITE_GOOGLE_MAPS_API_KEY=
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
- `npm run android:open`: abre o projeto Android.

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

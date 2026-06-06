# Premium web fora da Play Store

Use esta opcao apenas na versao web. No app Android publicado pela Play Store, mantenha a assinatura pela Google Play Billing.

## Como configurar

1. Crie um checkout externo de R$4,99 mensal no provedor escolhido.
   Exemplos: Stripe, Mercado Pago, Kiwify, Hotmart ou outro gateway.

2. Configure no ambiente web:

```env
VITE_WEB_PREMIUM_CHECKOUT_URL=https://seu-checkout.com/raddo-premium
```

3. O Raddo abre esse link adicionando:

```text
uid=UID_DO_USUARIO
plan=raddo_premium_monthly
```

4. Depois do pagamento, seu provedor precisa avisar o Supabase por webhook ou voce pode ativar manualmente no painel/admin.

## Liberacao manual enquanto nao ha webhook

Atualize o usuario no Supabase:

```sql
update public.profiles
set
  is_premium = true,
  premium_until = now() + interval '30 days'
where id = 'UID_DO_USUARIO';
```

## Proxima etapa recomendada

Criar uma Edge Function `activate-web-premium` para receber webhook do gateway e ativar o Premium automaticamente.

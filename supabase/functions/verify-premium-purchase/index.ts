import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.3';

type VerifyPremiumRequest = {
  action?: 'status' | 'verify';
  packageName?: string;
  productId?: string;
  purchaseToken?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};

const ACTIVE_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

function base64Url(input: ArrayBuffer | string) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string) {
  const clean = pem
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function createGoogleAccessToken() {
  const clientEmail = Deno.env.get('GOOGLE_PLAY_CLIENT_EMAIL');
  const privateKey = Deno.env.get('GOOGLE_PLAY_PRIVATE_KEY');
  if (!clientEmail || !privateKey) throw new Error('Missing GOOGLE_PLAY_CLIENT_EMAIL or GOOGLE_PLAY_PRIVATE_KEY');

  const now = Math.floor(Date.now() / 1000);
  const unsignedJwt = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(
    JSON.stringify({
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
    }),
  )}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedJwt));
  const assertion = `${unsignedJwt}.${base64Url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    body: new URLSearchParams({
      assertion,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google Play auth failed');
  }

  return data.access_token as string;
}

async function getGoogleSubscription(input: { accessToken: string; packageName: string; purchaseToken: string }) {
  const url = new URL(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      input.packageName,
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`,
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Não consegui validar a assinatura na Google Play.');
  }

  return data;
}

async function acknowledgeSubscription(input: { accessToken: string; packageName: string; productId: string; purchaseToken: string }) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    input.packageName,
  )}/purchases/subscriptions/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}:acknowledge`;

  await fetch(url, {
    body: JSON.stringify({ developerPayload: 'raddo-premium' }),
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}

function latestExpiry(subscription: Record<string, unknown>) {
  const lineItems = Array.isArray(subscription.lineItems) ? subscription.lineItems as Array<Record<string, unknown>> : [];
  const expiries = lineItems
    .map((item) => (typeof item.expiryTime === 'string' ? Date.parse(item.expiryTime) : Number.NaN))
    .filter(Number.isFinite);
  if (expiries.length === 0) return null;
  return new Date(Math.max(...expiries)).toISOString();
}

async function expectedAccountId(uid: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const expectedPackageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') || 'com.raddo.app';
    const expectedProductId = Deno.env.get('GOOGLE_PLAY_PREMIUM_PRODUCT_ID') || 'raddo_premium_monthly';
    const googlePlayConfigured = Boolean(Deno.env.get('GOOGLE_PLAY_CLIENT_EMAIL') && Deno.env.get('GOOGLE_PLAY_PRIVATE_KEY'));

    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('Missing Supabase env vars');

    const authHeader = req.headers.get('Authorization') || '';
    const authedClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await authedClient.auth.getUser();

    if (userError || !userData.user) return jsonResponse({ error: 'Não autenticado.' }, 401);

    const body = await req.json() as VerifyPremiumRequest;
    if (body.action === 'status') return jsonResponse({ configured: googlePlayConfigured, ok: true });
    if (!googlePlayConfigured) return jsonResponse({ error: 'A validação da Google Play ainda não foi configurada.' }, 503);
    const packageName = body.packageName || expectedPackageName;
    const productId = body.productId || expectedProductId;
    const purchaseToken = body.purchaseToken?.trim();

    if (!purchaseToken) return jsonResponse({ error: 'Token da assinatura não informado.' }, 400);
    if (packageName !== expectedPackageName) return jsonResponse({ error: 'Pacote Android inválido.' }, 400);
    if (productId !== expectedProductId) return jsonResponse({ error: 'Produto Premium inválido.' }, 400);

    const accessToken = await createGoogleAccessToken();
    const subscription = await getGoogleSubscription({ accessToken, packageName, purchaseToken });
    const lineItems = Array.isArray(subscription.lineItems) ? subscription.lineItems as Array<Record<string, unknown>> : [];
    if (!lineItems.some((item) => item.productId === expectedProductId)) {
      return jsonResponse({ error: 'A compra não corresponde ao Premium do Raddo.' }, 400);
    }
    const externalIdentifiers = subscription.externalAccountIdentifiers as Record<string, unknown> | undefined;
    const purchaseAccountId = typeof externalIdentifiers?.obfuscatedExternalAccountId === 'string'
      ? externalIdentifiers.obfuscatedExternalAccountId
      : '';
    if (purchaseAccountId && purchaseAccountId !== await expectedAccountId(userData.user.id)) {
      return jsonResponse({ error: 'Esta assinatura pertence a outra conta do Raddo.' }, 403);
    }

    const { data: existingPurchase } = await serviceClient
      .from('premium_subscriptions')
      .select('user_uid')
      .eq('purchase_token', purchaseToken)
      .maybeSingle();
    if (existingPurchase?.user_uid && existingPurchase.user_uid !== userData.user.id) {
      return jsonResponse({ error: 'Esta assinatura já está vinculada a outra conta do Raddo.' }, 409);
    }

    const subscriptionState = typeof subscription.subscriptionState === 'string' ? subscription.subscriptionState : 'UNKNOWN';
    const expiresAt = latestExpiry(subscription);
    const isPremium = ACTIVE_STATES.has(subscriptionState) && (!expiresAt || Date.parse(expiresAt) > Date.now());
    const orderId = typeof subscription.latestOrderId === 'string' ? subscription.latestOrderId : null;

    await serviceClient.from('premium_subscriptions').upsert(
      {
        expires_at: expiresAt,
        order_id: orderId,
        package_name: packageName,
        product_id: productId,
        purchase_token: purchaseToken,
        raw_response: subscription,
        subscription_state: subscriptionState,
        updated_at: new Date().toISOString(),
        user_uid: userData.user.id,
      },
      { onConflict: 'purchase_token' },
    );

    if (isPremium) {
      await acknowledgeSubscription({ accessToken, packageName, productId, purchaseToken });
    }

    await serviceClient
      .from('profiles')
      .update({
        is_premium: isPremium,
        premium_until: expiresAt,
      })
      .eq('id', userData.user.id);

    return jsonResponse({ expiresAt, isPremium, ok: true, subscriptionState });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Não consegui validar o Premium.' }, 500);
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.3';

type ModerateImageRequest = {
  bucket?: string;
  context?: string;
  contextId?: string;
  imageUrl?: string;
  path?: string;
};

type SafeSearchAnnotation = {
  adult?: string;
  medical?: string;
  racy?: string;
  spoof?: string;
  violence?: string;
};

type RecentMessage = {
  createdAt?: string;
  id?: string;
  imageUrl?: string;
  messageType?: string;
  senderName?: string;
  senderUid?: string;
  text?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};

const likelihoodRank: Record<string, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
};

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

function arrayBufferToBase64(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
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
  const clientEmail = Deno.env.get('GOOGLE_VISION_CLIENT_EMAIL') || Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKey = Deno.env.get('GOOGLE_VISION_PRIVATE_KEY') || Deno.env.get('FCM_PRIVATE_KEY');
  if (!clientEmail || !privateKey) throw new Error('Missing Google service account credentials');

  const now = Math.floor(Date.now() / 1000);
  const unsignedJwt = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(
    JSON.stringify({
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
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

  if (!response.ok) throw new Error(`Google OAuth failed: ${await response.text()}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google OAuth did not return an access token');
  return data.access_token;
}

function blockedReasons(safeSearch: SafeSearchAnnotation, context = 'image') {
  const blocks: string[] = [];
  const adult = likelihoodRank[safeSearch.adult ?? 'UNKNOWN'] ?? 0;
  const racy = likelihoodRank[safeSearch.racy ?? 'UNKNOWN'] ?? 0;
  const violence = likelihoodRank[safeSearch.violence ?? 'UNKNOWN'] ?? 0;
  if (adult >= likelihoodRank.LIKELY) blocks.push('conteúdo adulto');
  if (adult >= likelihoodRank.POSSIBLE && racy >= likelihoodRank.VERY_LIKELY) blocks.push('conteúdo sexualizado');
  if (violence >= likelihoodRank.VERY_LIKELY) blocks.push('violência explícita');

  return blocks;
}

async function createImageModerationReport(
  admin: ReturnType<typeof createClient>,
  values: {
    bucket: string;
    context: string;
    ownerDisplayName: string;
    ownerEmail: string;
    ownerUid: string;
    publicUrl: string;
    reasons: string[];
    recentMessages: RecentMessage[];
    safeSearch: SafeSearchAnnotation;
    storagePath: string;
    status: string;
  },
) {
  const payload = {
    bucket: values.bucket,
    context: values.context,
    owner_display_name: values.ownerDisplayName,
    owner_email: values.ownerEmail,
    owner_uid: values.ownerUid,
    public_url: values.publicUrl,
    reasons: values.reasons,
    recent_messages: values.recentMessages,
    safe_search: values.safeSearch,
    status: values.status,
    storage_path: values.storagePath,
  };

  const { error } = await admin.from('image_moderation_reports').insert(payload);
  if (!error) return { created: true, error: '' };

  const fallbackPayload = {
    bucket: values.bucket,
    context: values.context,
    owner_uid: values.ownerUid,
    public_url: values.publicUrl,
    reasons: values.reasons,
    recent_messages: values.recentMessages,
    safe_search: values.safeSearch,
    storage_path: values.storagePath,
  };
  const { error: fallbackError } = await admin.from('image_moderation_reports').insert(fallbackPayload);

  if (!fallbackError) return { created: true, error: '' };
  const legacyPayload = {
    bucket: values.bucket,
    context: values.context,
    owner_uid: values.ownerUid,
    public_url: values.publicUrl,
    reasons: values.reasons,
    safe_search: values.safeSearch,
    storage_path: values.storagePath,
  };
  const { error: legacyError } = await admin.from('image_moderation_reports').insert(legacyPayload);

  if (!legacyError) return { created: true, error: '' };
  console.warn('Could not create image moderation report', error.message, fallbackError.message, legacyError.message);
  return { created: false, error: legacyError.message || fallbackError.message || error.message };
}

async function loadRecentMessagesForImage(
  admin: ReturnType<typeof createClient>,
  values: { context?: string; contextId?: string; ownerUid: string },
) {
  const fromMatchMessages = async () => {
    let query = admin
      .from('messages')
      .select('id,sender_uid,text,message_type,image_url,created_at')
      .eq('sender_uid', values.ownerUid)
      .order('created_at', { ascending: false })
      .limit(5);
    if (values.contextId) query = query.eq('match_id', values.contextId);
    const { data } = await query;
    return (data ?? []).map((message) => ({
      id: message.id,
      createdAt: message.created_at,
      imageUrl: message.image_url,
      messageType: message.message_type,
      senderUid: message.sender_uid,
      text: message.text,
    }));
  };

  const fromMapEventMessages = async () => {
    let query = admin
      .from('map_event_messages')
      .select('id,sender_uid,sender_name,text,message_type,image_url,created_at')
      .eq('sender_uid', values.ownerUid)
      .order('created_at', { ascending: false })
      .limit(5);
    if (values.contextId) query = query.eq('event_id', values.contextId);
    const { data } = await query;
    return (data ?? []).map((message) => ({
      id: message.id,
      createdAt: message.created_at,
      imageUrl: message.image_url,
      messageType: message.message_type,
      senderName: message.sender_name,
      senderUid: message.sender_uid,
      text: message.text,
    }));
  };

  if (values.context === 'match-chat-image') return fromMatchMessages();
  if (values.context === 'map-chat-image') return fromMapEventMessages();

  const [matchMessages, mapMessages] = await Promise.all([fromMatchMessages(), fromMapEventMessages()]);
  return [...matchMessages, ...mapMessages]
    .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''))
    .slice(0, 5);
}

async function validateImageContext(
  admin: ReturnType<typeof createClient>,
  values: { context?: string; contextId?: string; ownerUid: string },
) {
  if (!values.contextId) return true;

  if (values.context === 'match-chat-image') {
    const { data, error } = await admin
      .from('matches')
      .select('users')
      .eq('id', values.contextId)
      .maybeSingle<{ users: string[] }>();
    if (error || !data) return false;
    return data.users.includes(values.ownerUid);
  }

  if (values.context === 'map-chat-image') {
    const { data, error } = await admin
      .from('map_event_participants')
      .select('user_uid')
      .eq('event_id', values.contextId)
      .eq('user_uid', values.ownerUid)
      .maybeSingle<{ user_uid: string }>();
    return !error && Boolean(data);
  }

  return true;
}

async function loadImageContentForVision(
  admin: ReturnType<typeof createClient>,
  values: { bucket: string; path: string },
) {
  const { data, error } = await admin.storage.from(values.bucket).download(values.path);
  if (error || !data) throw new Error(`Could not download image for moderation: ${error?.message ?? 'empty response'}`);
  return arrayBufferToBase64(await data.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('Missing Supabase environment variables');

    const authorization = req.headers.get('Authorization') ?? '';
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: 'Not authenticated' }, 401);
    const userMetadata = userData.user.user_metadata as Record<string, unknown> | null;
    const ownerDisplayName =
      (typeof userMetadata?.full_name === 'string' && userMetadata.full_name) ||
      (typeof userMetadata?.name === 'string' && userMetadata.name) ||
      '';

    const body = await req.json() as ModerateImageRequest;
    const bucket = body.bucket || 'profile-photos';
    if (bucket !== 'profile-photos') return jsonResponse({ error: 'Invalid bucket' }, 400);
    if (!body.path || !body.path.startsWith(`${userData.user.id}/`)) return jsonResponse({ error: 'Invalid image path' }, 403);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const validContext = await validateImageContext(admin, {
      context: body.context,
      contextId: body.contextId,
      ownerUid: userData.user.id,
    });
    if (!validContext) return jsonResponse({ error: 'Invalid image context' }, 403);

    const imageUrl = body.imageUrl || admin.storage.from(bucket).getPublicUrl(body.path).data.publicUrl;
    const imageContent = await loadImageContentForVision(admin, { bucket, path: body.path });
    const recentMessages = await loadRecentMessagesForImage(admin, {
      context: body.context,
      contextId: body.contextId,
      ownerUid: userData.user.id,
    });
    const accessToken = await createGoogleAccessToken();

    const visionResponse = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      body: JSON.stringify({
        requests: [
          {
            features: [{ type: 'SAFE_SEARCH_DETECTION' }],
            image: { content: imageContent },
          },
        ],
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!visionResponse.ok) {
      await createImageModerationReport(admin, {
        bucket,
        context: body.context ?? 'image',
        ownerUid: userData.user.id,
        ownerEmail: userData.user.email ?? '',
        ownerDisplayName,
        publicUrl: imageUrl,
        recentMessages,
        reasons: ['falha na verificação automática'],
        safeSearch: { error: await visionResponse.clone().text() } as SafeSearchAnnotation,
        status: 'pending_human_review',
        storagePath: body.path,
      });
      await admin.storage.from(bucket).remove([body.path]);
      return jsonResponse({ allowed: false, error: `Google Vision failed: ${await visionResponse.text()}` }, 502);
    }

    const visionData = await visionResponse.json() as {
      responses?: Array<{ error?: { message?: string }; safeSearchAnnotation?: SafeSearchAnnotation }>;
    };
    const response = visionData.responses?.[0];
    if (response?.error) {
      await createImageModerationReport(admin, {
        bucket,
        context: body.context ?? 'image',
        ownerUid: userData.user.id,
        ownerEmail: userData.user.email ?? '',
        ownerDisplayName,
        publicUrl: imageUrl,
        recentMessages,
        reasons: ['imagem rejeitada pelo Google Vision'],
        safeSearch: { error: response.error.message ?? 'Google Vision rejected the image' } as SafeSearchAnnotation,
        status: 'pending_human_review',
        storagePath: body.path,
      });
      await admin.storage.from(bucket).remove([body.path]);
      return jsonResponse({ allowed: false, error: response.error.message || 'Google Vision rejected the image' }, 502);
    }

    const safeSearch = response?.safeSearchAnnotation ?? {};
    const reasons = blockedReasons(safeSearch, body.context);
    const allowed = reasons.length === 0;
    let reportCreated = false;
    let reportError = '';
    if (!allowed) {
      const report = await createImageModerationReport(admin, {
        bucket,
        context: body.context ?? 'image',
        ownerUid: userData.user.id,
        ownerEmail: userData.user.email ?? '',
        ownerDisplayName,
        publicUrl: imageUrl,
        recentMessages,
        reasons,
        safeSearch,
        status: 'pending_human_review',
        storagePath: body.path,
      });
      reportCreated = report.created;
      reportError = report.error;
    }

    return jsonResponse({
      allowed,
      context: body.context ?? 'image',
      reportCreated,
      reportError,
      reasons,
      safeSearch,
    });
  } catch (error) {
    return jsonResponse({ allowed: false, error: error instanceof Error ? error.message : 'Image moderation failed' }, 500);
  }
});

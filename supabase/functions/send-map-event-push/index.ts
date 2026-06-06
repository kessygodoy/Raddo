import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.3';

type PushRequest = {
  eventId?: string;
  messageId?: string;
  senderName?: string;
  senderUid?: string;
  text?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
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
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FCM_PRIVATE_KEY');
  if (!clientEmail || !privateKey) throw new Error('Missing FCM_CLIENT_EMAIL or FCM_PRIVATE_KEY');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
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

async function writePushLog(
  admin: ReturnType<typeof createClient>,
  values: {
    detail?: string;
    failedCount?: number;
    kind: string;
    recipientCount?: number;
    senderUid?: string;
    sentCount?: number;
    status: string;
    tokenCount?: number;
  },
) {
  try {
    await admin.from('push_delivery_logs').insert({
      detail: values.detail ?? '',
      failed_count: values.failedCount ?? 0,
      kind: values.kind,
      recipient_count: values.recipientCount ?? 0,
      sender_uid: values.senderUid ?? null,
      sent_count: values.sentCount ?? 0,
      status: values.status,
      token_count: values.tokenCount ?? 0,
    });
  } catch (error) {
    console.warn('Could not write push log', error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const fcmProjectId = Deno.env.get('FCM_PROJECT_ID');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !fcmProjectId) {
    return jsonResponse({ error: 'Missing Supabase or FCM secrets' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await req.json() as PushRequest;
  if (!body.eventId || !body.senderUid || !body.text) return jsonResponse({ error: 'Invalid payload' }, 400);
  if (authData.user.id !== body.senderUid) return jsonResponse({ error: 'Sender mismatch' }, 403);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: eventData, error: eventError } = await admin
    .from('map_events')
    .select('id,title')
    .eq('id', body.eventId)
    .maybeSingle<{ id: string; title: string }>();
  if (eventError || !eventData) return jsonResponse({ error: 'Event not found' }, 404);

  const { data: senderParticipant, error: senderParticipantError } = await admin
    .from('map_event_participants')
    .select('user_uid')
    .eq('event_id', body.eventId)
    .eq('user_uid', body.senderUid)
    .maybeSingle<{ user_uid: string }>();
  if (senderParticipantError) return jsonResponse({ error: senderParticipantError.message }, 500);
  if (!senderParticipant) return jsonResponse({ error: 'Sender is not in event' }, 403);

  const { data: participantRows, error: participantError } = await admin
    .from('map_event_participants')
    .select('user_uid')
    .eq('event_id', body.eventId)
    .neq('user_uid', body.senderUid);
  if (participantError) return jsonResponse({ error: participantError.message }, 500);

  const recipientIds = [...new Set((participantRows ?? []).map((row) => row.user_uid as string))];
  if (recipientIds.length === 0) {
    await writePushLog(admin, { kind: 'map_event', senderUid: body.senderUid, status: 'no_recipients' });
    return jsonResponse({ sent: 0 });
  }

  const { data: preferenceRows, error: preferenceError } = await admin
    .from('notification_preferences')
    .select('user_uid,enabled,map_chats')
    .in('user_uid', recipientIds);
  if (preferenceError) return jsonResponse({ error: preferenceError.message }, 500);

  const preferencesByUid = new Map(
    (preferenceRows ?? []).map((row) => [
      row.user_uid as string,
      {
        enabled: row.enabled as boolean,
        mapChats: row.map_chats as boolean,
      },
    ]),
  );
  const allowedRecipientIds = recipientIds.filter((uid) => {
    const preferences = preferencesByUid.get(uid);
    return !preferences || (preferences.enabled && preferences.mapChats);
  });
  if (allowedRecipientIds.length === 0) {
    await writePushLog(admin, {
      kind: 'map_event',
      recipientCount: allowedRecipientIds.length,
      senderUid: body.senderUid,
      status: 'disabled_by_preferences',
    });
    return jsonResponse({ sent: 0 });
  }

  const { data: tokenRows, error: tokenError } = await admin
    .from('device_push_tokens')
    .select('token,user_uid')
    .in('user_uid', allowedRecipientIds)
    .neq('user_uid', body.senderUid);
  if (tokenError) return jsonResponse({ error: tokenError.message }, 500);

  const tokens = [
    ...new Set(
      (tokenRows ?? [])
        .filter((row) => (row.user_uid as string) !== body.senderUid)
        .map((row) => row.token as string)
        .filter(Boolean),
    ),
  ];
  if (tokens.length === 0) {
    await writePushLog(admin, {
      kind: 'map_event',
      recipientCount: recipientIds.length,
      senderUid: body.senderUid,
      status: 'no_tokens',
    });
    return jsonResponse({ sent: 0 });
  }

  const { data: senderProfile } = await admin
    .from('profiles')
    .select('display_name,photo_url')
    .eq('id', body.senderUid)
    .maybeSingle<{ display_name: string | null; photo_url: string | null }>();

  const accessToken = await createGoogleAccessToken();
  const sendUrl = `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`;
  const title = eventData.title || 'Chat local';
  const senderName = senderProfile?.display_name || body.senderName || 'Alguem';
  const senderPhotoUrl = senderProfile?.photo_url || '';
  const text = body.text.slice(0, 160);

  const results = await Promise.allSettled(
    tokens.map((token) =>
      fetch(sendUrl, {
        body: JSON.stringify({
          message: {
            android: {
              notification: {
                channel_id: 'raddo_push',
                image: senderPhotoUrl || undefined,
                sound: 'default',
              },
              priority: 'high',
            },
            data: {
              eventId: body.eventId ?? '',
              messageId: body.messageId ?? '',
              view: 'radar',
            },
            notification: {
              body: `${senderName}: ${text}`,
              image: senderPhotoUrl || undefined,
              title: `\u{1F4AC} ${title}`,
            },
            token,
          },
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }).then(async (response) => ({
        body: await response.text(),
        ok: response.ok,
        status: response.status,
      })),
    ),
  );

  const sent = results.filter((result) => result.status === 'fulfilled' && result.value.ok).length;
  const failed = results.length - sent;
  const detail = results
    .map((result) => {
      if (result.status === 'rejected') return `rejected:${String(result.reason)}`.slice(0, 500);
      return `${result.value.status}:${result.value.body}`.slice(0, 500);
    })
    .join('\n');

  await writePushLog(admin, {
    detail,
    failedCount: failed,
    kind: 'map_event',
    recipientCount: recipientIds.length,
    senderUid: body.senderUid,
    sentCount: sent,
    status: failed > 0 ? 'partial_or_failed' : 'sent',
    tokenCount: tokens.length,
  });

  return jsonResponse({ failed, sent });
});

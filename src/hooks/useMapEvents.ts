import { useEffect, useMemo, useState } from 'react';
import { demoMapEventMessages, demoMapEvents, isDemoMode } from '../demoData';
import { supabase } from '../supabase';
import type { LatLng, MapEvent, MapEventMessage, UserProfile } from '../types';
import { distanceKm } from '../utils/geo';

let demoEventsState = [...demoMapEvents];
let demoMessagesState = [...demoMapEventMessages];
let demoParticipantsState: Record<string, Set<string>> = {};
let demoParticipantJoinedAtState: Record<string, Record<string, string>> = {};
let demoModeratorsState: Record<string, Set<string>> = {};
let demoBansState: Record<string, Set<string>> = {};
let demoJoinRequestsState: Record<string, Set<string>> = {};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  emoji: string | null;
  access_mode: MapEvent['accessMode'] | null;
  password_hash: string | null;
  is_permanent: boolean | null;
  lat: number;
  lng: number;
  radius_km: number;
  creator_uid: string;
  created_at: string;
};

type EventMessageRow = {
  id: string;
  event_id: string;
  sender_uid: string;
  sender_name: string;
  text: string;
  message_type: 'image' | 'text' | null;
  image_url: string | null;
  image_path: string | null;
  view_once: boolean | null;
  viewed_by: string[] | null;
  created_at: string;
};

type ParticipantRow = {
  event_id: string;
  user_uid: string;
  joined_at: string;
};

type EventUserRow = {
  event_id: string;
  user_uid: string;
  created_at?: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  photo_url: string;
  photos: string[] | null;
  lat: number | null;
  lng: number | null;
  privacy_mode: UserProfile['privacyMode'];
  appear_in_cards: boolean | null;
  show_distance: boolean | null;
  show_online_status: boolean | null;
  visibility_radius: number;
  age: number | null;
  gender: UserProfile['gender'];
  gender_identities: UserProfile['genderIdentities'] | null;
  sexualities: UserProfile['sexualities'] | null;
  looking_for: UserProfile['lookingFor'] | null;
  interested_sexualities: UserProfile['interestedSexualities'] | null;
  interests: UserProfile['interests'] | null;
  relationship_goals: UserProfile['relationshipGoals'] | null;
  last_seen: string | null;
  bio: string | null;
  is_premium: boolean | null;
  likes_used_today: number | null;
  likes_quota_date: string | null;
  likes_bonus: number | null;
  liked_by_unlock_until: string | null;
};

function rowToEvent(row: EventRow): MapEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    coverURL: row.cover_url ?? '',
    emoji: row.emoji ?? 'ðŸ’¬',
    accessMode: row.access_mode ?? 'open',
    passwordHash: row.password_hash ?? '',
    isPermanent: Boolean(row.is_permanent),
    location: { lat: row.lat, lng: row.lng },
    radiusKm: row.radius_km,
    creatorUid: row.creator_uid,
    createdAt: row.created_at,
  };
}

export async function editMapEventMessage(message: MapEventMessage, viewerUid: string, nextText: string) {
  const cleanText = nextText.trim();
  if (isDemoMode || message.senderUid !== viewerUid || message.messageType !== 'text' || !cleanText) return;

  const { error } = await supabase
    .from('map_event_messages')
    .update({ text: cleanText })
    .eq('id', message.id)
    .eq('sender_uid', viewerUid);
  if (error) throw new Error(error.message || 'NÃ£o consegui editar a mensagem.');
}

export async function deleteMapEventMessage(message: MapEventMessage, viewerUid: string, canManage: boolean) {
  if (isDemoMode) return;
  if (message.senderUid !== viewerUid && !canManage) return;

  const rpcResult = await supabase.rpc('delete_map_event_message', {
    target_message_id: message.id,
  });

  if (!rpcResult.error) return;

  const missingFunction =
    rpcResult.error.code === 'PGRST202' || rpcResult.error.message.toLowerCase().includes('delete_map_event_message');
  if (!missingFunction) throw new Error(rpcResult.error.message || 'Nao consegui excluir a mensagem.');

  const query = supabase.from('map_event_messages').delete().eq('id', message.id);
  const { error } = canManage ? await query : await query.eq('sender_uid', viewerUid);
  if (error) throw new Error(error.message || 'NÃ£o consegui excluir a mensagem.');
}

async function rowsToProfiles(rows: EventUserRow[], me: UserProfile) {
  const ids = [...new Set(rows.map((row) => row.user_uid))];
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
  const byUid = new Map(((profiles ?? []) as ProfileRow[]).map((row) => [row.id, rowToProfile(row)]));
  byUid.set(me.uid, me);
  return ids.map((uid) => byUid.get(uid) ?? { ...me, uid, displayName: `Pessoa ${uid.slice(-4)}` });
}

export async function hashMapEventPassword(password: string) {
  const clean = password.trim();
  if (!clean) return '';
  const data = new TextEncoder().encode(clean);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function rowToMessage(row: EventMessageRow): MapEventMessage {
  return {
    id: row.id,
    eventId: row.event_id,
    senderUid: row.sender_uid,
    senderName: row.sender_name,
    text: row.text,
    messageType: row.message_type ?? 'text',
    imageURL: row.image_url ?? '',
    imagePath: row.image_path ?? '',
    viewOnce: Boolean(row.view_once),
    viewedBy: row.viewed_by ?? [],
    createdAt: row.created_at,
  };
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    uid: row.id,
    displayName: row.display_name,
    photoURL: row.photo_url,
    photos: row.photos ?? [row.photo_url],
    location: typeof row.lat === 'number' && typeof row.lng === 'number' ? { lat: row.lat, lng: row.lng } : null,
    privacyMode: row.privacy_mode,
    appearInCards: row.appear_in_cards ?? true,
    showDistance: row.show_distance ?? true,
    showOnlineStatus: row.show_online_status ?? true,
    visibilityRadius: row.visibility_radius,
    age: row.age ?? 18,
    gender: row.gender,
    genderIdentities: row.gender_identities ?? [row.gender],
    sexualities: row.sexualities ?? [],
    lookingFor: row.looking_for ?? [],
    interestedSexualities: row.interested_sexualities ?? [],
    interests: row.interests ?? [],
    relationshipGoals: row.relationship_goals ?? [],
    lastSeen: row.last_seen,
    bio: row.bio ?? '',
    isPremium: Boolean(row.is_premium),
    likesUsedToday: row.likes_used_today ?? 0,
    likesQuotaDate: row.likes_quota_date,
    likesBonus: row.likes_bonus ?? 0,
    likedByUnlockUntil: row.liked_by_unlock_until,
  };
}

function schemaCacheMessage(tableName: string) {
  return `A tabela ${tableName} ainda nÃ£o existe no Supabase. Rode novamente o arquivo supabase_create_map_events_first.sql no SQL Editor.`;
}

function isMissingTableError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  return error.code === '42P01' || message.includes('schema cache') || message.includes('could not find the table');
}

export function useMapEvents(me: UserProfile | null) {
  const [events, setEvents] = useState<MapEvent[]>([]);

  useEffect(() => {
    if (!me) return undefined;

    if (isDemoMode) {
      setEvents(demoEventsState);
      return undefined;
    }

    let active = true;

    async function loadEvents() {
      const { data } = await supabase.from('map_events').select('*').order('created_at', { ascending: false });
      if (active) setEvents(((data ?? []) as EventRow[]).map(rowToEvent));
    }

    loadEvents();

    const channel = supabase
      .channel('map-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_events' }, loadEvents)
      .subscribe();
    const refreshTimer = window.setInterval(loadEvents, 5000);
    const handleFocus = () => loadEvents();
    const handleVisibilityChange = () => {
      if (!document.hidden) loadEvents();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [me]);

  return useMemo(() => {
    if (!me?.location) return events;
    return events.filter((event) => distanceKm(me.location!, event.location) <= Math.max(event.radiusKm, 500));
  }, [events, me]);
}

export function useMapEventCreatorNames(events: MapEvent[], me: UserProfile) {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (events.length === 0) {
      setNames({});
      return undefined;
    }

    const creatorIds = [...new Set(events.map((event) => event.creatorUid))];

    if (isDemoMode) {
      setNames(
        Object.fromEntries(
          creatorIds.map((uid) => [uid, uid === me.uid ? me.displayName : `Pessoa ${uid.slice(-4)}`]),
        ),
      );
      return undefined;
    }

    let active = true;

    async function loadCreatorNames() {
      const { data } = await supabase.from('profiles').select('id,display_name').in('id', creatorIds);
      const nextNames: Record<string, string> = {};
      creatorIds.forEach((uid) => {
        nextNames[uid] = uid === me.uid ? me.displayName : 'criador do chat';
      });
      (data ?? []).forEach((row) => {
        const profile = row as { id: string; display_name: string | null };
        nextNames[profile.id] = profile.display_name || nextNames[profile.id] || 'criador do chat';
      });
      if (active) setNames(nextNames);
    }

    loadCreatorNames();

    return () => {
      active = false;
    };
  }, [events, me.displayName, me.uid]);

  return names;
}

export function useJoinedMapEvents(uid: string | undefined) {
  const [events, setEvents] = useState<MapEvent[]>([]);

  useEffect(() => {
    if (!uid) {
      setEvents([]);
      return undefined;
    }

    if (isDemoMode) {
      const joinedEventIds = Object.entries(demoParticipantsState)
        .filter(([, participants]) => participants.has(uid))
        .map(([eventId]) => eventId);
      setEvents(demoEventsState.filter((event) => joinedEventIds.includes(event.id)));
      return undefined;
    }

    let active = true;

    async function loadEvents() {
      const { data: participantRows, error: participantError } = await supabase
        .from('map_event_participants')
        .select('event_id')
        .eq('user_uid', uid);

      if (participantError) {
        if (isMissingTableError(participantError)) console.warn(schemaCacheMessage('map_event_participants'));
        if (active) setEvents([]);
        return;
      }

      const eventIds = [...new Set((participantRows ?? []).map((row) => (row as Pick<ParticipantRow, 'event_id'>).event_id))];
      if (eventIds.length === 0) {
        if (active) setEvents([]);
        return;
      }

      const { data, error } = await supabase.from('map_events').select('*').in('id', eventIds);
      if (error) {
        if (isMissingTableError(error)) console.warn(schemaCacheMessage('map_events'));
        if (active) setEvents([]);
        return;
      }

      if (active) setEvents(((data ?? []) as EventRow[]).map(rowToEvent));
    }

    loadEvents();

    const channel = supabase
      .channel(`joined-map-events:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_event_participants', filter: `user_uid=eq.${uid}` },
        loadEvents,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_events' }, loadEvents)
      .subscribe();
    const refreshTimer = window.setInterval(loadEvents, 5000);
    const handleFocus = () => loadEvents();
    const handleVisibilityChange = () => {
      if (!document.hidden) loadEvents();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return events;
}

export function useMapEventMessages(eventId?: string, viewerUid?: string) {
  const [messages, setMessages] = useState<MapEventMessage[]>([]);

  useEffect(() => {
    if (!eventId || !viewerUid) {
      setMessages([]);
      return undefined;
    }

    if (isDemoMode) {
      const joinedAt = demoParticipantJoinedAtState[eventId]?.[viewerUid] ?? new Date().toISOString();
      setMessages(demoMessagesState.filter((message) => message.eventId === eventId && message.createdAt >= joinedAt));
      return undefined;
    }

    let active = true;

    async function loadMessages() {
      const { data: participantRows, error: participantError } = await supabase
        .from('map_event_participants')
        .select('joined_at')
        .eq('event_id', eventId)
        .eq('user_uid', viewerUid)
        .limit(1);

      if (participantError) {
        if (isMissingTableError(participantError)) console.warn(schemaCacheMessage('map_event_participants'));
        if (active) setMessages([]);
        return;
      }

      const joinedAt = (participantRows?.[0] as { joined_at?: string } | undefined)?.joined_at;
      if (!joinedAt) {
        if (active) setMessages([]);
        return;
      }

      const { data } = await supabase
        .from('map_event_messages')
        .select('*')
        .eq('event_id', eventId)
        .gte('created_at', joinedAt)
        .order('created_at', { ascending: true });

      if (active) setMessages(((data ?? []) as EventMessageRow[]).map(rowToMessage));
    }

    loadMessages();

    function upsertMessage(row: EventMessageRow) {
      const nextMessage = rowToMessage(row);
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        byId.set(nextMessage.id, nextMessage);
        return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      });
    }

    const channel = supabase
      .channel(`map-event-messages:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_event_messages', filter: `event_id=eq.${eventId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            upsertMessage(payload.new as EventMessageRow);
            return;
          }
          loadMessages();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_event_participants', filter: `event_id=eq.${eventId}` },
        loadMessages,
      )
      .subscribe();
    const refreshTimer = window.setInterval(loadMessages, 2500);
    const handleFocus = () => loadMessages();
    const handleVisibilityChange = () => {
      if (!document.hidden) loadMessages();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [eventId, viewerUid]);

  return messages;
}

export function useMapEventParticipants(eventId: string | undefined, me: UserProfile) {
  const [participants, setParticipants] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!eventId) {
      setParticipants([]);
      return undefined;
    }

    if (isDemoMode) {
      const participantIds = demoParticipantsState[eventId] ?? new Set([me.uid]);
      setParticipants([...participantIds].map((uid) => (uid === me.uid ? me : { ...me, uid, displayName: `Pessoa ${uid.slice(-4)}` })));
      return undefined;
    }

    let active = true;

    async function loadParticipants() {
      const { data: rows, error } = await supabase
        .from('map_event_participants')
        .select('event_id,user_uid,joined_at')
        .eq('event_id', eventId)
        .order('joined_at', { ascending: true });

      if (error) {
        if (isMissingTableError(error)) console.warn(schemaCacheMessage('map_event_participants'));
        if (active) setParticipants([]);
        return;
      }

      const profiles = await rowsToProfiles((rows ?? []) as EventUserRow[], me);
      if (active) setParticipants(profiles);
    }

    loadParticipants();

    const channel = supabase
      .channel(`map-event-participants:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_event_participants', filter: `event_id=eq.${eventId}` },
        loadParticipants,
      )
      .subscribe();
    const refreshTimer = window.setInterval(loadParticipants, 5000);
    const handleFocus = () => loadParticipants();
    const handleVisibilityChange = () => {
      if (!document.hidden) loadParticipants();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [eventId, me]);

  return participants;
}

export function useMapEventParticipantCounts(events: MapEvent[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const eventIdsKey = events
    .map((event) => event.id)
    .sort()
    .join(':');
  const eventIds = useMemo(() => (eventIdsKey ? eventIdsKey.split(':') : []), [eventIdsKey]);

  useEffect(() => {
    if (eventIds.length === 0) {
      setCounts({});
      return undefined;
    }

    if (isDemoMode) {
      setCounts(
        Object.fromEntries(eventIds.map((eventId) => [eventId, Math.max(1, demoParticipantsState[eventId]?.size ?? 1)])),
      );
      return undefined;
    }

    let active = true;

    async function loadCounts() {
      const { data, error } = await supabase
        .from('map_event_participants')
        .select('event_id,user_uid')
        .in('event_id', eventIds);

      if (error) {
        if (active) setCounts(Object.fromEntries(eventIds.map((eventId) => [eventId, 1])));
        return;
      }

      const nextCounts = Object.fromEntries(eventIds.map((eventId) => [eventId, 1]));
      const grouped = new Map<string, Set<string>>();
      (data ?? []).forEach((row) => {
        const participant = row as Pick<ParticipantRow, 'event_id' | 'user_uid'>;
        if (!grouped.has(participant.event_id)) grouped.set(participant.event_id, new Set());
        grouped.get(participant.event_id)?.add(participant.user_uid);
      });
      grouped.forEach((ids, eventId) => {
        nextCounts[eventId] = Math.max(1, ids.size);
      });

      if (active) setCounts(nextCounts);
    }

    loadCounts();

    const channel = supabase
      .channel(`map-event-participant-counts:${eventIds.join(':')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_participants' }, loadCounts)
      .subscribe();
    const refreshTimer = window.setInterval(loadCounts, 5000);
    const handleFocus = () => loadCounts();
    const handleVisibilityChange = () => {
      if (!document.hidden) loadCounts();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [eventIdsKey]);

  return counts;
}

export function useMapEventModerators(eventId: string | undefined) {
  const [moderators, setModerators] = useState<string[]>([]);

  useEffect(() => {
    if (!eventId) {
      setModerators([]);
      return undefined;
    }

    if (isDemoMode) {
      setModerators([...(demoModeratorsState[eventId] ?? new Set())]);
      return undefined;
    }

    let active = true;

    async function loadModerators() {
      const { data, error } = await supabase.from('map_event_moderators').select('user_uid').eq('event_id', eventId);
      if (error) {
        if (active) setModerators([]);
        return;
      }
      if (active) setModerators((data ?? []).map((row) => (row as Pick<EventUserRow, 'user_uid'>).user_uid));
    }

    loadModerators();
    const channel = supabase
      .channel(`map-event-moderators:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_moderators', filter: `event_id=eq.${eventId}` }, loadModerators)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return moderators;
}

export function useMapEventJoinRequests(eventId: string | undefined, me: UserProfile, enabled: boolean) {
  const [requests, setRequests] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!eventId || !enabled) {
      setRequests([]);
      return undefined;
    }

    if (isDemoMode) {
      const rows = [...(demoJoinRequestsState[eventId] ?? new Set())].map((user_uid) => ({ event_id: eventId, user_uid }));
      setRequests(rows.map((row) => ({ ...me, uid: row.user_uid, displayName: `Pessoa ${row.user_uid.slice(-4)}` })));
      return undefined;
    }

    let active = true;

    async function loadRequests() {
      const [{ data, error }, { data: participantRows }] = await Promise.all([
        supabase
          .from('map_event_join_requests')
          .select('event_id,user_uid,created_at')
          .eq('event_id', eventId)
          .order('created_at', { ascending: true }),
        supabase.from('map_event_participants').select('user_uid').eq('event_id', eventId),
      ]);
      if (error) {
        if (active) setRequests([]);
        return;
      }
      const participantIds = new Set((participantRows ?? []).map((row) => row.user_uid as string));
      const profiles = await rowsToProfiles((data ?? []) as EventUserRow[], me);
      if (active) setRequests(profiles.filter((profile) => profile.uid !== me.uid && !participantIds.has(profile.uid)));
    }

    loadRequests();
    const channel = supabase
      .channel(`map-event-join-requests:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_join_requests', filter: `event_id=eq.${eventId}` }, loadRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_participants', filter: `event_id=eq.${eventId}` }, loadRequests)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [eventId, enabled, me]);

  return requests;
}

export function useMapEventBans(eventId: string | undefined, me: UserProfile, enabled: boolean) {
  const [banned, setBanned] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!eventId || !enabled) {
      setBanned([]);
      return undefined;
    }

    if (isDemoMode) {
      const rows = [...(demoBansState[eventId] ?? new Set())].map((user_uid) => ({ event_id: eventId, user_uid }));
      setBanned(rows.map((row) => ({ ...me, uid: row.user_uid, displayName: `Pessoa ${row.user_uid.slice(-4)}` })));
      return undefined;
    }

    let active = true;

    async function loadBans() {
      const { data, error } = await supabase.from('map_event_bans').select('event_id,user_uid,created_at').eq('event_id', eventId);
      if (error) {
        if (active) setBanned([]);
        return;
      }
      const profiles = await rowsToProfiles((data ?? []) as EventUserRow[], me);
      if (active) setBanned(profiles.filter((profile) => profile.uid !== me.uid));
    }

    loadBans();
    const channel = supabase
      .channel(`map-event-bans:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_bans', filter: `event_id=eq.${eventId}` }, loadBans)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [eventId, enabled, me]);

  return banned;
}

export async function createMapEvent(input: {
  title: string;
  description: string;
  coverURL: string;
  emoji: string;
  accessMode: MapEvent['accessMode'];
  passwordHash: string;
  isPermanent: boolean;
  location: LatLng;
  creatorUid: string;
  isPremium: boolean;
  radiusKm: number;
}) {
  const now = new Date().toISOString();
  const activeSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  if (isDemoMode) {
    const ownEvents = demoEventsState.filter(
      (event) =>
        event.creatorUid === input.creatorUid &&
        (event.isPermanent || Date.parse(event.createdAt) + 24 * 60 * 60 * 1000 > Date.now()),
    ).length;
    const limit = input.isPremium ? 5 : 1;
    if (!input.isPremium && input.coverURL) {
      throw new Error('Apenas usuÃ¡rios Premium podem adicionar capa ao chat.');
    }
    if (input.isPremium && input.isPermanent && demoEventsState.some((event) => event.creatorUid === input.creatorUid && event.isPermanent)) {
      throw new Error('VocÃª pode criar apenas 1 chat permanente no Premium.');
    }
    if (ownEvents >= limit) {
      throw new Error(input.isPremium ? 'VocÃª pode criar atÃ© 5 chats no Premium.' : 'VocÃª pode criar apenas 1 chat. Assine o Premium para criar atÃ© 5.');
    }

    const event: MapEvent = {
      id: `demo-event-${Date.now()}`,
      title: input.title,
      description: input.description,
      coverURL: input.coverURL,
      emoji: input.emoji,
      accessMode: input.accessMode,
      passwordHash: input.passwordHash,
      isPermanent: input.isPremium && input.isPermanent,
      location: input.location,
      radiusKm: input.radiusKm,
      creatorUid: input.creatorUid,
      createdAt: now,
    };
    demoEventsState = [event, ...demoEventsState];
    return event;
  }

  const { count, error: countError } = await supabase
    .from('map_events')
    .select('id', { count: 'exact', head: true })
    .eq('creator_uid', input.creatorUid)
    .or(`is_permanent.eq.true,created_at.gt.${activeSince}`);

  if (countError) throw new Error(countError.message);

  if (input.isPremium && input.isPermanent) {
    const { count: permanentCount, error: permanentCountError } = await supabase
      .from('map_events')
      .select('id', { count: 'exact', head: true })
      .eq('creator_uid', input.creatorUid)
      .eq('is_permanent', true);

    if (permanentCountError) throw new Error(permanentCountError.message);
    if ((permanentCount ?? 0) >= 1) {
      throw new Error('VocÃª pode criar apenas 1 chat permanente no Premium.');
    }
  }

  const limit = input.isPremium ? 5 : 1;
  if (!input.isPremium && input.coverURL) {
    throw new Error('Apenas usuÃ¡rios Premium podem adicionar capa ao chat.');
  }
  if ((count ?? 0) >= limit) {
    throw new Error(input.isPremium ? 'VocÃª pode criar atÃ© 5 chats no Premium.' : 'VocÃª pode criar apenas 1 chat. Assine o Premium para criar atÃ© 5.');
  }

  const { data, error } = await supabase
    .from('map_events')
    .insert({
      title: input.title,
      description: input.description,
      cover_url: input.coverURL,
      emoji: input.emoji,
      access_mode: input.accessMode,
      password_hash: input.passwordHash,
      is_permanent: input.isPremium && input.isPermanent,
      lat: input.location.lat,
      lng: input.location.lng,
      radius_km: input.radiusKm,
      creator_uid: input.creatorUid,
      created_at: now,
    })
    .select('*')
    .single<EventRow>();

  if (error) throw new Error(error.message);
  const created = rowToEvent(data);
  await joinMapEvent(created.id, input.creatorUid);
  return created;
}

async function loadRecentMapEventMessages(eventId: string, reportedUid?: string, limit = 5) {
  let query = supabase
    .from('map_event_messages')
    .select('id,sender_uid,sender_name,text,message_type,image_url,created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (reportedUid) query = query.eq('sender_uid', reportedUid);
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
}

export async function reportMapEvent(event: MapEvent, reporterUid: string, reason = 'reported_map_event', reportedUid = event.creatorUid) {
  if (reportedUid === reporterUid) {
    throw new Error('Você não pode denunciar você mesmo.');
  }

  if (isDemoMode) return;

  const isUserReport = reportedUid !== event.creatorUid || reason === 'reported_chat_user';
  const recentMessages = isUserReport
    ? await loadRecentMapEventMessages(event.id, reportedUid, 5)
    : await loadRecentMapEventMessages(event.id, undefined, 20);
  const { error } = await supabase.from('reports').insert({
    context_id: event.id,
    context_title: event.title,
    context_type: isUserReport ? 'map_chat_user' : 'map_chat',
    reporter_uid: reporterUid,
    reported_uid: reportedUid,
    reason: `${reason}:${event.id}`,
    recent_messages: recentMessages,
  });

  if (error) throw new Error(error.message || 'Não consegui registrar a denúncia.');
}

export async function joinMapEvent(eventId: string, userUid: string) {
  if (isDemoMode) {
    if (demoBansState[eventId]?.has(userUid)) throw new Error('VocÃª foi banido deste chat.');
    if (!demoParticipantsState[eventId]) demoParticipantsState[eventId] = new Set();
    if (!demoParticipantJoinedAtState[eventId]) demoParticipantJoinedAtState[eventId] = {};
    if (!demoParticipantsState[eventId].has(userUid)) demoParticipantJoinedAtState[eventId][userUid] = new Date().toISOString();
    demoParticipantsState[eventId].add(userUid);
    demoJoinRequestsState[eventId]?.delete(userUid);
    return;
  }

  const { data: banRows, error: banError } = await supabase
    .from('map_event_bans')
    .select('user_uid')
    .eq('event_id', eventId)
    .eq('user_uid', userUid)
    .limit(1);
  if (banError && !isMissingTableError(banError)) throw new Error(banError.message);
  if ((banRows ?? []).length > 0) throw new Error('VocÃª foi banido deste chat.');

  const { error } = await supabase.from('map_event_participants').upsert(
    {
      event_id: eventId,
      user_uid: userUid,
      joined_at: new Date().toISOString(),
    },
    { ignoreDuplicates: true, onConflict: 'event_id,user_uid' },
  );

  if (error) throw new Error(isMissingTableError(error) ? schemaCacheMessage('map_event_participants') : error.message);

  await supabase.from('map_event_join_requests').delete().eq('event_id', eventId).eq('user_uid', userUid);
}

export async function requestMapEventEntry(eventId: string, userUid: string) {
  if (isDemoMode) {
    if (demoBansState[eventId]?.has(userUid)) throw new Error('VocÃª foi banido deste chat.');
    if (!demoJoinRequestsState[eventId]) demoJoinRequestsState[eventId] = new Set();
    demoJoinRequestsState[eventId].add(userUid);
    return;
  }

  const { error } = await supabase.from('map_event_join_requests').upsert(
    {
      event_id: eventId,
      user_uid: userUid,
      created_at: new Date().toISOString(),
    },
    { ignoreDuplicates: true, onConflict: 'event_id,user_uid' },
  );
  if (error) throw new Error(isMissingTableError(error) ? schemaCacheMessage('map_event_join_requests') : error.message);
}

export async function approveMapEventRequest(eventId: string, userUid: string) {
  if (isDemoMode) {
    await joinMapEvent(eventId, userUid);
    return;
  }

  const { error } = await supabase.rpc('approve_map_event_request', {
    target_event_id: eventId,
    target_user_uid: userUid,
  });

  if (error) throw new Error(error.message);
}

export async function rejectMapEventRequest(eventId: string, userUid: string) {
  if (isDemoMode) {
    demoJoinRequestsState[eventId]?.delete(userUid);
    return;
  }

  const { error } = await supabase.rpc('reject_map_event_request', {
    target_event_id: eventId,
    target_user_uid: userUid,
  });

  if (error) throw new Error(error.message);
}

export async function setMapEventModerator(eventId: string, userUid: string, enabled: boolean) {
  if (isDemoMode) {
    if (!demoModeratorsState[eventId]) demoModeratorsState[eventId] = new Set();
    if (enabled) demoModeratorsState[eventId].add(userUid);
    else demoModeratorsState[eventId].delete(userUid);
    return;
  }

  const request = enabled
    ? supabase.from('map_event_moderators').upsert({ event_id: eventId, user_uid: userUid }, { onConflict: 'event_id,user_uid' })
    : supabase.from('map_event_moderators').delete().eq('event_id', eventId).eq('user_uid', userUid);
  const { error } = await request;
  if (error) throw new Error(error.message);
}

export async function banMapEventUser(eventId: string, userUid: string, bannedByUid: string) {
  if (isDemoMode) {
    if (!demoBansState[eventId]) demoBansState[eventId] = new Set();
    demoBansState[eventId].add(userUid);
    demoParticipantsState[eventId]?.delete(userUid);
    if (demoParticipantJoinedAtState[eventId]) delete demoParticipantJoinedAtState[eventId][userUid];
    demoJoinRequestsState[eventId]?.delete(userUid);
    demoModeratorsState[eventId]?.delete(userUid);
    return;
  }

  const { error } = await supabase.from('map_event_bans').upsert(
    {
      event_id: eventId,
      user_uid: userUid,
      banned_by_uid: bannedByUid,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'event_id,user_uid' },
  );
  if (error) throw new Error(error.message);

  await supabase.from('map_event_participants').delete().eq('event_id', eventId).eq('user_uid', userUid);
  await supabase.from('map_event_join_requests').delete().eq('event_id', eventId).eq('user_uid', userUid);
  await supabase.from('map_event_moderators').delete().eq('event_id', eventId).eq('user_uid', userUid);
}

export async function unbanMapEventUser(eventId: string, userUid: string) {
  if (isDemoMode) {
    demoBansState[eventId]?.delete(userUid);
    return;
  }

  const { error } = await supabase.from('map_event_bans').delete().eq('event_id', eventId).eq('user_uid', userUid);
  if (error) throw new Error(error.message);
}

export async function leaveMapEvent(eventId: string, userUid: string) {
  if (isDemoMode) {
    demoParticipantsState[eventId]?.delete(userUid);
    return;
  }

  const { error } = await supabase
    .from('map_event_participants')
    .delete()
    .eq('event_id', eventId)
    .eq('user_uid', userUid);

  if (error) throw new Error(isMissingTableError(error) ? schemaCacheMessage('map_event_participants') : error.message);
}

export async function deleteMapEvent(eventId: string, creatorUid: string) {
  if (isDemoMode) {
    demoEventsState = demoEventsState.filter((event) => event.id !== eventId || event.creatorUid !== creatorUid);
    delete demoParticipantsState[eventId];
    delete demoParticipantJoinedAtState[eventId];
    delete demoModeratorsState[eventId];
    delete demoBansState[eventId];
    delete demoJoinRequestsState[eventId];
    demoMessagesState = demoMessagesState.filter((message) => message.eventId !== eventId);
    return;
  }

  const { error } = await supabase.from('map_events').delete().eq('id', eventId).eq('creator_uid', creatorUid);
  if (error) throw new Error(error.message || 'NÃ£o consegui excluir o chat.');
}

export async function sendMapEventMessage(input: {
  eventId: string;
  image?: { imagePath?: string; imageURL: string; viewOnce: boolean };
  senderUid: string;
  senderName: string;
  text: string;
}) {
  const cleanText = input.text.trim() || (input.image ? 'Imagem' : '');
  if (!cleanText) return;
  const now = new Date().toISOString();

  if (isDemoMode) {
    demoMessagesState = [
      ...demoMessagesState,
      {
        id: `demo-map-message-${Date.now()}`,
        eventId: input.eventId,
        senderUid: input.senderUid,
        senderName: input.senderName,
        text: cleanText,
        messageType: input.image ? 'image' : 'text',
        imageURL: input.image?.imageURL ?? '',
        imagePath: input.image?.imagePath ?? '',
        viewOnce: input.image?.viewOnce ?? false,
        viewedBy: [],
        createdAt: now,
      },
    ];
    return;
  }

  const { data, error } = await supabase
    .from('map_event_messages')
    .insert({
    event_id: input.eventId,
    sender_uid: input.senderUid,
    sender_name: input.senderName,
    text: cleanText,
    message_type: input.image ? 'image' : 'text',
    image_url: input.image?.imageURL ?? '',
    image_path: input.image?.imagePath ?? '',
    view_once: input.image?.viewOnce ?? false,
    viewed_by: [],
    created_at: now,
    })
    .select('id')
    .single<{ id: string }>();

  if (error) throw new Error(error.message);

  const { error: pushError } = await supabase.functions.invoke('send-map-event-push', {
    body: {
      eventId: input.eventId,
      messageId: data?.id,
      senderName: input.senderName,
      senderUid: input.senderUid,
      text: cleanText,
    },
  });
  if (pushError) console.warn('Nao consegui enviar push do chat local', pushError);
}

export async function markMapEventMessageImageViewed(message: MapEventMessage, viewerUid: string) {
  if (isDemoMode || message.viewedBy.includes(viewerUid)) return;

  const rpcResult = await supabase.rpc('mark_map_event_image_viewed', {
    target_message_id: message.id,
  });

  if (!rpcResult.error) return;

  const missingFunction =
    rpcResult.error.code === 'PGRST202' || rpcResult.error.message.toLowerCase().includes('mark_map_event_image_viewed');
  if (!missingFunction) throw new Error(rpcResult.error.message || 'Não consegui marcar a imagem como vista.');

  const nextViewedBy = [...new Set([...message.viewedBy, viewerUid])];
  const { error } = await supabase.from('map_event_messages').update({ viewed_by: nextViewedBy }).eq('id', message.id);
  if (error) throw new Error(error.message || 'Não consegui marcar a imagem como vista.');
}


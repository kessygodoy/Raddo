import { useEffect, useMemo, useState } from 'react';
import { demoMapEventMessages, demoMapEvents, isDemoMode } from '../demoData';
import { supabase } from '../supabase';
import type { LatLng, MapEvent, MapEventMessage, UserProfile } from '../types';
import { distanceKm } from '../utils/geo';

let demoEventsState = [...demoMapEvents];
let demoMessagesState = [...demoMapEventMessages];
let demoParticipantsState: Record<string, Set<string>> = {};
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
  visibility_radius: number;
  gender: UserProfile['gender'];
  sexualities: UserProfile['sexualities'] | null;
  looking_for: UserProfile['lookingFor'] | null;
  interested_sexualities: UserProfile['interestedSexualities'] | null;
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
    emoji: row.emoji ?? '💬',
    accessMode: row.access_mode ?? 'open',
    passwordHash: row.password_hash ?? '',
    isPermanent: Boolean(row.is_permanent),
    location: { lat: row.lat, lng: row.lng },
    radiusKm: row.radius_km,
    creatorUid: row.creator_uid,
    createdAt: row.created_at,
  };
}

async function rowsToProfiles(rows: EventUserRow[], me: UserProfile) {
  const ids = [...new Set([me.uid, ...rows.map((row) => row.user_uid)])];
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
    visibilityRadius: row.visibility_radius,
    gender: row.gender,
    sexualities: row.sexualities ?? [],
    lookingFor: row.looking_for ?? [],
    interestedSexualities: row.interested_sexualities ?? [],
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
  return `A tabela ${tableName} ainda não existe no Supabase. Rode novamente o arquivo supabase_create_map_events_first.sql no SQL Editor.`;
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

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [me]);

  return useMemo(() => {
    if (!me?.location) return events;
    return events.filter((event) => distanceKm(me.location!, event.location) <= Math.max(event.radiusKm, 500));
  }, [events, me]);
}

export function useMapEventMessages(eventId?: string) {
  const [messages, setMessages] = useState<MapEventMessage[]>([]);

  useEffect(() => {
    if (!eventId) {
      setMessages([]);
      return undefined;
    }

    if (isDemoMode) {
      setMessages(demoMessagesState.filter((message) => message.eventId === eventId));
      return undefined;
    }

    let active = true;

    async function loadMessages() {
      const { data } = await supabase
        .from('map_event_messages')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (active) setMessages(((data ?? []) as EventMessageRow[]).map(rowToMessage));
    }

    loadMessages();

    const channel = supabase
      .channel(`map-event-messages:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_event_messages', filter: `event_id=eq.${eventId}` },
        loadMessages,
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return messages;
}

export function useMapEventParticipants(eventId: string | undefined, me: UserProfile) {
  const [participants, setParticipants] = useState<UserProfile[]>([me]);

  useEffect(() => {
    if (!eventId) {
      setParticipants([me]);
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
        if (active) setParticipants([me]);
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

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [eventId, me]);

  return participants;
}

export function useMapEventParticipantCounts(events: MapEvent[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const eventIds = useMemo(() => events.map((event) => event.id).sort(), [events]);

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

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [eventIds]);

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
      const { data, error } = await supabase
        .from('map_event_join_requests')
        .select('event_id,user_uid,created_at')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      if (error) {
        if (active) setRequests([]);
        return;
      }
      const profiles = await rowsToProfiles((data ?? []) as EventUserRow[], me);
      if (active) setRequests(profiles.filter((profile) => profile.uid !== me.uid));
    }

    loadRequests();
    const channel = supabase
      .channel(`map-event-join-requests:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_join_requests', filter: `event_id=eq.${eventId}` }, loadRequests)
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

  if (isDemoMode) {
    const ownEvents = demoEventsState.filter((event) => event.creatorUid === input.creatorUid).length;
    const limit = input.isPremium ? 5 : 1;
    if (input.isPremium && input.isPermanent && demoEventsState.some((event) => event.creatorUid === input.creatorUid && event.isPermanent)) {
      throw new Error('Você pode criar apenas 1 chat permanente no Premium.');
    }
    if (ownEvents >= limit) {
      throw new Error(input.isPremium ? 'Você pode criar até 5 chats no Premium.' : 'Você pode criar apenas 1 chat. Assine o Premium para criar até 5.');
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
    .eq('creator_uid', input.creatorUid);

  if (countError) throw new Error(countError.message);

  if (input.isPremium && input.isPermanent) {
    const { count: permanentCount, error: permanentCountError } = await supabase
      .from('map_events')
      .select('id', { count: 'exact', head: true })
      .eq('creator_uid', input.creatorUid)
      .eq('is_permanent', true);

    if (permanentCountError) throw new Error(permanentCountError.message);
    if ((permanentCount ?? 0) >= 1) {
      throw new Error('Você pode criar apenas 1 chat permanente no Premium.');
    }
  }

  const limit = input.isPremium ? 5 : 1;
  if ((count ?? 0) >= limit) {
    throw new Error(input.isPremium ? 'Você pode criar até 5 chats no Premium.' : 'Você pode criar apenas 1 chat. Assine o Premium para criar até 5.');
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

export async function joinMapEvent(eventId: string, userUid: string) {
  if (isDemoMode) {
    if (demoBansState[eventId]?.has(userUid)) throw new Error('Você foi banido deste chat.');
    if (!demoParticipantsState[eventId]) demoParticipantsState[eventId] = new Set();
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
  if ((banRows ?? []).length > 0) throw new Error('Você foi banido deste chat.');

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
    if (demoBansState[eventId]?.has(userUid)) throw new Error('Você foi banido deste chat.');
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
  await joinMapEvent(eventId, userUid);
}

export async function rejectMapEventRequest(eventId: string, userUid: string) {
  if (isDemoMode) {
    demoJoinRequestsState[eventId]?.delete(userUid);
    return;
  }

  const { error } = await supabase.from('map_event_join_requests').delete().eq('event_id', eventId).eq('user_uid', userUid);
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
    delete demoModeratorsState[eventId];
    delete demoBansState[eventId];
    delete demoJoinRequestsState[eventId];
    demoMessagesState = demoMessagesState.filter((message) => message.eventId !== eventId);
    return;
  }

  const { error } = await supabase.from('map_events').delete().eq('id', eventId).eq('creator_uid', creatorUid);
  if (error) throw new Error(error.message || 'Não consegui excluir o chat.');
}

export async function sendMapEventMessage(input: {
  eventId: string;
  senderUid: string;
  senderName: string;
  text: string;
}) {
  const cleanText = input.text.trim();
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
        createdAt: now,
      },
    ];
    return;
  }

  const { error } = await supabase.from('map_event_messages').insert({
    event_id: input.eventId,
    sender_uid: input.senderUid,
    sender_name: input.senderName,
    text: cleanText,
    created_at: now,
  });

  if (error) throw new Error(error.message);
}

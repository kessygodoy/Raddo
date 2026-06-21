import { useEffect, useMemo, useState } from 'react';
import { demoMapEventMessages, demoMapEvents, isDemoMode } from '../demoData';
import { supabase } from '../supabase';
import type { LatLng, MapEvent, MapEventMessage, MapEventStory, UserProfile } from '../types';
import { distanceKm } from '../utils/geo';
import { signedProfilePhotoUrl, withSignedProfilePhotos } from '../storageImages';
import { deleteCachedChatMedia, deleteCachedChatMediaKeys } from '../chatMediaCache';

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
  message_type: 'image' | 'system' | 'text' | null;
  image_url: string | null;
  image_path: string | null;
  view_once: boolean | null;
  viewed_by: string[] | null;
  created_at: string;
};

type EventStoryRow = {
  id: string;
  event_id: string | null;
  creator_uid: string;
  creator_name: string | null;
  image_url: string | null;
  media_type: 'image' | 'video' | null;
  liked_by: string[] | null;
  viewed_by: string[] | null;
  text: string | null;
  created_at: string;
  expires_at: string;
};

export type MapEventNotification = {
  count?: number;
  eventId?: string;
  groupKey?: string;
  id: string;
  text: string;
  timeValue: string | null;
  title: string;
  tone: 'message' | 'story_like';
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
  created_at: string | null;
};

function rowToEvent(row: EventRow): MapEvent {
  const coverURL = row.cover_url ?? '';
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    coverURL: coverURL.startsWith('blob:') ? '' : coverURL,
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

async function withSignedEventImages(event: MapEvent) {
  return {
    ...event,
    coverURL: await signedProfilePhotoUrl(event.coverURL),
  };
}

async function withSignedMapEventMessageImage(message: MapEventMessage) {
  if (message.messageType !== 'image') return message;
  const imageSource = message.imagePath || message.imageURL;
  if (!imageSource) return message;
  return {
    ...message,
    imagePath: message.imagePath || imageSource,
    imageURL: await signedProfilePhotoUrl(imageSource, { encryptedCache: false }),
  };
}

function mapEventMessageCacheKey(message: MapEventMessage) {
  return message.messageType === 'image' && !message.viewOnce ? message.imagePath || message.imageURL : '';
}

function mapEventMessagesCacheKey(eventId: string, viewerUid: string) {
  return `raddo-map-event-messages-cache:${eventId}:${viewerUid}`;
}

function readCachedMapEventMessages(eventId: string, viewerUid: string) {
  try {
    const saved = window.localStorage.getItem(mapEventMessagesCacheKey(eventId, viewerUid));
    return saved ? JSON.parse(saved) as MapEventMessage[] : [];
  } catch {
    return [];
  }
}

function writeCachedMapEventMessages(eventId: string, viewerUid: string, messages: MapEventMessage[]) {
  try {
    window.localStorage.setItem(mapEventMessagesCacheKey(eventId, viewerUid), JSON.stringify(messages.slice(-300)));
  } catch {
    // Cache is best-effort only.
  }
}

export async function editMapEventMessage(message: MapEventMessage, viewerUid: string, nextText: string) {
  const cleanText = nextText.trim();
  if (isDemoMode || message.senderUid !== viewerUid || message.messageType !== 'text' || !cleanText) return;

  const { error } = await supabase.rpc('edit_map_event_message', {
    next_text: cleanText,
    target_message_id: message.id,
  });
  if (error) throw new Error(error.message || 'Não consegui editar a mensagem.');
}

export async function deleteMapEventMessage(message: MapEventMessage, viewerUid: string, canManage: boolean) {
  if (isDemoMode) return;
  if (message.senderUid !== viewerUid && !canManage) return;
  void deleteCachedChatMedia(mapEventMessageCacheKey(message));

  const rpcResult = await supabase.rpc('delete_map_event_message', {
    target_message_id: message.id,
  });

  if (rpcResult.error) throw new Error(rpcResult.error.message || 'Nao consegui excluir a mensagem.');
}

async function rowsToProfiles(rows: EventUserRow[], me: UserProfile) {
  const ids = [...new Set(rows.map((row) => row.user_uid))];
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
  const byUid = new Map(((profiles ?? []) as ProfileRow[]).map((row) => [row.id, rowToProfile(row)]));
  byUid.set(me.uid, me);
  return Promise.all(ids.map((uid) => withSignedProfilePhotos(byUid.get(uid) ?? { ...me, uid, displayName: `Pessoa ${uid.slice(-4)}` })));
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
  const imagePath = row.image_path ?? '';
  const imageURL = row.image_url ?? imagePath;
  return {
    id: row.id,
    eventId: row.event_id,
    senderUid: row.sender_uid,
    senderName: row.sender_name,
    text: row.text,
    messageType: row.message_type ?? 'text',
    imageURL,
    imagePath,
    viewOnce: Boolean(row.view_once),
    viewedBy: row.viewed_by ?? [],
    createdAt: row.created_at,
  };
}

function rowToStory(row: EventStoryRow): MapEventStory {
  return {
    id: row.id,
    eventId: row.event_id,
    creatorUid: row.creator_uid,
    creatorName: row.creator_name ?? 'Raddo',
    imageURL: row.image_url ?? '',
    mediaType: row.media_type ?? 'image',
    likedBy: row.liked_by ?? [],
    viewedBy: row.viewed_by ?? [],
    text: row.text ?? '',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function withSignedStoryImage(story: MapEventStory) {
  if (!story.imageURL) return story;
  return { ...story, imageURL: await signedProfilePhotoUrl(story.imageURL) };
}

type MapStoryVisibilityOptions = {
  includeOpenEventStories?: boolean;
  includeStandaloneStories?: boolean;
};

export function useMapEventStories(events: MapEvent[], me: UserProfile, options: MapStoryVisibilityOptions = {}) {
  const [stories, setStories] = useState<MapEventStory[]>([]);
  const eventIdsKey = events.map((event) => event.id).sort().join(':');
  const eventIds = useMemo(() => (eventIdsKey ? eventIdsKey.split(':') : []), [eventIdsKey]);
  const includeOpenEventStories = options.includeOpenEventStories ?? true;
  const includeStandaloneStories = options.includeStandaloneStories ?? true;

  useEffect(() => {
    if (isDemoMode) {
      setStories([]);
      return undefined;
    }

    let active = true;

    async function loadStories() {
      let query = supabase
        .from('map_event_stories')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(80);
      const storyFilters = [];
      if (includeStandaloneStories) storyFilters.push('event_id.is.null');
      if (includeOpenEventStories && eventIds.length > 0) storyFilters.push(`event_id.in.(${eventIds.join(',')})`);
      if (storyFilters.length > 0) query = query.or(storyFilters.join(','));
      else if (eventIds.length > 0) query = query.in('event_id', eventIds);
      else query = query.is('event_id', null).eq('id', '00000000-0000-0000-0000-000000000000');

      const { data, error } = await query;

      if (error) {
        if (active) setStories([]);
        return;
      }

      const nextStories = await Promise.all(((data ?? []) as EventStoryRow[]).map((row) => withSignedStoryImage(rowToStory(row))));
      if (active) setStories(nextStories);
    }

    loadStories();
    const channel = supabase
      .channel(`map-event-stories:${me.uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_stories' }, loadStories)
      .subscribe();
    const refreshTimer = window.setInterval(loadStories, 15000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [eventIdsKey, includeOpenEventStories, includeStandaloneStories, me.uid]);

  return stories;
}

export function useMapEventNotifications(uid: string | undefined) {
  const [notifications, setNotifications] = useState<MapEventNotification[]>([]);

  useEffect(() => {
    if (isDemoMode || !uid) {
      setNotifications([]);
      return undefined;
    }

    let active = true;

    async function loadNotifications() {
      const { data: participantRows } = await supabase
        .from('map_event_participants')
        .select('event_id')
        .eq('user_uid', uid)
        .limit(80);
      const eventIds = [...new Set(((participantRows ?? []) as Pick<ParticipantRow, 'event_id'>[]).map((row) => row.event_id))];

      const [eventsResult, messagesResult, storiesResult] = await Promise.all([
        eventIds.length
          ? supabase.from('map_events').select('id,title').in('id', eventIds)
          : Promise.resolve({ data: [], error: null }),
        eventIds.length
          ? supabase
              .from('map_event_messages')
              .select('id,event_id,sender_uid,sender_name,text,message_type,created_at')
              .in('event_id', eventIds)
              .order('created_at', { ascending: false })
              .limit(40)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('map_event_stories')
          .select('id,text,liked_by,created_at')
          .eq('creator_uid', uid)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (!active) return;

      const eventTitles = new Map<string, string>(
        ((eventsResult.data ?? []) as Array<{ id: string; title: string }>).map((event) => [event.id, event.title]),
      );
      const messageRows = ((messagesResult.data ?? []) as Array<{
        created_at: string;
        event_id: string;
        id: string;
        message_type: string;
        sender_name: string;
        sender_uid: string;
        text: string;
      }>).filter((message) => message.sender_uid !== uid && message.message_type !== 'system');
      const messagesByEvent = new Map<string, typeof messageRows>();
      messageRows.forEach((message) => {
        const current = messagesByEvent.get(message.event_id) ?? [];
        current.push(message);
        messagesByEvent.set(message.event_id, current);
      });
      const messageNotifications = [...messagesByEvent.entries()].map(([eventId, rows]) => {
        const sortedRows = rows.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        const latest = sortedRows[0];
        const title = eventTitles.get(eventId) ?? 'Chat do mapa';
        return {
          count: sortedRows.length,
          eventId,
          groupKey: `map-message:${eventId}`,
          id: `map-message:${eventId}:${latest.id}`,
          text: sortedRows.length === 1 ? `${latest.sender_name}: ${latest.text || 'Nova mensagem'}` : `${title} tem ${sortedRows.length} mensagens novas`,
          timeValue: latest.created_at,
          title,
          tone: 'message' as const,
        };
      });

      const storyLikeNotifications = ((storiesResult.data ?? []) as Array<{
        created_at: string;
        id: string;
        liked_by: string[] | null;
        text: string | null;
      }>)
        .filter((story) => (story.liked_by ?? []).some((likedUid) => likedUid !== uid))
        .map((story) => ({
          count: (story.liked_by ?? []).filter((likedUid) => likedUid !== uid).length,
          groupKey: `story-like:${story.id}`,
          id: `story-like:${story.id}:${(story.liked_by ?? []).filter((likedUid) => likedUid !== uid).length}`,
          text: `${(story.liked_by ?? []).filter((likedUid) => likedUid !== uid).length} curtiram seu story${story.text ? `: ${story.text}` : ''}`,
          timeValue: story.created_at,
          title: 'Curtida no story',
          tone: 'story_like' as const,
        }));

      setNotifications([...messageNotifications, ...storyLikeNotifications].sort((a, b) => Date.parse(b.timeValue ?? '') - Date.parse(a.timeValue ?? '')));
    }

    loadNotifications();
    const channel = supabase
      .channel(`map-notifications:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_messages' }, loadNotifications)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_stories' }, loadNotifications)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return notifications;
}

export async function deleteMapEventStory(storyId: string) {
  if (isDemoMode || storyId.startsWith('local-story-')) return;
  const { error } = await supabase.from('map_event_stories').delete().eq('id', storyId);
  if (error) throw new Error(error.message || 'Não consegui apagar o story.');
}

export async function createMapEventStory(input: {
  creatorName: string;
  creatorUid: string;
  eventId?: string | null;
  imageURL: string;
  mediaType?: 'image' | 'video';
  text: string;
}) {
  const cleanText = input.text.trim().slice(0, 160);
  if (!input.imageURL && !cleanText) throw new Error('Adicione uma foto, vídeo ou texto para publicar.');

  if (isDemoMode) return;

  const { error } = await supabase.from('map_event_stories').insert({
    creator_name: input.creatorName,
    creator_uid: input.creatorUid,
    event_id: input.eventId ?? null,
    image_url: input.imageURL,
    media_type: input.mediaType ?? 'image',
    text: cleanText,
  });
  if (error) throw new Error(error.message || 'Não consegui publicar o story.');
}

export async function reportMapEventStory(story: MapEventStory, event: MapEvent | null, reporterUid: string) {
  if (story.creatorUid === reporterUid) throw new Error('Você não pode denunciar seu próprio story.');
  if (isDemoMode) return;

  const { error } = await supabase.from('reports').insert({
    context_id: story.id,
    context_title: event?.title ?? 'Story do mapa',
    context_type: 'map_story',
    reporter_uid: reporterUid,
    reported_uid: story.creatorUid,
    reason: `reported_map_story:${event?.id ?? 'map'}`,
    recent_messages: [
      {
        createdAt: story.createdAt,
        imageUrl: story.imageURL,
        mediaType: story.mediaType,
        messageType: 'story',
        senderName: story.creatorName,
        senderUid: story.creatorUid,
        text: story.text,
      },
    ],
  });
  if (error) throw new Error(error.message || 'Não consegui denunciar o story.');
}

export async function markMapEventStoryViewed(story: MapEventStory, userUid: string) {
  if (isDemoMode || story.creatorUid === userUid || story.viewedBy.includes(userUid)) return;
  const { error } = await supabase.rpc('mark_map_event_story_viewed', { target_story_id: story.id });
  if (error) console.warn('Nao consegui marcar story como visto', error);
}

export async function toggleMapEventStoryLike(story: MapEventStory, userUid: string) {
  if (isDemoMode || story.creatorUid === userUid) return;

  const { error } = await supabase.rpc('toggle_map_event_story_like', {
    target_story_id: story.id,
  });
  if (error) throw new Error(error.message || 'Não consegui curtir o story.');
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
    createdAt: row.created_at,
  };
}

function schemaCacheMessage(tableName: string) {
  return `A tabela ${tableName} ainda não existe no Supabase. Rode novamente o arquivo supabase_create_map_events_first.sql no SQL Editor.`;
}

function isMissingTableError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  return error.code === '42P01' || message.includes('schema cache') || message.includes('could not find the table');
}

function isPolicyBlockedError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  return error.code === '42501' || message.includes('row-level security policy') || message.includes('permission denied');
}

function mapEventsCacheKey(uid: string) {
  return `raddo-map-events-cache:${uid}`;
}

function readCachedEventRows(uid: string) {
  try {
    const saved = window.localStorage.getItem(mapEventsCacheKey(uid));
    const rows = saved ? JSON.parse(saved) as EventRow[] : [];
    return rows.map((row) => ({
      ...row,
      cover_url: row.cover_url?.startsWith('blob:') ? '' : row.cover_url,
    }));
  } catch {
    return [];
  }
}

function writeCachedEventRows(uid: string, rows: EventRow[]) {
  try {
    const safeRows = rows.slice(0, 250).map((row) => ({
      ...row,
      cover_url: row.cover_url?.startsWith('blob:') ? '' : row.cover_url,
    }));
    window.localStorage.setItem(mapEventsCacheKey(uid), JSON.stringify(safeRows));
  } catch {
    // Cache is best-effort only.
  }
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
    const meUid = me.uid;
    const currentLocation = me.location;

    async function loadCachedEvents() {
      const cachedRows = readCachedEventRows(meUid);
      if (cachedRows.length === 0) return;
      const cachedEvents = await Promise.all(cachedRows.map((row) => withSignedEventImages(rowToEvent(row))));
      if (active) setEvents(cachedEvents);
    }

    async function loadEvents() {
      const { data, error } = await supabase.from('map_events').select('*').order('created_at', { ascending: false });
      if (error) return;
      const rows = ((data ?? []) as EventRow[]).filter((row) => {
        if (!currentLocation || typeof row.lat !== 'number' || typeof row.lng !== 'number') return true;
        return distanceKm(currentLocation, { lat: row.lat, lng: row.lng }) <= 50;
      });
      writeCachedEventRows(meUid, rows);
      const nextEvents = await Promise.all(rows.map((row) => withSignedEventImages(rowToEvent(row))));
      if (active) setEvents(nextEvents);
    }

    loadCachedEvents();
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
    return events.filter((event) => distanceKm(me.location!, event.location) <= Math.max(event.radiusKm, 50));
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

      const nextEvents = await Promise.all(((data ?? []) as EventRow[]).map((row) => withSignedEventImages(rowToEvent(row))));
      if (active) setEvents(nextEvents);
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
    const refreshTimer = window.setInterval(loadEvents, 30000);
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
    const currentEventId = eventId;
    const currentViewerUid = viewerUid;
    const cachedMessages = readCachedMapEventMessages(currentEventId, currentViewerUid);
    if (cachedMessages.length > 0) setMessages(cachedMessages);

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

      const nextMessages = await Promise.all(((data ?? []) as EventMessageRow[]).map((row) => withSignedMapEventMessageImage(rowToMessage(row))));
      if (active) {
        setMessages((current) => {
          const nextIds = new Set(nextMessages.map((message) => message.id));
          void deleteCachedChatMediaKeys(current.filter((message) => !nextIds.has(message.id)).map(mapEventMessageCacheKey));
          writeCachedMapEventMessages(currentEventId, currentViewerUid, nextMessages);
          return nextMessages;
        });
      }
    }

    loadMessages();

    function upsertMessage(row: EventMessageRow) {
      const nextMessage = rowToMessage(row);
      withSignedMapEventMessageImage(nextMessage).then((signedMessage) => {
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        byId.set(signedMessage.id, signedMessage);
        const nextMessages = [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        writeCachedMapEventMessages(currentEventId, currentViewerUid, nextMessages);
        return nextMessages;
      });
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
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as Partial<EventMessageRow>)?.id;
            if (deletedId) {
              setMessages((current) => {
                const deleted = current.find((message) => message.id === deletedId);
                if (deleted) void deleteCachedChatMedia(mapEventMessageCacheKey(deleted));
                const nextMessages = current.filter((message) => message.id !== deletedId);
                writeCachedMapEventMessages(currentEventId, currentViewerUid, nextMessages);
                return nextMessages;
              });
            }
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
    const refreshTimer = window.setInterval(loadMessages, 15000);
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
    const refreshTimer = window.setInterval(loadParticipants, 15000);
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
    const refreshTimer = window.setInterval(loadCounts, 15000);
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

export function useMapEventRecentActivity(events: MapEvent[], windowMinutes = 30) {
  const [activeEventIds, setActiveEventIds] = useState<Set<string>>(new Set());
  const eventIdsKey = events
    .map((event) => event.id)
    .sort()
    .join(':');
  const eventIds = useMemo(() => (eventIdsKey ? eventIdsKey.split(':') : []), [eventIdsKey]);

  useEffect(() => {
    if (eventIds.length === 0) {
      setActiveEventIds(new Set());
      return undefined;
    }

    if (isDemoMode) {
      const cutoff = Date.now() - windowMinutes * 60 * 1000;
      setActiveEventIds(
        new Set(
          demoMessagesState
            .filter((message) => eventIds.includes(message.eventId) && Date.parse(message.createdAt) >= cutoff)
            .map((message) => message.eventId),
        ),
      );
      return undefined;
    }

    let active = true;

    async function loadRecentActivity() {
      const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('map_event_messages')
        .select('event_id,created_at')
        .in('event_id', eventIds)
        .gte('created_at', cutoff);

      if (error) {
        if (active) setActiveEventIds(new Set());
        return;
      }

      if (active) setActiveEventIds(new Set(((data ?? []) as Pick<EventMessageRow, 'event_id'>[]).map((row) => row.event_id)));
    }

    loadRecentActivity();

    const channel = supabase
      .channel(`map-event-recent-activity:${eventIds.join(':')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_event_messages' }, loadRecentActivity)
      .subscribe();
    const refreshTimer = window.setInterval(loadRecentActivity, 30000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [eventIdsKey, windowMinutes]);

  return activeEventIds;
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
  const duplicateSince = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  if (isDemoMode) {
    const duplicateEvent = demoEventsState.find(
      (event) =>
        event.creatorUid === input.creatorUid &&
        event.title.trim().toLowerCase() === input.title.trim().toLowerCase() &&
        event.description.trim() === input.description.trim() &&
        event.location.lat === input.location.lat &&
        event.location.lng === input.location.lng &&
        event.radiusKm === input.radiusKm &&
        event.accessMode === input.accessMode &&
        Date.parse(event.createdAt) >= Date.parse(duplicateSince),
    );
    if (duplicateEvent) return duplicateEvent;

    const ownEvents = demoEventsState.filter(
      (event) =>
        event.creatorUid === input.creatorUid &&
        (event.isPermanent || Date.parse(event.createdAt) + 24 * 60 * 60 * 1000 > Date.now()),
    ).length;
    const limit = input.isPremium ? 5 : 1;
    if (!input.isPremium && input.coverURL) {
      throw new Error('Apenas usuários Premium podem adicionar capa ao chat.');
    }
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
      throw new Error('Você pode criar apenas 1 chat permanente no Premium.');
    }
  }

  const limit = input.isPremium ? 5 : 1;
  if (!input.isPremium && input.coverURL) {
    throw new Error('Apenas usuários Premium podem adicionar capa ao chat.');
  }
  if ((count ?? 0) >= limit) {
    throw new Error(input.isPremium ? 'Você pode criar até 5 chats no Premium.' : 'Você pode criar apenas 1 chat. Assine o Premium para criar até 5.');
  }

  const { data: existingDuplicate, error: duplicateError } = await supabase
    .from('map_events')
    .select('*')
    .eq('creator_uid', input.creatorUid)
    .eq('title', input.title)
    .eq('description', input.description)
    .eq('lat', input.location.lat)
    .eq('lng', input.location.lng)
    .eq('radius_km', input.radiusKm)
    .eq('access_mode', input.accessMode)
    .gte('created_at', duplicateSince)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<EventRow>();

  if (duplicateError) throw new Error(duplicateError.message);
  if (existingDuplicate) {
    const existing = await withSignedEventImages(rowToEvent(existingDuplicate));
    await joinMapEvent(existing.id, input.creatorUid);
    return existing;
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
  const created = await withSignedEventImages(rowToEvent(data));
  await joinMapEvent(created.id, input.creatorUid);
  return created;
}

export async function isMapEventParticipant(eventId: string, userUid: string) {
  if (isDemoMode) return Boolean(demoParticipantsState[eventId]?.has(userUid));

  const rpcResult = await supabase.rpc('is_map_event_participant', {
    target_event_id: eventId,
    target_user_uid: userUid,
  });
  if (!rpcResult.error) return Boolean(rpcResult.data);

  const missingFunction =
    rpcResult.error.code === 'PGRST202' || rpcResult.error.message.toLowerCase().includes('is_map_event_participant');
  if (!missingFunction) throw new Error(rpcResult.error.message);

  const { data, error } = await supabase
    .from('map_event_participants')
    .select('user_uid')
    .eq('event_id', eventId)
    .eq('user_uid', userUid)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function isMapEventModerator(eventId: string, userUid: string) {
  if (isDemoMode) return false;

  const { data, error } = await supabase
    .from('map_event_moderators')
    .select('user_uid')
    .eq('event_id', eventId)
    .eq('user_uid', userUid)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

type UpdateMapEventDetailsInput = {
  accessMode: MapEvent['accessMode'];
  coverURL: string;
  description: string;
  emoji: string;
  isPermanent: boolean;
  passwordHash: string;
  radiusKm: number;
  title: string;
};

export async function updateMapEventDetails(eventId: string, input: UpdateMapEventDetailsInput) {
  if (isDemoMode) {
    let updated: MapEvent | null = null;
    demoEventsState = demoEventsState.map((event) => {
      if (event.id !== eventId) return event;
      updated = { ...event, ...input };
      return updated;
    });
    if (!updated) throw new Error('Chat não encontrado.');
    return updated;
  }

  const { data, error } = await supabase
    .from('map_events')
    .update({
      access_mode: input.accessMode,
      cover_url: input.coverURL,
      description: input.description,
      emoji: input.emoji,
      is_permanent: input.isPermanent,
      password_hash: input.passwordHash,
      radius_km: input.radiusKm,
      title: input.title,
    })
    .eq('id', eventId)
    .select('*')
    .single<EventRow>();
  if (error) throw new Error(error.message);
  return withSignedEventImages(rowToEvent(data));
}

export async function updateMapEventPassword(eventId: string, passwordHash: string) {
  if (isDemoMode) {
    demoEventsState = demoEventsState.map((event) =>
      event.id === eventId ? { ...event, accessMode: 'password', passwordHash } : event,
    );
    return;
  }

  const rpcResult = await supabase.rpc('update_map_event_password', {
    target_event_id: eventId,
    target_password_hash: passwordHash,
  });
  if (!rpcResult.error) return;

  const missingFunction =
    rpcResult.error.code === 'PGRST202' || rpcResult.error.message.toLowerCase().includes('update_map_event_password');
  if (!missingFunction) throw new Error(rpcResult.error.message);

  const { error } = await supabase.from('map_events').update({ access_mode: 'password', password_hash: passwordHash }).eq('id', eventId);
  if (error) throw new Error(error.message);
}

async function loadRecentMapEventMessages(eventId: string, reportedUid?: string, limit = 30) {
  let query = supabase
    .from('map_event_messages')
    .select('id,sender_uid,sender_name,text,message_type,image_url,image_path,created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (reportedUid) query = query.eq('sender_uid', reportedUid);
  const { data } = await query;

  return (data ?? []).map((message) => ({
    id: message.id,
    createdAt: message.created_at,
    imagePath: message.image_path,
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
    ? await loadRecentMapEventMessages(event.id, reportedUid, 30)
    : await loadRecentMapEventMessages(event.id, undefined, 30);
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
    if (demoBansState[eventId]?.has(userUid)) throw new Error('Você foi banido deste chat.');
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
    if (demoParticipantsState[eventId]?.has(userUid)) return { alreadyJoined: true };
    if (!demoJoinRequestsState[eventId]) demoJoinRequestsState[eventId] = new Set();
    demoJoinRequestsState[eventId].add(userUid);
    return { alreadyJoined: false };
  }

  const { data: participantRows, error: participantError } = await supabase
    .from('map_event_participants')
    .select('user_uid')
    .eq('event_id', eventId)
    .eq('user_uid', userUid)
    .limit(1);
  if (participantError && !isMissingTableError(participantError)) throw new Error(participantError.message);
  if ((participantRows ?? []).length > 0) return { alreadyJoined: true };

  const { error } = await supabase.from('map_event_join_requests').upsert(
    {
      event_id: eventId,
      user_uid: userUid,
      created_at: new Date().toISOString(),
    },
    { ignoreDuplicates: true, onConflict: 'event_id,user_uid' },
  );
  if (error) {
    if (isPolicyBlockedError(error)) throw new Error('Você foi banido deste chat.');
    throw new Error(isMissingTableError(error) ? schemaCacheMessage('map_event_join_requests') : error.message);
  }
  return { alreadyJoined: false };
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
  if (error) throw new Error(error.message || 'Não consegui excluir o chat.');
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
    if (demoBansState[input.eventId]?.has(input.senderUid)) throw new Error('Você foi banido deste chat.');
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

  const { data: banRows, error: banError } = await supabase
    .from('map_event_bans')
    .select('user_uid')
    .eq('event_id', input.eventId)
    .eq('user_uid', input.senderUid)
    .limit(1);
  if (banError && !isMissingTableError(banError) && !isPolicyBlockedError(banError)) throw new Error(banError.message);
  if ((banRows ?? []).length > 0) throw new Error('Você foi banido deste chat.');

  let messageId = '';
  const rpcResult = await supabase.rpc('send_map_event_message_secure', {
    target_event_id: input.eventId,
    message_text: cleanText,
    message_type_value: input.image ? 'image' : 'text',
    image_url_value: input.image?.imageURL ?? '',
    image_path_value: input.image?.imagePath ?? '',
    view_once_value: input.image?.viewOnce ?? false,
  });
  if (rpcResult.error) {
    throw new Error(rpcResult.error.message || 'Não consegui enviar a mensagem.');
  }

  const rpcData = rpcResult.data as { id?: string }[] | { id?: string } | null;
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  messageId = row?.id ?? '';

  supabase.functions.invoke('send-map-event-push', {
    body: {
      eventId: input.eventId,
      messageId,
      senderName: input.senderName,
      senderUid: input.senderUid,
      text: cleanText,
    },
  }).then(({ error: pushError }) => {
    if (pushError) console.warn('Nao consegui enviar push do chat local', pushError);
  });
}

export async function markMapEventMessageImageViewed(message: MapEventMessage, viewerUid: string) {
  if (isDemoMode || message.senderUid === viewerUid || message.viewedBy.includes(viewerUid)) return;

  const rpcResult = await supabase.rpc('mark_map_event_image_viewed', {
    target_message_id: message.id,
  });

  if (rpcResult.error) throw new Error(rpcResult.error.message || 'Não consegui marcar a imagem como vista.');
}


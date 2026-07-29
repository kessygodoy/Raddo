import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { demoLikedBy, demoMatches, demoProfiles, isDemoMode } from '../demoData';
import type { Match, Message, UserProfile } from '../types';
import { distanceKm } from '../utils/geo';
import { signedProfilePhotoUrl, withSignedProfilePhotos } from '../storageImages';
import { deleteCachedChatMedia, deleteCachedChatMediaKeys } from '../chatMediaCache';

type MatchRow = {
  id: string;
  users: string[];
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
  connection_type: 'romantic' | 'friendship' | null;
};

type MessageRow = {
  id: string;
  sender_uid: string;
  text: string;
  match_id: string;
  message_type: 'image' | 'text' | null;
  image_url: string | null;
  image_path: string | null;
  view_once: boolean | null;
  viewed_by: string[] | null;
  created_at: string;
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

export type ProfileInteraction = {
  profile: UserProfile;
  type: 'like' | 'dislike' | 'friendship';
  createdAt: string;
};

export type FriendshipPrompt = {
  profile: UserProfile;
  createdAt: string;
};

export type MatchUpgradeRequest = {
  matchId: string;
  requesterUid: string;
  status: 'accepted' | 'declined' | 'pending';
  createdAt: string;
  respondedAt: string | null;
};

export type CrossedProfile = {
  profile: UserProfile;
  crossedAt: string;
  lastCrossedAt: string;
  distanceMeters: number;
};

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    users: row.users,
    createdAt: row.created_at,
    lastMessage: row.last_message ?? '',
    lastMessageAt: row.last_message_at,
    connectionType: row.connection_type ?? 'romantic',
  };
}

function rowToMessage(row: MessageRow): Message {
  const imagePath = row.image_path ?? '';
  const imageURL = row.image_url ?? imagePath;
  return {
    id: row.id,
    senderUid: row.sender_uid,
    text: row.text,
    matchId: row.match_id,
    messageType: row.message_type ?? 'text',
    imageURL,
    imagePath,
    viewOnce: Boolean(row.view_once),
    viewedBy: row.viewed_by ?? [],
    createdAt: row.created_at,
  };
}

async function withSignedMessageImage(message: Message) {
  if (message.messageType !== 'image') return message;
  const imageSource = message.imagePath || message.imageURL;
  if (!imageSource) return message;
  return {
    ...message,
    imagePath: message.imagePath || imageSource,
    imageURL: await signedProfilePhotoUrl(imageSource, { encryptedCache: false }),
  };
}

function chatMessageCacheKey(message: Message) {
  return message.messageType === 'image' && !message.viewOnce ? message.imagePath || message.imageURL : '';
}

function messagesCacheKey(matchId: string) {
  return `raddo-match-messages-cache:${matchId}`;
}

function readCachedMessages(matchId: string) {
  try {
    const saved = window.localStorage.getItem(messagesCacheKey(matchId));
    return saved ? JSON.parse(saved) as Message[] : [];
  } catch {
    return [];
  }
}

function writeCachedMessages(matchId: string, messages: Message[]) {
  try {
    window.localStorage.setItem(messagesCacheKey(matchId), JSON.stringify(messages.slice(-250)));
  } catch {
    // Cache is best-effort only.
  }
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

function matchProfilesCacheKey(uid: string) {
  return `raddo-match-profiles-cache:${uid}`;
}

function readCachedMatchProfiles(uid: string) {
  try {
    const saved = window.localStorage.getItem(matchProfilesCacheKey(uid));
    if (!saved) return {};
    const parsed = JSON.parse(saved) as Record<string, UserProfile>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCachedMatchProfiles(uid: string, profilesByUid: Record<string, UserProfile>) {
  try {
    window.localStorage.setItem(matchProfilesCacheKey(uid), JSON.stringify(profilesByUid));
  } catch {
    // Cache is best-effort only.
  }
}

async function fetchMatches(uid: string) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const matches = ((data ?? []) as MatchRow[]).filter((row) => row.users.includes(uid)).map(rowToMatch);
  const matchIds = matches.filter((match) => match.lastMessage && match.lastMessageAt).map((match) => match.id);
  if (matchIds.length === 0) return matches;

  const { data: messageRows } = await supabase
    .from('messages')
    .select('match_id,sender_uid,created_at')
    .in('match_id', matchIds)
    .order('created_at', { ascending: false })
    .limit(Math.max(100, matchIds.length * 3));

  const senderByMatch = new Map<string, string>();
  ((messageRows ?? []) as Array<{ created_at: string; match_id: string; sender_uid: string }>).forEach((message) => {
    if (!senderByMatch.has(message.match_id)) senderByMatch.set(message.match_id, message.sender_uid);
  });

  return matches.map((match) => ({
    ...match,
    lastMessageSenderUid: senderByMatch.get(match.id),
  }));
}

function matchesCacheKey(uid: string) {
  return `raddo-connections-matches:${uid}`;
}

function readCachedMatches(uid: string) {
  try {
    const saved = window.localStorage.getItem(matchesCacheKey(uid));
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Match[];
    return Array.isArray(parsed)
      ? parsed.map((match) => ({ ...match, connectionType: match.connectionType ?? 'romantic' }))
      : [];
  } catch {
    return [];
  }
}

function writeCachedMatches(uid: string, matches: Match[]) {
  const compactMatches = matches.slice(0, 50).map((match) => ({
    id: match.id,
    users: match.users,
    createdAt: match.createdAt,
    lastMessage: match.lastMessage,
    lastMessageAt: match.lastMessageAt,
    lastMessageSenderUid: match.lastMessageSenderUid,
    connectionType: match.connectionType,
  }));
  try {
    window.localStorage.setItem(matchesCacheKey(uid), JSON.stringify(compactMatches));
  } catch {
    try {
      window.localStorage.removeItem(matchesCacheKey(uid));
      window.localStorage.setItem(matchesCacheKey(uid), JSON.stringify(compactMatches.slice(0, 20)));
    } catch {
      // Cache is best-effort only.
    }
  }
}

export function useMatches(uid?: string) {
  const [matches, setMatches] = useState<Match[]>([]);
  const lastLoadedCountRef = useRef(0);

  useEffect(() => {
    if (isDemoMode) {
      setMatches(demoMatches);
      return undefined;
    }

    if (!uid) {
      setMatches([]);
      return undefined;
    }

    let active = true;
    const currentUid = uid;
    const cachedMatches = readCachedMatches(currentUid);
    if (cachedMatches.length > 0) {
      lastLoadedCountRef.current = cachedMatches.length;
      setMatches(cachedMatches);
    }

    async function loadMatches() {
      try {
        let nextMatches = await fetchMatches(currentUid);
        if (nextMatches.length === 0 && lastLoadedCountRef.current > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          if (!active) return;
          nextMatches = await fetchMatches(currentUid);
        }
        if (active) {
          lastLoadedCountRef.current = nextMatches.length;
          setMatches(nextMatches);
          writeCachedMatches(currentUid, nextMatches);
        }
      } catch (error) {
        console.error('Não consegui carregar matches', error);
      }
    }

    loadMatches();

    const channel = supabase
      .channel(`matches:${currentUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, loadMatches)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `to_uid=eq.${currentUid}` }, loadMatches)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `from_uid=eq.${currentUid}` }, loadMatches)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `from_uid=eq.${currentUid}` }, loadMatches)
      .subscribe();
    const refreshTimer = window.setInterval(loadMatches, 4000);
    const handleFocus = () => loadMatches();
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return matches;
}

export function useMessages(matchId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!matchId) {
      setMessages([]);
      return undefined;
    }

    if (isDemoMode) {
      const otherUid = matchId.split('_').find((uid) => uid !== 'demo-user') ?? 'demo-profile-1';
      setMessages([
        {
          id: `${matchId}-demo-1`,
          senderUid: otherUid,
          text: 'Oi, vi seu perfil no Raddo.',
          matchId,
          messageType: 'text',
          imageURL: '',
          imagePath: '',
          viewOnce: false,
          viewedBy: [],
          createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        },
        {
          id: `${matchId}-demo-2`,
          senderUid: 'demo-user',
          text: 'Oi! Tambem apareceu match aqui.',
          matchId,
          messageType: 'text',
          imageURL: '',
          imagePath: '',
          viewOnce: false,
          viewedBy: [],
          createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        },
        {
          id: `${matchId}-demo-3`,
          senderUid: otherUid,
          text: 'Legal, você está por perto?',
          matchId,
          messageType: 'text',
          imageURL: '',
          imagePath: '',
          viewOnce: false,
          viewedBy: [],
          createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
        },
      ]);
      return undefined;
    }

    let active = true;
    const currentMatchId = matchId;
    const cachedMessages = readCachedMessages(currentMatchId);
    if (cachedMessages.length > 0) setMessages(cachedMessages);

    async function loadMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Nao consegui carregar mensagens', error);
        return;
      }

      const nextMessages = await Promise.all(((data ?? []) as MessageRow[]).map((row) => withSignedMessageImage(rowToMessage(row))));
      if (active) {
        setMessages((current) => {
          const nextIds = new Set(nextMessages.map((message) => message.id));
          void deleteCachedChatMediaKeys(current.filter((message) => !nextIds.has(message.id)).map(chatMessageCacheKey));
          writeCachedMessages(currentMatchId, nextMessages);
          return nextMessages;
        });
      }
    }

    loadMessages();

    function upsertMessage(row: MessageRow) {
      const nextMessage = rowToMessage(row);
      withSignedMessageImage(nextMessage).then((signedMessage) => {
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        byId.set(signedMessage.id, signedMessage);
        const nextMessages = [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        writeCachedMessages(currentMatchId, nextMessages);
        return nextMessages;
      });
      });
    }

    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            upsertMessage(payload.new as MessageRow);
            return;
          }
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as Partial<MessageRow>)?.id;
            if (deletedId) {
              setMessages((current) => {
                const deleted = current.find((message) => message.id === deletedId);
                if (deleted) void deleteCachedChatMedia(chatMessageCacheKey(deleted));
                const nextMessages = current.filter((message) => message.id !== deletedId);
                writeCachedMessages(currentMatchId, nextMessages);
                return nextMessages;
              });
            }
          }
          loadMessages();
        },
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
  }, [matchId]);

  return messages;
}

export function useMatchUpgradeRequest(matchId?: string) {
  const [request, setRequest] = useState<MatchUpgradeRequest | null>(null);

  useEffect(() => {
    if (!matchId || isDemoMode) {
      setRequest(null);
      return undefined;
    }

    let active = true;

    async function loadRequest() {
      const { data, error } = await supabase
        .from('match_upgrade_requests')
        .select('match_id,requester_uid,status,created_at,responded_at')
        .eq('match_id', matchId)
        .maybeSingle();
      if (!active || error) return;
      if (!data) {
        setRequest(null);
        return;
      }
      setRequest({
        matchId: data.match_id as string,
        requesterUid: data.requester_uid as string,
        status: data.status as MatchUpgradeRequest['status'],
        createdAt: data.created_at as string,
        respondedAt: (data.responded_at as string | null) ?? null,
      });
    }

    void loadRequest();
    const channel = supabase
      .channel(`match-upgrade-request:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_upgrade_requests', filter: `match_id=eq.${matchId}` },
        loadRequest,
      )
      .subscribe();
    const refreshTimer = window.setInterval(loadRequest, 5000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  return request;
}

export function useIncomingMatchUpgradeRequests(uid?: string) {
  const [requests, setRequests] = useState<MatchUpgradeRequest[]>([]);

  useEffect(() => {
    if (!uid || isDemoMode) {
      setRequests([]);
      return undefined;
    }

    let active = true;

    async function loadRequests() {
      const { data, error } = await supabase
        .from('match_upgrade_requests')
        .select('match_id,requester_uid,status,created_at,responded_at')
        .eq('status', 'pending')
        .neq('requester_uid', uid)
        .order('created_at', { ascending: false });
      if (!active || error) return;
      setRequests(
        (data ?? []).map((row) => ({
          matchId: row.match_id as string,
          requesterUid: row.requester_uid as string,
          status: row.status as MatchUpgradeRequest['status'],
          createdAt: row.created_at as string,
          respondedAt: (row.responded_at as string | null) ?? null,
        })),
      );
    }

    void loadRequests();
    const channel = supabase
      .channel(`incoming-match-upgrades:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_upgrade_requests' }, loadRequests)
      .subscribe();
    const refreshTimer = window.setInterval(loadRequests, 5000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return requests;
}

export function useMatchProfiles(matches: Match[], currentUid: string) {
  const [profilesByUid, setProfilesByUid] = useState<Record<string, UserProfile>>(() => readCachedMatchProfiles(currentUid));

  const otherUids = useMemo(
    () => [...new Set(matches.map((match) => match.users.find((uid) => uid !== currentUid) ?? match.users[0]).filter(Boolean))],
    [currentUid, matches],
  );

  useEffect(() => {
    setProfilesByUid(readCachedMatchProfiles(currentUid));
  }, [currentUid]);

  useEffect(() => {
    if (otherUids.length === 0) {
      setProfilesByUid({});
      return undefined;
    }

    if (isDemoMode) {
      setProfilesByUid(
        Object.fromEntries(
          demoProfiles.filter((profile) => otherUids.includes(profile.uid)).map((profile) => [profile.uid, profile]),
        ),
      );
      return undefined;
    }

    let active = true;

    async function loadProfiles() {
      setProfilesByUid((current) => {
        const cached = readCachedMatchProfiles(currentUid);
        const next = { ...cached, ...current };
        return Object.fromEntries(otherUids.map((uid) => [uid, next[uid]]).filter((entry): entry is [string, UserProfile] => Boolean(entry[1])));
      });

      const { data, error } = await supabase.from('profiles').select('*').in('id', otherUids);
      if (!active) return;
      if (error) return;
      const signedProfiles = await Promise.all(((data ?? []) as ProfileRow[]).map((row) => withSignedProfilePhotos(rowToProfile(row))));
      if (!active) return;
      setProfilesByUid((current) => {
        const next = { ...current, ...Object.fromEntries(signedProfiles.map((profile) => [profile.uid, profile])) };
        writeCachedMatchProfiles(currentUid, next);
        return next;
      });
    }

    loadProfiles();

    return () => {
      active = false;
    };
  }, [currentUid, otherUids]);

  return profilesByUid;
}

export function useProfileConnectionCount(uid?: string) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) {
      setCount(null);
      return undefined;
    }
    if (isDemoMode) {
      setCount(demoMatches.filter((match) => match.users.includes(uid)).length);
      return undefined;
    }

    let active = true;
    setCount(null);
    void supabase.rpc('profile_connection_count', { target_uid: uid }).then(({ data, error }) => {
      if (!active || error) return;
      setCount(Number(data ?? 0));
    });

    return () => {
      active = false;
    };
  }, [uid]);

  return count;
}

export function useFriendshipPrompts(uid?: string) {
  const [prompts, setPrompts] = useState<FriendshipPrompt[]>([]);

  useEffect(() => {
    if (isDemoMode || !uid) {
      setPrompts([]);
      return undefined;
    }

    let active = true;
    const currentUid = uid;

    async function loadPrompts() {
      const { data: requests, error: requestsError } = await supabase
        .from('friend_requests')
        .select('from_uid,created_at')
        .eq('to_uid', currentUid)
        .order('created_at', { ascending: true });

      if (!active || requestsError) return;
      const requestRows = requests ?? [];
      const requesterIds = requestRows.map((request) => request.from_uid as string);
      if (requesterIds.length === 0) {
        setPrompts([]);
        return;
      }

      const { data: likes, error: likesError } = await supabase
        .from('likes')
        .select('to_uid')
        .eq('from_uid', currentUid)
        .in('to_uid', requesterIds);
      if (!active || likesError) return;

      const likedRequesterIds = new Set((likes ?? []).map((like) => like.to_uid as string));
      const eligibleRequests = requestRows.filter((request) => likedRequesterIds.has(request.from_uid as string));
      if (eligibleRequests.length === 0) {
        setPrompts([]);
        return;
      }

      const eligibleIds = eligibleRequests.map((request) => request.from_uid as string);
      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').in('id', eligibleIds);
      if (!active || profilesError) return;

      const signedProfiles = await Promise.all(
        ((profiles ?? []) as ProfileRow[]).map((row) => withSignedProfilePhotos(rowToProfile(row))),
      );
      if (!active) return;
      const profilesByUid = Object.fromEntries(signedProfiles.map((profile) => [profile.uid, profile]));
      setPrompts(
        eligibleRequests
          .map((request) => ({
            createdAt: request.created_at as string,
            profile: profilesByUid[request.from_uid as string],
          }))
          .filter((prompt): prompt is FriendshipPrompt => Boolean(prompt.profile)),
      );
    }

    void loadPrompts();
    const channel = supabase
      .channel(`friendship-prompts:${currentUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `to_uid=eq.${currentUid}` }, loadPrompts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `from_uid=eq.${currentUid}` }, loadPrompts)
      .subscribe();
    const refreshTimer = window.setInterval(loadPrompts, 4000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return prompts;
}

export function useSortedMatches(matches: Match[]) {
  return useMemo(
    () =>
      [...matches].sort((a, b) => {
        const aTime = Date.parse(a.lastMessageAt ?? a.createdAt ?? '') || 0;
        const bTime = Date.parse(b.lastMessageAt ?? b.createdAt ?? '') || 0;
        return bTime - aTime;
      }),
    [matches],
  );
}

export async function sendLike(fromUid: string, toUid: string) {
  if (isDemoMode) {
    return demoLikedBy.some((profile) => profile.uid === toUid);
  }

  const { data, error } = await supabase.rpc('like_profile', { target_uid: toUid });
  if (!error) return Boolean(data);

  const message = error.message || error.details || error.hint || error.code || '';
  if (!message.toLowerCase().includes('schema cache') && !message.toLowerCase().includes('like_profile')) {
    throw new Error(message || 'Não consegui registrar o like.');
  }

  return sendLikeFallback(fromUid, toUid);
}

async function sendLikeFallback(fromUid: string, toUid: string) {
  const now = new Date().toISOString();
  const { error: likeError } = await supabase.from('likes').upsert(
    {
      from_uid: fromUid,
      to_uid: toUid,
      created_at: now,
    },
    { onConflict: 'from_uid,to_uid' },
  );

  if (likeError) {
    throw new Error(likeError.message || 'Não consegui salvar o like.');
  }

  const { data: reciprocalLike, error: reciprocalError } = await supabase
    .from('likes')
    .select('from_uid')
    .eq('from_uid', toUid)
    .eq('to_uid', fromUid)
    .maybeSingle();

  if (reciprocalError) {
    throw new Error(reciprocalError.message || 'Não consegui verificar match.');
  }

  if (!reciprocalLike) return false;

  const users = [fromUid, toUid].sort();
  const { error: matchError } = await supabase.from('matches').upsert(
    {
      id: users.join('_'),
      users,
      created_at: now,
      last_message: 'Match criado',
      last_message_at: now,
    },
    { onConflict: 'id' },
  );

  if (matchError) {
    throw new Error(matchError.message || 'Não consegui criar o match.');
  }

  return true;
}

export async function sendDislike(fromUid: string, toUid: string) {
  if (isDemoMode) return;

  const { error } = await supabase.from('passes').upsert(
    {
      from_uid: fromUid,
      to_uid: toUid,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'from_uid,to_uid' },
  );

  if (error) throw new Error(error.message || 'Não consegui registrar o dislike.');
}

export async function sendFriendRequest(fromUid: string, toUid: string) {
  if (isDemoMode) return toUid.endsWith('1') || toUid.endsWith('3');

  const { data, error } = await supabase.rpc('connect_friend_profile', { target_uid: toUid });
  if (error) throw new Error(error.message || 'Não consegui enviar o pedido de amizade.');
  return Boolean(data);
}

export async function declineFriendRequest(requesterUid: string) {
  if (isDemoMode) return;
  const { error } = await supabase.rpc('decline_friend_request', { requester_uid: requesterUid });
  if (error) throw new Error(error.message || 'NÃ£o consegui recusar o convite de amizade.');
}

export async function requestMatchUpgrade(matchId: string, senderUid: string, senderName: string) {
  if (isDemoMode) return;
  const { error } = await supabase.rpc('request_match_upgrade', { target_match_id: matchId });
  if (error) throw new Error(error.message || 'Não consegui enviar o pedido para evoluir a amizade.');

  void supabase.functions.invoke('send-match-push', {
    body: {
      kind: 'match_upgrade',
      matchId,
      senderName,
      senderUid,
      text: 'quer evoluir a amizade para match.',
    },
  }).then(({ error: pushError }) => {
    if (pushError) console.warn('Nao consegui enviar push do pedido de match', pushError);
  });
}

export async function respondMatchUpgrade(matchId: string, accept: boolean) {
  if (isDemoMode) return accept;
  const { data, error } = await supabase.rpc('respond_match_upgrade', {
    accept_request: accept,
    target_match_id: matchId,
  });
  if (error) throw new Error(error.message || 'Não consegui responder ao pedido de match.');
  return Boolean(data);
}

export async function unmatchProfile(currentUid: string, otherUid: string, matchId: string) {
  if (isDemoMode) return;

  await supabase.from('passes').upsert(
    {
      from_uid: currentUid,
      to_uid: otherUid,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'from_uid,to_uid' },
  );

  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) throw new Error(error.message || 'Não consegui desfazer o match.');
}

export async function blockProfile(currentUid: string, blockedUid: string, matchId?: string) {
  if (isDemoMode) return;

  const now = new Date().toISOString();
  const { error: blockError } = await supabase.from('blocks').upsert(
    {
      blocker_uid: currentUid,
      blocked_uid: blockedUid,
      created_at: now,
    },
    { onConflict: 'blocker_uid,blocked_uid' },
  );

  if (blockError) throw new Error(blockError.message || 'Não consegui bloquear essa pessoa.');

  await supabase.from('passes').upsert(
    {
      from_uid: currentUid,
      to_uid: blockedUid,
      created_at: now,
    },
    { onConflict: 'from_uid,to_uid' },
  );

  if (matchId) {
    const { error: matchError } = await supabase.from('matches').delete().eq('id', matchId);
    if (matchError) throw new Error(matchError.message || 'Pessoa bloqueada, mas não consegui remover o match.');
  }
}

export async function unblockProfile(currentUid: string, blockedUid: string) {
  if (isDemoMode) return;

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_uid', currentUid)
    .eq('blocked_uid', blockedUid);

  if (error) throw new Error(error.message || 'Não consegui desbloquear essa pessoa.');
}

async function loadRecentReportedProfileMessages(reporterUid: string, reportedUid: string) {
  const { data: matchRows } = await supabase
    .from('matches')
    .select('id')
    .contains('users', [reporterUid, reportedUid])
    .limit(1);
  const matchId = matchRows?.[0]?.id as string | undefined;
  if (!matchId) return [];

  const { data } = await supabase
    .from('messages')
    .select('id,sender_uid,text,message_type,image_url,image_path,created_at')
    .eq('match_id', matchId)
    .eq('sender_uid', reportedUid)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []).map((message) => ({
    id: message.id,
    createdAt: message.created_at,
    imagePath: message.image_path,
    imageUrl: message.image_url,
    messageType: message.message_type,
    senderUid: message.sender_uid,
    text: message.text,
  }));
}

export async function reportProfile(reporterUid: string, reportedUid: string, reason = 'reported_profile') {
  if (isDemoMode) return;

  const recentMessages = await loadRecentReportedProfileMessages(reporterUid, reportedUid);
  const { error } = await supabase.from('reports').insert({
    reporter_uid: reporterUid,
    reported_uid: reportedUid,
    reason,
    recent_messages: recentMessages,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message || 'Não consegui enviar a denúncia.');
}

export function useBlockedProfileIds(uid?: string) {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isDemoMode) {
      setBlockedIds(new Set());
      return undefined;
    }

    if (!uid) {
      setBlockedIds(new Set());
      return undefined;
    }

    let active = true;

    async function loadBlocks() {
      const [{ data: blockedByMe }, { data: blockedMe }] = await Promise.all([
        supabase.from('blocks').select('blocked_uid').eq('blocker_uid', uid),
        supabase.from('blocks').select('blocker_uid').eq('blocked_uid', uid),
      ]);

      if (!active) return;
      setBlockedIds(
        new Set([
          ...(blockedByMe ?? []).map((item) => item.blocked_uid as string),
          ...(blockedMe ?? []).map((item) => item.blocker_uid as string),
        ]),
      );
    }

    loadBlocks();

    const channel = supabase
      .channel(`blocks:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `blocker_uid=eq.${uid}` }, loadBlocks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `blocked_uid=eq.${uid}` }, loadBlocks)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return blockedIds;
}

export function useBlockedProfiles(uid?: string) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (isDemoMode || !uid) {
      setProfiles([]);
      return undefined;
    }

    let active = true;

    async function loadBlockedProfiles() {
      const { data: blocks } = await supabase.from('blocks').select('blocked_uid').eq('blocker_uid', uid);
      const ids = (blocks ?? []).map((item) => item.blocked_uid as string);

      if (ids.length === 0) {
        if (active) setProfiles([]);
        return;
      }

      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      if (!active) return;
      const signedProfiles = await Promise.all(((data ?? []) as ProfileRow[]).map((row) => withSignedProfilePhotos(rowToProfile(row))));
      if (active) setProfiles(signedProfiles);
    }

    loadBlockedProfiles();

    const channel = supabase
      .channel(`blocked-profiles:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `blocker_uid=eq.${uid}` }, loadBlockedProfiles)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return profiles;
}

export function useSeenProfileIds(uid?: string) {
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isDemoMode) {
      setSeenIds(new Set());
      return undefined;
    }

    if (!uid) {
      setSeenIds(new Set());
      return undefined;
    }

    let active = true;

    async function loadSeen() {
      const [{ data: likes }, { data: passes }, { data: friendships }] = await Promise.all([
        supabase.from('likes').select('to_uid').eq('from_uid', uid),
        supabase.from('passes').select('to_uid').eq('from_uid', uid),
        supabase.from('friend_requests').select('to_uid').eq('from_uid', uid),
      ]);

      if (!active) return;
      setSeenIds(
        new Set([
          ...(likes ?? []).map((item) => item.to_uid as string),
          ...(passes ?? []).map((item) => item.to_uid as string),
          ...(friendships ?? []).map((item) => item.to_uid as string),
        ]),
      );
    }

    loadSeen();

    const channel = supabase
      .channel(`seen:${uid}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `from_uid=eq.${uid}` }, loadSeen)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `from_uid=eq.${uid}` }, loadSeen)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `from_uid=eq.${uid}` }, loadSeen)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return seenIds;
}

export function useProfileInteractionStatus(fromUid?: string, toUid?: string) {
  const [hasInteraction, setHasInteraction] = useState<boolean | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setHasInteraction(false);
      return undefined;
    }

    if (!fromUid || !toUid || fromUid === toUid) {
      setHasInteraction(false);
      return undefined;
    }

    let active = true;

    async function loadInteraction() {
      const [likesResult, passesResult, friendshipsResult] = await Promise.all([
        supabase.from('likes').select('to_uid').eq('from_uid', fromUid).eq('to_uid', toUid).limit(1),
        supabase.from('passes').select('to_uid').eq('from_uid', fromUid).eq('to_uid', toUid).limit(1),
        supabase.from('friend_requests').select('to_uid').eq('from_uid', fromUid).eq('to_uid', toUid).limit(1),
      ]);

      if (!active) return;
      if (likesResult.error && passesResult.error && friendshipsResult.error) {
        setHasInteraction(null);
        return;
      }
      setHasInteraction(Boolean(likesResult.data?.length || passesResult.data?.length || friendshipsResult.data?.length));
    }

    setHasInteraction(null);
    void loadInteraction();

    const channel = supabase
      .channel(`profile-interaction-status:${fromUid}:${toUid}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `from_uid=eq.${fromUid}` }, loadInteraction)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `from_uid=eq.${fromUid}` }, loadInteraction)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `from_uid=eq.${fromUid}` }, loadInteraction)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [fromUid, toUid]);

  return hasInteraction;
}

export function useProfileInteractions(uid?: string) {
  const [interactions, setInteractions] = useState<ProfileInteraction[]>([]);

  useEffect(() => {
    if (isDemoMode) {
      setInteractions([]);
      return undefined;
    }

    if (!uid) {
      setInteractions([]);
      return undefined;
    }

    let active = true;

    async function loadInteractions() {
      const [{ data: likes }, { data: passes }, { data: friendships }] = await Promise.all([
        supabase.from('likes').select('to_uid,created_at').eq('from_uid', uid),
        supabase.from('passes').select('to_uid,created_at').eq('from_uid', uid),
        supabase.from('friend_requests').select('to_uid,created_at').eq('from_uid', uid),
      ]);

      const rawInteractions = [
        ...(likes ?? []).map((item) => ({ uid: item.to_uid as string, type: 'like' as const, createdAt: item.created_at as string })),
        ...(passes ?? []).map((item) => ({ uid: item.to_uid as string, type: 'dislike' as const, createdAt: item.created_at as string })),
        ...(friendships ?? []).map((item) => ({ uid: item.to_uid as string, type: 'friendship' as const, createdAt: item.created_at as string })),
      ];
      const ids = [...new Set(rawInteractions.map((interaction) => interaction.uid))];

      if (ids.length === 0) {
        if (active) setInteractions([]);
        return;
      }

      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
      const signedProfiles = await Promise.all(((profiles ?? []) as ProfileRow[]).map((row) => withSignedProfilePhotos(rowToProfile(row))));
      const profilesById = new Map(signedProfiles.map((profile) => [profile.uid, profile]));

      if (!active) return;

      setInteractions(
        rawInteractions
          .map((interaction) => {
            const profile = profilesById.get(interaction.uid);
            return profile ? { profile, type: interaction.type, createdAt: interaction.createdAt } : null;
          })
          .filter(Boolean)
          .sort((a, b) => Date.parse(b!.createdAt) - Date.parse(a!.createdAt)) as ProfileInteraction[],
      );
    }

    loadInteractions();

    const channel = supabase
      .channel(`profile-interactions:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `from_uid=eq.${uid}` }, loadInteractions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `from_uid=eq.${uid}` }, loadInteractions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `from_uid=eq.${uid}` }, loadInteractions)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return interactions;
}

export async function undoProfileInteraction(currentUid: string, targetUid: string) {
  if (isDemoMode) return;

  const [{ error: likeError }, { error: passError }, { error: friendshipError }] = await Promise.all([
    supabase.from('likes').delete().eq('from_uid', currentUid).eq('to_uid', targetUid),
    supabase.from('passes').delete().eq('from_uid', currentUid).eq('to_uid', targetUid),
    supabase.from('friend_requests').delete().eq('from_uid', currentUid).eq('to_uid', targetUid),
  ]);

  if (likeError) throw new Error(likeError.message || 'Não consegui desfazer a curtida.');
  if (passError) throw new Error(passError.message || 'Não consegui desfazer a recusa.');
  if (friendshipError) throw new Error(friendshipError.message || 'Não consegui desfazer a conexão de amizade.');

  const matchId = [currentUid, targetUid].sort().join('_');
  await supabase.from('matches').delete().eq('id', matchId);
}

export async function trySendLike(me: UserProfile, toUid: string) {
  if (!me.isPremium) {
    const today = new Date().toISOString().slice(0, 10);
    const usedToday = me.likesQuotaDate === today ? me.likesUsedToday : 0;
    const remaining = 30 + me.likesBonus - usedToday;

    if (remaining <= 0) {
      return {
        ok: false,
        message: 'Você usou suas 30 curtidas. Assista a um anúncio para liberar mais 30 ou assine o Premium.',
      };
    }

    const { error: quotaError } = await supabase
      .from('profiles')
      .update({
        likes_used_today: usedToday + 1,
        likes_quota_date: today,
      })
      .eq('id', me.uid);

    if (quotaError) {
      return {
        ok: false,
        message: `Não consegui atualizar seu limite de curtidas: ${quotaError.message}`,
      };
    }
  }

  try {
    const matched = await sendLike(me.uid, toUid);
    return { ok: true, message: '', matched };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Não consegui registrar o like: ${error.message}` : 'Não consegui registrar o like.',
    };
  }
}

export async function unlockLikeBonus(uid: string, currentBonus: number) {
  if (isDemoMode) return;

  await supabase
    .from('profiles')
    .update({ likes_bonus: currentBonus + 30 })
    .eq('id', uid);
}

export async function unlockLikedBy(uid: string) {
  if (isDemoMode) return;

  const unlockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await supabase
    .from('profiles')
    .update({ liked_by_unlock_until: unlockUntil })
    .eq('id', uid);
}

export function useLikedBy(me: UserProfile | null) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (isDemoMode) {
      setProfiles(demoLikedBy);
      return undefined;
    }

    if (!me) {
      setProfiles([]);
      return undefined;
    }

    let active = true;
    const currentUid = me.uid;

    async function loadLikedBy() {
      const [{ data: likes }, { data: outgoingLikes }, { data: outgoingPasses }] = await Promise.all([
        supabase.from('likes').select('from_uid').eq('to_uid', currentUid),
        supabase.from('likes').select('to_uid').eq('from_uid', currentUid),
        supabase.from('passes').select('to_uid').eq('from_uid', currentUid),
      ]);
      const handledIds = new Set([
        ...(outgoingLikes ?? []).map((like) => like.to_uid as string),
        ...(outgoingPasses ?? []).map((pass) => pass.to_uid as string),
      ]);
      const ids = (likes ?? [])
        .map((like) => like.from_uid as string)
        .filter((uid) => !handledIds.has(uid));

      if (ids.length === 0) {
        if (active) setProfiles([]);
        return;
      }

      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      if (!active) return;

      const signedProfiles = await Promise.all(((data ?? []) as ProfileRow[]).map((row) => withSignedProfilePhotos(rowToProfile(row))));
      if (active) setProfiles(signedProfiles);
    }

    loadLikedBy();

    const channel = supabase
      .channel(`liked-by:${me.uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `to_uid=eq.${currentUid}` }, loadLikedBy)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `from_uid=eq.${currentUid}` }, loadLikedBy)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `from_uid=eq.${currentUid}` }, loadLikedBy)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [me]);

  return profiles;
}

export function useCrossedProfiles(me: UserProfile | null, nearbyProfiles: UserProfile[]) {
  const [crossedProfiles, setCrossedProfiles] = useState<CrossedProfile[]>([]);
  const savedCrossingsRef = useRef<Set<string>>(new Set());
  const eligibleCrossedIds = useMemo(() => new Set(nearbyProfiles.map((profile) => profile.uid)), [nearbyProfiles]);

  useEffect(() => {
    if (isDemoMode) {
      setCrossedProfiles(
        demoProfiles.slice(0, 3).map((profile, index) => ({
          profile,
          crossedAt: new Date(Date.now() - (index + 1) * 12 * 60 * 1000).toISOString(),
          lastCrossedAt: new Date(Date.now() - (index + 1) * 8 * 60 * 1000).toISOString(),
          distanceMeters: 180 + index * 20,
        })),
      );
      return undefined;
    }

    if (!me) {
      setCrossedProfiles([]);
      savedCrossingsRef.current.clear();
      return undefined;
    }

    let active = true;
    const currentUid = me.uid;

    async function loadCrossedProfiles() {
      const crossingRetentionStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: crossings, error } = await supabase
        .from('profile_crossings')
        .select('crossed_uid,crossed_at,last_crossed_at,distance_meters')
        .eq('user_uid', currentUid)
        .gte('last_crossed_at', crossingRetentionStart)
        .order('last_crossed_at', { ascending: false })
        .limit(30);

      if (error) {
        console.error('Nao consegui carregar pessoas cruzadas', error);
        if (active) setCrossedProfiles([]);
        return;
      }

      const ids = [...new Set((crossings ?? []).map((item) => item.crossed_uid as string))].filter((uid) =>
        eligibleCrossedIds.has(uid),
      );
      if (ids.length === 0) {
        if (active) setCrossedProfiles([]);
        return;
      }

      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
      const signedProfiles = await Promise.all(((profiles ?? []) as ProfileRow[]).map((row) => withSignedProfilePhotos(rowToProfile(row))));
      const profilesById = new Map(signedProfiles.map((profile) => [profile.uid, profile]));

      if (!active) return;

      setCrossedProfiles(
        ((crossings ?? []) as Array<{ crossed_uid: string; crossed_at: string; last_crossed_at: string; distance_meters: number | null }>)
          .map((crossing) => {
            const profile = profilesById.get(crossing.crossed_uid);
            if (!profile) return null;
            return {
              profile,
              crossedAt: crossing.crossed_at,
              lastCrossedAt: crossing.last_crossed_at,
              distanceMeters: crossing.distance_meters ?? 250,
            };
          })
          .filter(Boolean) as CrossedProfile[],
      );
    }

    loadCrossedProfiles();

    const channel = supabase
      .channel(`profile-crossings:${currentUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profile_crossings', filter: `user_uid=eq.${currentUid}` }, loadCrossedProfiles)
      .subscribe();

    const refreshTimer = window.setInterval(loadCrossedProfiles, 15000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [eligibleCrossedIds, me]);

  useEffect(() => {
    if (isDemoMode || !me?.location) return;

    const uniqueNearbyProfiles = [...new Map(nearbyProfiles.map((profile) => [profile.uid, profile])).values()];
    const closeProfiles = uniqueNearbyProfiles
      .filter((profile) => profile.uid !== me.uid && profile.location && eligibleCrossedIds.has(profile.uid))
      .map((profile) => ({
        profile,
        distanceMeters: Math.round(distanceKm(me.location!, profile.location!) * 1000),
      }))
      .filter((item) => item.distanceMeters <= 250);

    if (closeProfiles.length === 0) return;

    const now = new Date().toISOString();
    const existingCrossedIds = new Set(crossedProfiles.map((item) => item.profile.uid));
    const unsavedCrossings = closeProfiles.filter((item) => {
      if (existingCrossedIds.has(item.profile.uid) || savedCrossingsRef.current.has(item.profile.uid)) return false;
      savedCrossingsRef.current.add(item.profile.uid);
      return true;
    });

    if (unsavedCrossings.length === 0) return;

    supabase
      .from('profile_crossings')
      .upsert(
        unsavedCrossings.map((item) => ({
          user_uid: me.uid,
          crossed_uid: item.profile.uid,
          last_crossed_at: now,
          distance_meters: item.distanceMeters,
        })),
        { onConflict: 'user_uid,crossed_uid' },
      )
      .then(({ error }) => {
        if (error) {
          unsavedCrossings.forEach((item) => savedCrossingsRef.current.delete(item.profile.uid));
          console.error('Nao consegui salvar pessoas cruzadas', error);
        }
      });
  }, [crossedProfiles, eligibleCrossedIds, me, nearbyProfiles]);

  return crossedProfiles;
}

export async function sendMessage(
  matchId: string,
  senderUid: string,
  text: string,
  senderName = 'Raddo',
  image?: { imagePath?: string; imageURL: string; viewOnce: boolean },
) {
  if (isDemoMode) return;

  const cleanText = text.trim() || (image ? 'Imagem' : '');
  if (!cleanText) return;

  let messageId = '';
  const rpcResult = await supabase.rpc('send_match_message', {
    target_match_id: matchId,
    message_text: cleanText,
    message_type_value: image ? 'image' : 'text',
    image_url_value: image?.imageURL ?? '',
    image_path_value: image?.imagePath ?? '',
    view_once_value: image?.viewOnce ?? false,
  });

  if (rpcResult.error) {
    const ambiguousFunction =
      rpcResult.error.message?.includes('Could not choose the best candidate function') ||
      rpcResult.error.message?.includes('send_match_message');
    if (!ambiguousFunction || image) {
      throw new Error(rpcResult.error.message || 'Nao consegui enviar a mensagem.');
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        match_id: matchId,
        sender_uid: senderUid,
        text: cleanText,
        message_type: 'text',
        image_url: '',
        image_path: '',
        view_once: false,
        viewed_by: [],
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>();
    if (error) throw new Error(error.message || 'Nao consegui enviar a mensagem.');
    messageId = data.id;
  } else {
    const rpcData = rpcResult.data as { id?: string }[] | { id?: string } | null;
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    messageId = row?.id ?? '';
  }

  supabase.functions.invoke('send-match-push', {
    body: {
      matchId,
      messageId,
      senderName,
      senderUid,
      text: cleanText,
    },
  }).then(({ error: pushError }) => {
    if (pushError) console.warn('Nao consegui enviar push do match', pushError);
  });
}

export async function editMessage(message: Message, viewerUid: string, nextText: string) {
  const cleanText = nextText.trim();
  if (isDemoMode || message.senderUid !== viewerUid || message.messageType !== 'text' || !cleanText) return;

  const { error } = await supabase.rpc('edit_match_message', {
    next_text: cleanText,
    target_message_id: message.id,
  });
  if (error) throw new Error(error.message || 'Não consegui editar a mensagem.');
}

export async function deleteMessage(message: Message, viewerUid: string) {
  if (isDemoMode || message.senderUid !== viewerUid) return;
  void deleteCachedChatMedia(chatMessageCacheKey(message));

  const rpcResult = await supabase.rpc('delete_match_message', {
    target_message_id: message.id,
  });

  if (rpcResult.error) throw new Error(rpcResult.error.message || 'Nao consegui excluir a mensagem.');
}

export async function markMessageImageViewed(message: Message, viewerUid: string) {
  if (isDemoMode || message.senderUid === viewerUid || message.viewedBy.includes(viewerUid)) return;

  const rpcResult = await supabase.rpc('mark_match_image_viewed', {
    target_message_id: message.id,
  });
  if (rpcResult.error) throw new Error(rpcResult.error.message || 'Nao consegui marcar a imagem como vista.');
}

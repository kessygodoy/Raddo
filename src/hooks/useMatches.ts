import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { demoLikedBy, demoMatches, demoProfiles, isDemoMode } from '../demoData';
import type { Match, Message, UserProfile } from '../types';

type MatchRow = {
  id: string;
  users: string[];
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
};

type MessageRow = {
  id: string;
  sender_uid: string;
  text: string;
  match_id: string;
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
  visibility_radius: number;
  age: number | null;
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

export type ProfileInteraction = {
  profile: UserProfile;
  type: 'like' | 'dislike';
  createdAt: string;
};

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    users: row.users,
    createdAt: row.created_at,
    lastMessage: row.last_message ?? '',
    lastMessageAt: row.last_message_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    senderUid: row.sender_uid,
    text: row.text,
    matchId: row.match_id,
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
    age: row.age ?? 18,
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

async function fetchMatches(uid: string) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as MatchRow[]).filter((row) => row.users.includes(uid)).map(rowToMatch);
}

export function useMatches(uid?: string) {
  const [matches, setMatches] = useState<Match[]>([]);

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

    async function loadMatches() {
      try {
        const nextMatches = await fetchMatches(currentUid);
        if (active) setMatches(nextMatches);
      } catch (error) {
        console.error('Não consegui carregar matches', error);
        if (active) setMatches([]);
      }
    }

    loadMatches();

    const channel = supabase
      .channel(`matches:${currentUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, loadMatches)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `to_uid=eq.${currentUid}` }, loadMatches)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `from_uid=eq.${currentUid}` }, loadMatches)
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
          createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        },
        {
          id: `${matchId}-demo-2`,
          senderUid: 'demo-user',
          text: 'Oi! Tambem apareceu match aqui.',
          matchId,
          createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        },
        {
          id: `${matchId}-demo-3`,
          senderUid: otherUid,
          text: 'Legal, você está por perto?',
          matchId,
          createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
        },
      ]);
      return undefined;
    }

    let active = true;

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

      if (active) setMessages(((data ?? []) as MessageRow[]).map(rowToMessage));
    }

    loadMessages();

    function upsertMessage(row: MessageRow) {
      const nextMessage = rowToMessage(row);
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        byId.set(nextMessage.id, nextMessage);
        return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
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
          loadMessages();
        },
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
  }, [matchId]);

  return messages;
}

export function useMatchProfiles(matches: Match[], currentUid: string) {
  const [profilesByUid, setProfilesByUid] = useState<Record<string, UserProfile>>({});

  const otherUids = useMemo(
    () => [...new Set(matches.map((match) => match.users.find((uid) => uid !== currentUid) ?? match.users[0]).filter(Boolean))],
    [currentUid, matches],
  );

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
      const { data } = await supabase.from('profiles').select('*').in('id', otherUids);
      if (!active) return;
      setProfilesByUid(Object.fromEntries(((data ?? []) as ProfileRow[]).map((row) => [row.id, rowToProfile(row)])));
    }

    loadProfiles();

    return () => {
      active = false;
    };
  }, [otherUids]);

  return profilesByUid;
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

export async function reportProfile(reporterUid: string, reportedUid: string, reason = 'reported_profile') {
  if (isDemoMode) return;

  const { error } = await supabase.from('reports').insert({
    reporter_uid: reporterUid,
    reported_uid: reportedUid,
    reason,
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
      setProfiles(((data ?? []) as ProfileRow[]).map(rowToProfile));
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
      const [{ data: likes }, { data: passes }] = await Promise.all([
        supabase.from('likes').select('to_uid').eq('from_uid', uid),
        supabase.from('passes').select('to_uid').eq('from_uid', uid),
      ]);

      if (!active) return;
      setSeenIds(
        new Set([
          ...(likes ?? []).map((item) => item.to_uid as string),
          ...(passes ?? []).map((item) => item.to_uid as string),
        ]),
      );
    }

    loadSeen();

    const channel = supabase
      .channel(`seen:${uid}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `from_uid=eq.${uid}` }, loadSeen)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes', filter: `from_uid=eq.${uid}` }, loadSeen)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return seenIds;
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
      const [{ data: likes }, { data: passes }] = await Promise.all([
        supabase.from('likes').select('to_uid,created_at').eq('from_uid', uid),
        supabase.from('passes').select('to_uid,created_at').eq('from_uid', uid),
      ]);

      const rawInteractions = [
        ...(likes ?? []).map((item) => ({ uid: item.to_uid as string, type: 'like' as const, createdAt: item.created_at as string })),
        ...(passes ?? []).map((item) => ({ uid: item.to_uid as string, type: 'dislike' as const, createdAt: item.created_at as string })),
      ];
      const ids = [...new Set(rawInteractions.map((interaction) => interaction.uid))];

      if (ids.length === 0) {
        if (active) setInteractions([]);
        return;
      }

      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
      const profilesById = new Map(((profiles ?? []) as ProfileRow[]).map((row) => [row.id, rowToProfile(row)]));

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

  const [{ error: likeError }, { error: passError }] = await Promise.all([
    supabase.from('likes').delete().eq('from_uid', currentUid).eq('to_uid', targetUid),
    supabase.from('passes').delete().eq('from_uid', currentUid).eq('to_uid', targetUid),
  ]);

  if (likeError) throw new Error(likeError.message || 'Não consegui desfazer a curtida.');
  if (passError) throw new Error(passError.message || 'Não consegui desfazer a recusa.');

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
      const { data: likes } = await supabase.from('likes').select('from_uid').eq('to_uid', currentUid);
      const ids = (likes ?? []).map((like) => like.from_uid as string);

      if (ids.length === 0) {
        if (active) setProfiles([]);
        return;
      }

      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      if (!active) return;

      setProfiles(
        (data ?? []).map((row) => ({
          uid: row.id,
          displayName: row.display_name,
          photoURL: row.photo_url,
          photos: row.photos ?? [row.photo_url],
          location:
            typeof row.lat === 'number' && typeof row.lng === 'number'
              ? { lat: row.lat, lng: row.lng }
              : null,
          privacyMode: row.privacy_mode,
          visibilityRadius: row.visibility_radius,
          age: row.age ?? 18,
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
        })),
      );
    }

    loadLikedBy();

    const channel = supabase
      .channel(`liked-by:${me.uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `to_uid=eq.${currentUid}` }, loadLikedBy)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [me]);

  return profiles;
}

export async function sendMessage(matchId: string, senderUid: string, text: string, senderName = 'Raddo') {
  if (isDemoMode) return;

  const cleanText = text.trim();
  if (!cleanText) return;

  const now = new Date().toISOString();
  const { data: messageData, error: messageError } = await supabase
    .from('messages')
    .insert({
      sender_uid: senderUid,
      text: cleanText,
      match_id: matchId,
      created_at: now,
    })
    .select('id')
    .single<{ id: string }>();

  if (messageError) throw new Error(messageError.message || 'Nao consegui enviar a mensagem.');

  await supabase
    .from('matches')
    .update({
      last_message: cleanText,
      last_message_at: now,
    })
    .eq('id', matchId);

  const { error: pushError } = await supabase.functions.invoke('send-match-push', {
    body: {
      matchId,
      messageId: messageData?.id,
      senderName,
      senderUid,
      text: cleanText,
    },
  });
  if (pushError) console.warn('Nao consegui enviar push do match', pushError);
}

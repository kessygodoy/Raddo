import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { demoProfiles, isDemoMode } from '../demoData';
import type { GenderFilter, GenderIdentity, PrivacyMode, Sexuality, UserProfile } from '../types';
import { isWithinRadius } from '../utils/geo';
import { useBlockedProfileIds, useSeenProfileIds } from './useMatches';

type ProfileRow = {
  id: string;
  display_name: string;
  photo_url: string;
  photos: string[] | null;
  lat: number | null;
  lng: number | null;
  privacy_mode: PrivacyMode;
  appear_in_cards: boolean | null;
  show_distance: boolean | null;
  show_online_status: boolean | null;
  visibility_radius: number;
  age: number | null;
  gender: GenderIdentity;
  gender_identities: UserProfile['genderIdentities'] | null;
  sexualities: Sexuality[] | null;
  looking_for: GenderIdentity[] | null;
  interested_sexualities: Sexuality[] | null;
  interests: UserProfile['interests'] | null;
  relationship_goals: UserProfile['relationshipGoals'] | null;
  min_age_preference: number | null;
  max_age_preference: number | null;
  last_seen: string | null;
  bio: string | null;
  is_premium: boolean | null;
  likes_used_today: number | null;
  likes_quota_date: string | null;
  likes_bonus: number | null;
  liked_by_unlock_until: string | null;
};

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    uid: row.id,
    displayName: row.display_name,
    photoURL: row.photo_url,
    photos: row.photos ?? [row.photo_url],
    location:
      typeof row.lat === 'number' && typeof row.lng === 'number'
        ? { lat: row.lat, lng: row.lng }
        : null,
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
    minAgePreference: row.min_age_preference ?? 18,
    maxAgePreference: row.max_age_preference ?? 60,
    lastSeen: row.last_seen,
    bio: row.bio ?? '',
    isPremium: Boolean(row.is_premium),
    likesUsedToday: row.likes_used_today ?? 0,
    likesQuotaDate: row.likes_quota_date,
    likesBonus: row.likes_bonus ?? 0,
    likedByUnlockUntil: row.liked_by_unlock_until,
  };
}

function hasAnyOverlap(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((item) => b.includes(item));
}

function isAgeCompatible(me: UserProfile, profile: UserProfile) {
  const meAge = me.age ?? 18;
  const profileAge = profile.age ?? 18;
  const myMin = me.minAgePreference ?? 18;
  const myMax = me.maxAgePreference ?? 99;
  const theirMin = profile.minAgePreference ?? 18;
  const theirMax = profile.maxAgePreference ?? 99;

  return profileAge >= myMin && profileAge <= myMax && meAge >= theirMin && meAge <= theirMax;
}

export function useNearbyProfiles(me: UserProfile | null, genderFilter: GenderFilter) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [overrideProfileIds, setOverrideProfileIds] = useState<Set<string>>(new Set());
  const blockedIds = useBlockedProfileIds(me?.uid);
  const seenIds = useSeenProfileIds(me?.uid);

  useEffect(() => {
    if (isDemoMode) {
      setProfiles(demoProfiles);
      return undefined;
    }

    if (!me) return undefined;
    let active = true;
    const currentUid = me.uid;

    async function loadProfiles() {
      const { data } = await supabase.from('profiles').select('*').neq('id', currentUid);
      if (active) setProfiles(((data ?? []) as ProfileRow[]).map(rowToProfile));
    }

    loadProfiles();

    const channel = supabase
      .channel('profiles:list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadProfiles)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [me]);

  useEffect(() => {
    if (isDemoMode) {
      setOverrideProfileIds(new Set());
      return undefined;
    }

    if (!me) {
      setOverrideProfileIds(new Set());
      return undefined;
    }

    let active = true;

    async function loadOverrideProfileIds() {
      const { data, error } = await supabase.rpc('raddo_visible_profile_override_uids');
      if (!active) return;
      if (error) {
        setOverrideProfileIds(new Set());
        return;
      }
      setOverrideProfileIds(new Set((data ?? []) as string[]));
    }

    loadOverrideProfileIds();

    return () => {
      active = false;
    };
  }, [me]);

  return useMemo(() => {
    if (!me) return [];

    return profiles
      .filter((profile) => {
        const isOverride = overrideProfileIds.has(profile.uid);
        if (blockedIds.has(profile.uid)) return false;
        if (isOverride) return true;

        return (
          isWithinRadius(me, profile) &&
          profile.appearInCards &&
          !seenIds.has(profile.uid) &&
          (genderFilter.length === 0 || profile.genderIdentities.some((gender) => genderFilter.includes(gender))) &&
          isAgeCompatible(me, profile) &&
          profile.lookingFor.some((gender) => me.genderIdentities.includes(gender)) &&
          me.lookingFor.some((gender) => profile.genderIdentities.includes(gender)) &&
          hasAnyOverlap(profile.interestedSexualities, me.sexualities) &&
          hasAnyOverlap(me.interestedSexualities, profile.sexualities)
        );
      });
  }, [blockedIds, genderFilter, me, overrideProfileIds, profiles, seenIds]);
}

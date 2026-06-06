import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { demoProfiles, isDemoMode } from '../demoData';
import type { GenderFilter, GenderIdentity, PrivacyMode, Sexuality, UserProfile } from '../types';
import { isWithinRadius } from '../utils/geo';
import { useBlockedProfileIds, useSeenProfileIds } from './useMatches';
import { withSignedProfilePhotos } from '../storageImages';

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
  created_at: string | null;
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
    createdAt: row.created_at,
  };
}

export function profileQualityScore(profile: UserProfile) {
  let score = 0;
  if (profile.photoURL) score += 2;
  if (profile.photos.length >= 3) score += 1;
  if (profile.bio.trim().length >= 40) score += 1;
  if (profile.sexualities.length > 0) score += 1;
  if (profile.lookingFor.length > 0) score += 1;
  if (profile.interests.length >= 3) score += 1;
  if (profile.relationshipGoals.length > 0) score += 1;
  if (profile.createdAt) {
    const accountAgeDays = (Date.now() - Date.parse(profile.createdAt)) / (24 * 60 * 60 * 1000);
    if (accountAgeDays >= 7) score += 1;
    if (accountAgeDays >= 30) score += 1;
  }
  return score;
}

function profileGenderIdentities(profile: UserProfile) {
  return profile.genderIdentities.length ? profile.genderIdentities : [profile.gender];
}

export function matchesGenderPreferences(me: UserProfile, profile: UserProfile, genderFilter: GenderFilter = me.lookingFor) {
  const wantedByMe = genderFilter.length ? genderFilter : me.lookingFor;
  const targetGenders = profileGenderIdentities(profile);
  const myGenders = profileGenderIdentities(me);

  return (
    wantedByMe.length > 0 &&
    wantedByMe.some((gender) => targetGenders.includes(gender)) &&
    profile.lookingFor.some((gender) => myGenders.includes(gender))
  );
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
      const nextProfiles = await Promise.all(((data ?? []) as ProfileRow[]).map((row) => withSignedProfilePhotos(rowToProfile(row))));
      if (active) setProfiles(nextProfiles);
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

        return (
          (isOverride || isWithinRadius(me, profile)) &&
          profile.appearInCards &&
          !seenIds.has(profile.uid) &&
          matchesGenderPreferences(me, profile, genderFilter)
        );
      });
  }, [blockedIds, genderFilter, me, overrideProfileIds, profiles, seenIds]);
}

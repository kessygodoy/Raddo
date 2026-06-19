import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { demoProfile, demoUser, isDemoMode } from '../demoData';
import type { GenderIdentity, LatLng, PrivacyMode, Sexuality, UserProfile } from '../types';
import { withSignedProfilePhotos } from '../storageImages';
import { distanceKm } from '../utils/geo';

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
  gender_identities: GenderIdentity[] | null;
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
  const location: LatLng | null =
    typeof row.lat === 'number' && typeof row.lng === 'number'
      ? { lat: row.lat, lng: row.lng }
      : null;

  const profile = {
    uid: row.id,
    displayName: row.display_name,
    photoURL: row.photo_url,
    photos: row.photos?.filter(Boolean) ?? (row.photo_url ? [row.photo_url] : []),
    location,
    privacyMode: row.privacy_mode,
    appearInCards: row.appear_in_cards ?? true,
    showDistance: row.show_distance ?? true,
    showOnlineStatus: row.show_online_status ?? true,
    visibilityRadius: row.visibility_radius,
    age: row.age ?? 18,
    gender: row.gender,
    genderIdentities: row.gender_identities ?? [row.gender],
    sexualities: row.sexualities ?? [],
    lookingFor: row.looking_for ?? ['man', 'woman', 'couple'],
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
  return profile;
}

function createEmptyProfile(user: User) {
  const emailName = user.email?.split('@')[0] || 'Novo radar';
  const metadata = user.user_metadata ?? {};
  const googleName = typeof metadata.full_name === 'string' ? metadata.full_name : metadata.name;
  const googlePhoto = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : metadata.picture;
  const displayName = typeof googleName === 'string' && googleName.trim() ? googleName : emailName;
  const photoURL = typeof googlePhoto === 'string' && googlePhoto.trim() ? googlePhoto : '';

  return {
    id: user.id,
    display_name: displayName,
    photo_url: photoURL,
    photos: photoURL ? [photoURL] : [],
    privacy_mode: 'nearby' as PrivacyMode,
    appear_in_cards: true,
    show_distance: true,
    show_online_status: true,
    visibility_radius: 5,
    age: 18,
    gender: 'man' as GenderIdentity,
    gender_identities: ['man'] as GenderIdentity[],
    sexualities: [],
    looking_for: ['man', 'woman', 'couple'] as GenderIdentity[],
    interested_sexualities: [],
    interests: [],
    relationship_goals: [],
    min_age_preference: 18,
    max_age_preference: 60,
    bio: '',
    is_premium: false,
    likes_used_today: 0,
    likes_quota_date: new Date().toISOString().slice(0, 10),
    likes_bonus: 0,
    liked_by_unlock_until: null,
    last_seen: new Date().toISOString(),
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const source = error as { message?: string; details?: string; hint?: string; code?: string };
    return [source.message, source.details, source.hint, source.code].filter(Boolean).join(' | ');
  }
  return 'Não foi possível carregar seu perfil.';
}

function authProfileCacheKey(uid: string) {
  return `raddo-auth-profile-cache:${uid}`;
}

export function readCachedAuthProfile(uid: string) {
  try {
    const saved = window.localStorage.getItem(authProfileCacheKey(uid));
    if (!saved) return null;
    const parsed = JSON.parse(saved) as UserProfile;
    return parsed?.uid === uid ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedAuthProfile(profile: UserProfile) {
  try {
    window.localStorage.setItem(authProfileCacheKey(profile.uid), JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent('raddo:auth-profile-updated', { detail: profile }));
  } catch {
    // Cache is best-effort only.
  }
}

async function loadOrCreateProfile(user: User) {
  const { data: activeBan, error: banError } = await supabase
    .from('app_bans')
    .select('reason')
    .eq('banned_uid', user.id)
    .maybeSingle<{ reason: string }>();

  if (banError && banError.code !== '42P01' && banError.code !== '42703') throw banError;

  if (!banError && activeBan) {
    await supabase.auth.signOut();
    throw new Error(`Sua conta foi banida do Raddo. Motivo: ${activeBan.reason || 'violação das regras'}.`);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  if (data) {
    const profile = await withSignedProfilePhotos(rowToProfile(data));
    writeCachedAuthProfile(profile);
    return profile;
  }

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert(createEmptyProfile(user))
    .select('*')
    .single<ProfileRow>();

  if (createError) {
    const { data: ensured, error: ensureError } = await supabase.rpc('ensure_profile').single<ProfileRow>();
    if (ensureError) throw ensureError;
    const profile = await withSignedProfilePhotos(rowToProfile(ensured));
    writeCachedAuthProfile(profile);
    return profile;
  }

  const profile = await withSignedProfilePhotos(rowToProfile(created));
  writeCachedAuthProfile(profile);
  return profile;
}

export function useAuthProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const lastSavedLocationRef = useRef<{ location: LatLng; savedAt: number } | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setUser(demoUser as User);
      setProfile(demoProfile);
      setLoading(false);
      setProfileLoading(false);
      setProfileError('');
      return undefined;
    }

    let active = true;

    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      if (!active) return;
      setUser(sessionData.session?.user ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser((currentUser) => {
        if (currentUser?.id !== nextUser?.id) {
          setProfile(null);
        }
        return nextUser;
      });
      setProfileError('');
      setLoading(false);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isDemoMode) return undefined;

    if (!user) {
      setProfileLoading(false);
      setProfileError('');
      return undefined;
    }
    let active = true;
    const currentUserId = user.id;
    setProfileLoading(true);
    setProfileError('');
    const cachedProfile = readCachedAuthProfile(currentUserId);
    if (cachedProfile) {
      setProfile(cachedProfile);
      withSignedProfilePhotos(cachedProfile).then((signedProfile) => {
        if (active) setProfile(signedProfile);
      });
    }

    loadOrCreateProfile(user)
      .then((nextProfile) => {
        if (active) setProfile(nextProfile);
      })
      .catch((error) => {
        if (active) {
          setProfile(null);
          setProfileError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });

    const channel = supabase
      .channel(`profile:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${currentUserId}` },
        (payload) => {
          if (payload.new) {
            withSignedProfilePhotos(rowToProfile(payload.new as ProfileRow)).then((nextProfile) => {
              writeCachedAuthProfile(nextProfile);
              setProfile(nextProfile);
            });
          }
        },
      )
      .subscribe();

    function handleCachedProfileUpdate(event: Event) {
      const nextProfile = (event as CustomEvent<UserProfile>).detail;
      if (nextProfile?.uid === currentUserId) setProfile(nextProfile);
    }

    window.addEventListener('raddo:auth-profile-updated', handleCachedProfileUpdate);

    return () => {
      active = false;
      window.removeEventListener('raddo:auth-profile-updated', handleCachedProfileUpdate);
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (isDemoMode) return undefined;
    if (!user || !navigator.geolocation) return undefined;

    let active = true;
    const userId = user.id;

    async function handlePosition(position: GeolocationPosition, forceSave = false) {
      if (!active) return;

      const nextLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const now = Date.now();

      setProfile((currentProfile) => {
        if (!currentProfile || currentProfile.uid !== userId) return currentProfile;
        const nextProfile = { ...currentProfile, lastSeen: new Date().toISOString(), location: nextLocation };
        writeCachedAuthProfile(nextProfile);
        return nextProfile;
      });

      const previous = lastSavedLocationRef.current;
      const movedEnough = !previous || distanceKm(previous.location, nextLocation) >= 0.025;
      const oldEnough = !previous || now - previous.savedAt >= 30000;
      if (!forceSave && !movedEnough && !oldEnough) return;

      lastSavedLocationRef.current = { location: nextLocation, savedAt: now };
      await supabase
        .from('profiles')
        .update({
          lat: nextLocation.lat,
          lng: nextLocation.lng,
          last_seen: new Date().toISOString(),
        })
        .eq('id', userId);
    }

    navigator.geolocation.getCurrentPosition(
      (position) => void handlePosition(position, true),
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 10000, timeout: 5000 },
    );

    const watchId = navigator.geolocation.watchPosition(
      (position) => void handlePosition(position),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [user]);

  return useMemo(
    () => ({ user, profile, loading, profileLoading, profileError }),
    [user, profile, loading, profileError, profileLoading],
  );
}

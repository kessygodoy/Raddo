import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { demoProfile, demoUser, isDemoMode } from '../demoData';
import type { GenderIdentity, LatLng, PrivacyMode, Sexuality, UserProfile } from '../types';
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
  if (data) return withSignedProfilePhotos(rowToProfile(data));

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert(createEmptyProfile(user))
    .select('*')
    .single<ProfileRow>();

  if (createError) {
    const { data: ensured, error: ensureError } = await supabase.rpc('ensure_profile').single<ProfileRow>();
    if (ensureError) throw ensureError;
    return withSignedProfilePhotos(rowToProfile(ensured));
  }

  return withSignedProfilePhotos(rowToProfile(created));
}

export function useAuthProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

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

    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      setUser(data.user);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setProfile(null);
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
    setProfileLoading(true);
    setProfileError('');

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
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          if (payload.new) {
            withSignedProfilePhotos(rowToProfile(payload.new as ProfileRow)).then((nextProfile) => setProfile(nextProfile));
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (isDemoMode) return undefined;
    if (!user || !navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await supabase
          .from('profiles')
          .update({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            last_seen: new Date().toISOString(),
          })
          .eq('id', user.id);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user]);

  return useMemo(
    () => ({ user, profile, loading, profileLoading, profileError }),
    [user, profile, loading, profileError, profileLoading],
  );
}

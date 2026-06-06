import { supabase } from './supabase';
import type { UserProfile } from './types';

const PROFILE_BUCKET = 'profile-photos';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function profilePhotoPathFromValue(value: string) {
  if (!value) return '';
  if (!value.startsWith('http')) return value.replace(/^profile-photos\//, '');

  try {
    const url = new URL(value);
    const marker = `/storage/v1/object/public/${PROFILE_BUCKET}/`;
    const privateMarker = `/storage/v1/object/sign/${PROFILE_BUCKET}/`;
    if (url.pathname.includes(privateMarker)) return decodeURIComponent(url.pathname.split(privateMarker)[1] ?? '');
    if (url.pathname.includes(marker)) return decodeURIComponent(url.pathname.split(marker)[1] ?? '');
  } catch {
    return '';
  }

  return '';
}

export async function signedProfilePhotoUrl(value: string) {
  const path = profilePhotoPathFromValue(value);
  if (!path) return value;

  const { data, error } = await supabase.storage.from(PROFILE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return value;
  return data.signedUrl;
}

export async function signedProfilePhotoUrls(values: string[]) {
  return Promise.all(values.filter(Boolean).map((value) => signedProfilePhotoUrl(value)));
}

export async function uploadProfilePhoto(path: string, file: File) {
  const { error } = await supabase.storage.from(PROFILE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw error;
  return signedProfilePhotoUrl(path);
}

export async function withSignedProfilePhotos(profile: UserProfile) {
  const [photoURL, photos] = await Promise.all([
    signedProfilePhotoUrl(profile.photoURL),
    signedProfilePhotoUrls(profile.photos),
  ]);

  return {
    ...profile,
    photoURL,
    photos: photos.length ? photos : photoURL ? [photoURL] : [],
  };
}

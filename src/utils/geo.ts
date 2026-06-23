import type { LatLng, UserProfile } from '../types';

const EARTH_RADIUS_KM = 6371;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

export function distanceKm(a: LatLng, b: LatLng) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function formatPersonDistanceKm(distance: number) {
  if (!Number.isFinite(distance)) return 'Distância indisponível';
  const safeDistanceKm = Math.max(1, Math.ceil(distance));
  return `${safeDistanceKm.toLocaleString('pt-BR')} km`;
}

export function offsetLocation(origin: LatLng, radiusKm: number, seed: string) {
  const clampedRadius = Math.max(0.02, Math.min(radiusKm, 500));
  const hash = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const angle = ((hash * 137.508) % 360) * (Math.PI / 180);
  const distance = clampedRadius * (0.35 + (hash % 45) / 100);
  const angularDistance = distance / EARTH_RADIUS_KM;
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(angle),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(angle) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

export function visibleLocation(profile: UserProfile) {
  if (!profile.location) return null;
  if (profile.privacyMode === 'city') {
    return {
      lat: Math.round(profile.location.lat * 10) / 10,
      lng: Math.round(profile.location.lng * 10) / 10,
    };
  }
  if (profile.privacyMode !== 'exact') return null;
  return profile.location;
}

export function isWithinRadius(me: UserProfile, other: UserProfile) {
  if (!me.location || !other.location) return false;
  const maxRadius = Math.min(me.visibilityRadius || 10, other.visibilityRadius || 10);
  return distanceKm(me.location, other.location) <= maxRadius;
}

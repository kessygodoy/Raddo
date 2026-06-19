import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Component, ReactNode } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents as useLeafletMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowRight, Camera, Eye, Flag, Heart, ImagePlus, Info, LogOut, MapPin, Megaphone, MessageCircle, Plus, Send, Settings, Sparkles, Trash2, Users, Video, X } from 'lucide-react';
import { formatRadius } from '../profileOptions';
import {
  createMapEvent,
  deleteMapEventStory,
  deleteMapEvent,
  hashMapEventPassword,
  isMapEventModerator,
  isMapEventParticipant,
  joinMapEvent,
  leaveMapEvent,
  reportMapEvent,
  reportMapEventStory,
  markMapEventStoryViewed,
  toggleMapEventStoryLike,
  requestMapEventEntry,
  createMapEventStory,
  updateMapEventDetails,
  useJoinedMapEvents,
  useMapEventCreatorNames,
  useMapEventParticipantCounts,
  useMapEventRecentActivity,
  useMapEventStories,
  useMapEvents as useLocalMapEvents,
} from '../hooks/useMapEvents';
import { useAppModeratorRole } from '../moderation';
import type { AppTheme, LatLng, MapEvent, MapEventStory, Match, UserProfile } from '../types';
import { distanceKm, formatPersonDistanceKm, visibleLocation } from '../utils/geo';
import MapEventChat from './MapEventChat';
import { isDemoMode } from '../demoData';
import { supabase } from '../supabase';
import ProfilePreview from './ProfilePreview';
import CachedMediaImage from './CachedMediaImage';
import { sendDislike, sendMessage, trySendLike } from '../hooks/useMatches';
import ExternalGpsModal from './ExternalGpsModal';
import { moderateUploadedImage } from '../imageModeration';
import { prepareStorageUploadFile, signedProfilePhotoUrl, uploadProfilePhoto } from '../storageImages';
import { useI18n } from '../i18n';

type Props = {
  matches: Match[];
  me: UserProfile;
  onOpenEventHandled?: (eventId: string) => void;
  openEventId?: string;
  profiles: UserProfile[];
  theme: AppTheme;
};

const GALLERY_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

class MapEventChatBoundary extends Component<
  { children: ReactNode; onClose: () => void; t: (key: string) => string },
  { errorMessage: string }
> {
  state = { errorMessage: '' };

  static getDerivedStateFromError(error: unknown) {
    return { errorMessage: error instanceof Error ? error.message : 'Erro ao abrir o chat.' };
  }

  componentDidCatch(error: unknown) {
    console.error('MapEventChat crashed', error);
  }

  render() {
    if (!this.state.errorMessage) return this.props.children;

    return (
      <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/70 p-4 text-white backdrop-blur-sm">
        <section className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-5 shadow-2xl">
          <h2 className="text-lg font-semibold">{this.props.t('chatOpenError')}</h2>
          <p className="mt-2 text-sm text-slate-300">{this.state.errorMessage}</p>
          <button className="mt-4 h-11 w-full rounded-lg bg-[#ff3f68] text-sm font-semibold text-white" onClick={this.props.onClose} type="button">
            {this.props.t('backToMap')}
          </button>
        </section>
      </div>
    );
  }
}

function localMapEventsCacheKey(uid: string) {
  return `raddo-local-map-events-cache:${uid}`;
}

function readLocalMapEvents(uid: string) {
  try {
    const saved = window.localStorage.getItem(localMapEventsCacheKey(uid));
    if (!saved) return [];
    const parsed = JSON.parse(saved) as MapEvent[];
    return Array.isArray(parsed)
      ? parsed.map((event) => ({
          ...event,
          coverURL: event.coverURL?.startsWith('blob:') ? '' : event.coverURL,
        }))
      : [];
  } catch {
    return [];
  }
}

function writeLocalMapEvents(uid: string, events: MapEvent[]) {
  try {
    const safeEvents = events.slice(0, 100).map((event) => ({
      ...event,
      coverURL: event.coverURL?.startsWith('blob:') ? '' : event.coverURL,
    }));
    window.localStorage.setItem(localMapEventsCacheKey(uid), JSON.stringify(safeEvents));
  } catch {
    // Cache is best-effort only.
  }
}

type MapStorySettings = {
  includeOpenEventStories: boolean;
  includeStandaloneStories: boolean;
  radiusKm: number;
};

function mapStorySettingsKey(uid: string) {
  return `raddo-map-story-settings:${uid}`;
}

function readMapStorySettings(uid: string): MapStorySettings {
  try {
    const saved = window.localStorage.getItem(mapStorySettingsKey(uid));
    if (!saved) return { includeOpenEventStories: true, includeStandaloneStories: true, radiusKm: 50 };
    const parsed = JSON.parse(saved) as Partial<MapStorySettings>;
    return {
      includeOpenEventStories: parsed.includeOpenEventStories ?? true,
      includeStandaloneStories: parsed.includeStandaloneStories ?? true,
      radiusKm: Math.min(50, Math.max(1, Number(parsed.radiusKm) || 50)),
    };
  } catch {
    return { includeOpenEventStories: true, includeStandaloneStories: true, radiusKm: 50 };
  }
}

function writeMapStorySettings(uid: string, settings: MapStorySettings) {
  try {
    window.localStorage.setItem(mapStorySettingsKey(uid), JSON.stringify(settings));
  } catch {
    // Cache is best-effort only.
  }
}

type AppDialog =
  | {
      confirmLabel?: string;
      destructive?: boolean;
      message: string;
      onConfirm: () => void | Promise<void>;
      title: string;
      type: 'confirm';
    }
  | {
      confirmLabel?: string;
      initialValue: string;
      inputKind?: 'password' | 'text' | 'textarea';
      message?: string;
      onConfirm: (value: string) => void | Promise<void>;
      title: string;
      type: 'prompt';
    };

function rememberedMapEventPasswordKey(eventId: string, userUid: string) {
  return `raddo:map-event-password:${userUid}:${eventId}`;
}

type MapPointSetter = (point: LatLng | null) => void;

const MAP_MAX_ZOOM = 19;
const MAP_SPREAD_MARKERS_ZOOM = MAP_MAX_ZOOM - 3;
const MAP_SPREAD_OVERLAP_DISTANCE_PX = 30;
const MAX_RENDERED_PROFILE_MARKERS = 80;
const MAX_RENDERED_EVENT_MARKERS = 120;
const MAX_RENDERED_STORY_GROUPS = 40;
const MAX_STORY_VIDEO_BYTES = 10 * 1024 * 1024;
const STORY_RECORDING_VIDEO_BITRATE = 1_200_000;
const STORY_RECORDING_AUDIO_BITRATE = 64_000;

function storyRecorderMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) ?? '';
}

const meIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin map-pin-me"></div>',
  iconAnchor: [8, 8],
  iconSize: [17, 17],
});

const personIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin map-pin-person"></div>',
  iconAnchor: [7, 7],
  iconSize: [14, 14],
});

const personGroupIcon = L.divIcon({
  className: '',
  html: '<div class="map-group-marker">\u{1F465}</div>',
  iconAnchor: [13, 13],
  iconSize: [25, 25],
});

const eventIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin map-pin-event"></div>',
  iconAnchor: [9, 9],
  iconSize: [18, 18],
});

const eventEmojiOptions: string[] = [];

const modernEventEmojiOptions = [
  '\u{1F4AC}',
  '\u{1F4CD}',
  '\u{2764}\u{FE0F}',
  '\u{1F495}',
  '\u{1F496}',
  '\u{1F389}',
  '\u{2728}',
  '\u{1F525}',
  '\u{1F44D}',
  '\u{1F44C}',
  '\u{1FAE1}',
  '\u{1F60E}',
  '\u{1F929}',
  '\u{1F970}',
  '\u{1F60D}',
  '\u{1F618}',
  '\u{1F60A}',
  '\u{1F44B}',
  '\u{1F91D}',
  '\u{1F64C}',
  '\u{1F64F}',
  '\u{1F440}',
  '\u{1F483}',
  '\u{1F57A}',
  '\u{1F46F}',
  '\u{1F3A7}',
  '\u{1F3A4}',
  '\u{1F3B8}',
  '\u{1F3B7}',
  '\u{1F3AC}',
  '\u{1F3A8}',
  '\u{1F4F8}',
  '\u{1F3AE}',
  '\u{1F579}\u{FE0F}',
  '\u{2615}',
  '\u{1F964}',
  '\u{1F376}',
  '\u{1F379}',
  '\u{1F378}',
  '\u{1F943}',
  '\u{1F37B}',
  '\u{1F377}',
  '\u{1F942}',
  '\u{1F37D}\u{FE0F}',
  '\u{1F354}',
  '\u{1F355}',
  '\u{1F32E}',
  '\u{1F363}',
  '\u{1F35C}',
  '\u{1F36A}',
  '\u{1F366}',
  '\u{1F382}',
  '\u{1F370}',
  '\u{26BD}',
  '\u{1F3C0}',
  '\u{1F3D0}',
  '\u{1F3BE}',
  '\u{1F3C3}',
  '\u{1F6B4}',
  '\u{1F3CB}\u{FE0F}',
  '\u{1F9D8}',
  '\u{1F3D6}\u{FE0F}',
  '\u{1F3D5}\u{FE0F}',
  '\u{1F30A}',
  '\u{1F305}',
  '\u{1F307}',
  '\u{1F319}',
  '\u{1F308}',
  '\u{1F31F}',
  '\u{1F3E0}',
  '\u{1F3EA}',
  '\u{1F3AB}',
  '\u{1F6CD}\u{FE0F}',
  '\u{1F4DA}',
  '\u{1F4BB}',
  '\u{1F4BC}',
  '\u{1F4A1}',
  '\u{1F680}',
  '\u{1F697}',
  '\u{1F682}',
  '\u{2708}\u{FE0F}',
  '\u{1F48E}',
  '\u{1F451}',
  '\u{1F9ED}',
  '\u{1F9E9}',
  '\u{1F9FF}',
  '\u{1F9CB}',
  '\u{1FAE7}',
  '\u{1FAF6}',
  '\u{1F602}',
  '\u{1F923}',
  '\u{1F972}',
  '\u{1F914}',
  '\u{1F92B}',
  '\u{1F917}',
  '\u{1F973}',
  '\u{1F47B}',
  '\u{1F47D}',
  '\u{1F916}',
  '\u{1F984}',
  '\u{1F98B}',
  '\u{1F33B}',
  '\u{1F331}',
  '\u{1FAB4}',
  '\u{1F344}',
  '\u{1F9C3}',
  '\u{1F9CB}',
  '\u{1FAD6}',
  '\u{1FAD4}',
  '\u{1FAD5}',
  '\u{1F950}',
  '\u{1F96A}',
  '\u{1F9C1}',
  '\u{1F36D}',
  '\u{1F36B}',
  '\u{1F9CA}',
  '\u{1F3AF}',
  '\u{1FA80}',
  '\u{1FA81}',
  '\u{1F3B2}',
  '\u{1F9E0}',
  '\u{1F52E}',
  '\u{1FA84}',
  '\u{1F9F8}',
  '\u{1F4A4}',
  '\u{1F4AF}',
  '\u{1F6A8}',
  '\u{1F6A9}',
  '\u{1F6F8}',
  '\u{1F6E5}\u{FE0F}',
  '\u{1F5FA}\u{FE0F}',
  '\u{1F3D9}\u{FE0F}',
  '\u{1F306}',
  '\u{1F303}',
  '\u{1F320}',
  '\u{2604}\u{FE0F}',
  '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}',
];

eventEmojiOptions.splice(0, eventEmojiOptions.length, ...modernEventEmojiOptions);
const eventEmojiQuickOptions = eventEmojiOptions.slice(0, 24);

function eventEmojiIcon(emoji: string, highlighted = false, _active = false) {
  const emojiClassName = ['map-pin-emoji', highlighted ? 'map-pin-emoji-own' : '']
    .filter(Boolean)
    .join(' ');
  if (!eventEmojiOptions.includes(emoji)) {
    return L.divIcon({
      className: '',
      html: `<div class="${emojiClassName}">\u{1F4AC}</div>`,
      iconAnchor: highlighted ? [11, 11] : [16, 16],
      iconSize: highlighted ? [22, 22] : [33, 33],
    });
  }

  const visibleEmoji = eventEmojiOptions.includes(emoji) ? emoji : '\u{1F4AC}';
  return L.divIcon({
    className: '',
    html: `<div class="${emojiClassName}">${visibleEmoji}</div>`,
    iconAnchor: highlighted ? [11, 11] : [16, 16],
    iconSize: highlighted ? [22, 22] : [33, 33],
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sharedInterestCount(me: UserProfile, profile: UserProfile) {
  if (me.interests.length === 0 || profile.interests.length === 0) return 0;
  return profile.interests.filter((interest) => me.interests.includes(interest)).length;
}

function sharedRelationshipGoalCount(me: UserProfile, profile: UserProfile) {
  if (me.relationshipGoals.length === 0 || profile.relationshipGoals.length === 0) return 0;
  return profile.relationshipGoals.filter((goal) => me.relationshipGoals.includes(goal)).length;
}

function profilePhotoIcon(photoURL: string) {
  return L.divIcon({
    className: '',
    html: `<div class="map-profile-photo"><img alt="" src="${escapeHtml(photoURL)}" onerror="this.style.display='none'" /></div>`,
    iconAnchor: [12, 12],
    iconSize: [24, 24],
  });
}

const profileLiteIcon = L.divIcon({
  className: '',
  html: '<div class="map-profile-lite"></div>',
  iconAnchor: [7, 7],
  iconSize: [14, 14],
});

const draftIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin map-pin-draft"></div>',
  iconAnchor: [10, 10],
  iconSize: [20, 20],
});

const eventGroupIcon = L.divIcon({
  className: '',
  html: '<div class="map-group-marker">\u{1F4AC}</div>',
  iconAnchor: [13, 13],
  iconSize: [25, 25],
});

function ownerEventArrowIcon(angle: number) {
  return L.divIcon({
    className: '',
    html: `<div class="map-owner-event-arrow" style="transform: rotate(${angle}deg)">âžœ</div>`,
    iconAnchor: [18, 18],
    iconSize: [36, 36],
  });
}

function MapClickTarget({ onPick, selectedPoint }: { onPick: MapPointSetter; selectedPoint: LatLng | null }) {
  useLeafletMapEvents({
    click(event) {
      onPick(selectedPoint ? null : { lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function mapShellClass(theme: AppTheme) {
  if (theme === 'light') return 'bg-slate-100';
  if (theme === 'green') return 'bg-[#eefbf1]';
  if (theme === 'pride') return 'bg-[#fff7fb]';
  return 'bg-[#07111f]';
}

function tileLayerForTheme(theme: AppTheme) {
  if (theme === 'dark') {
    return {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    };
  }

  return {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  };
}

function eventExpiresAt(event: MapEvent) {
  if (event.isPermanent) return new Date(8640000000000000);
  return new Date(Date.parse(event.createdAt) + 24 * 60 * 60 * 1000);
}

function formatEventTimeLeft(event: MapEvent) {
  if (event.isPermanent) return '';
  const msLeft = eventExpiresAt(event).getTime() - Date.now();
  if (msLeft <= 0) return 'Expirado';
  const hours = Math.floor(msLeft / (60 * 60 * 1000));
  const minutes = Math.max(1, Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000)));
  if (hours <= 0) return `Expira em ${minutes} min`;
  return `Expira em ${hours}h ${minutes}min`;
}

function clusterMapItems<T extends { position: LatLng }>(items: T[], map: L.Map, overlapDistancePx: number) {
  const clusters: Array<{ items: T[]; position: LatLng }> = [];
  const used = new Set<number>();
  const zoom = map.getZoom();
  const projected = items.map((item) => map.project(L.latLng(item.position.lat, item.position.lng), zoom));

  items.forEach((item, index) => {
    if (used.has(index)) return;

    const group = [item];
    used.add(index);

    items.forEach((candidate, candidateIndex) => {
      if (used.has(candidateIndex)) return;
      if (projected[index].distanceTo(projected[candidateIndex]) <= overlapDistancePx) {
        group.push(candidate);
        used.add(candidateIndex);
      }
    });

    const position = group.reduce(
      (acc, groupItem) => ({
        lat: acc.lat + groupItem.position.lat / group.length,
        lng: acc.lng + groupItem.position.lng / group.length,
      }),
      { lat: 0, lng: 0 },
    );

    clusters.push({ items: group, position });
  });

  return clusters;
}

function spreadClusterPositions<T extends { position: LatLng }>(cluster: { items: T[]; position: LatLng }, map: L.Map) {
  if (cluster.items.length <= 1) return cluster.items.map((item) => ({ item, position: item.position }));

  const zoom = map.getZoom();
  const centerPoint = map.project(L.latLng(cluster.position.lat, cluster.position.lng), zoom);
  const spacingPx = 38;
  const verticalSpacingPx = 0;
  const startOffset = -((cluster.items.length - 1) * spacingPx) / 2;
  const startVerticalOffset = -((cluster.items.length - 1) * verticalSpacingPx) / 2;

  return cluster.items.map((item, index) => {
    const offsetPoint = L.point(
      centerPoint.x + startOffset + index * spacingPx,
      centerPoint.y + startVerticalOffset + index * verticalSpacingPx,
    );
    const offsetLatLng = map.unproject(offsetPoint, zoom);
    return {
      item,
      position: { lat: offsetLatLng.lat, lng: offsetLatLng.lng },
    };
  });
}

function isPositionInView(map: L.Map, position: LatLng, padding = 0.08) {
  return map.getBounds().pad(padding).contains(L.latLng(position.lat, position.lng));
}

function closestToMapCenter<T extends { position: LatLng }>(items: T[], map: L.Map, maxItems: number) {
  const center = map.getCenter();
  return items
    .slice()
    .sort((a, b) => map.distance(center, L.latLng(a.position.lat, a.position.lng)) - map.distance(center, L.latLng(b.position.lat, b.position.lng)))
    .slice(0, maxItems);
}

function clusterDistanceForZoom(map: L.Map, kind: 'event' | 'profile') {
  const zoom = map.getZoom();
  if (kind === 'profile') {
    if (zoom < 12) return 72;
    if (zoom < 14) return 52;
    if (zoom < 16) return 28;
    return 14;
  }
  if (zoom < 12) return 64;
  if (zoom < 14) return 42;
  if (zoom < 16) return 22;
  return 8;
}

function edgePointForPosition(map: L.Map, position: LatLng) {
  const size = map.getSize();
  const center = L.point(size.x / 2, size.y / 2);
  const target = map.latLngToContainerPoint(L.latLng(position.lat, position.lng));
  const delta = target.subtract(center);
  const margin = 24;
  const scaleX = delta.x === 0 ? Number.POSITIVE_INFINITY : (size.x / 2 - margin) / Math.abs(delta.x);
  const scaleY = delta.y === 0 ? Number.POSITIVE_INFINITY : (size.y / 2 - margin) / Math.abs(delta.y);
  const scale = Math.min(scaleX, scaleY);
  const edge = center.add(delta.multiplyBy(scale));

  return {
    angle: Math.atan2(delta.y, delta.x) * (180 / Math.PI),
    position: map.containerPointToLatLng(edge),
  };
}

function edgeOverlayForPosition(map: L.Map, position: LatLng, margin = 30) {
  const size = map.getSize();
  const center = L.point(size.x / 2, size.y / 2);
  const target = map.latLngToContainerPoint(L.latLng(position.lat, position.lng));
  const delta = target.subtract(center);
  const availableX = Math.max(1, size.x / 2 - margin);
  const availableY = Math.max(1, size.y / 2 - margin);
  const scaleX = delta.x === 0 ? Number.POSITIVE_INFINITY : availableX / Math.abs(delta.x);
  const scaleY = delta.y === 0 ? Number.POSITIVE_INFINITY : availableY / Math.abs(delta.y);
  const scale = Math.min(scaleX, scaleY);
  const edge = center.add(delta.multiplyBy(scale));
  const safeTop = Math.max(144, Math.min(size.y * 0.28, 170));
  const safeBottom = Math.max(safeTop + 120, size.y - Math.max(112, Math.min(size.y * 0.18, 142)));

  return {
    angle: Math.atan2(delta.y, delta.x) * (180 / Math.PI),
    x: Math.min(size.x - margin, Math.max(margin, edge.x)),
    y: Math.min(safeBottom - margin, Math.max(safeTop + margin, edge.y)),
  };
}

function MyLocationArrow({ me }: { me: UserProfile }) {
  const map = useMap();
  const [arrow, setArrow] = useState<{ angle: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!me.location) {
      setArrow(null);
      return undefined;
    }

    let frame = 0;

    function updateArrow() {
      frame = 0;
      if (!me.location || isPositionInView(map, me.location)) {
        setArrow(null);
        return;
      }

      setArrow(edgeOverlayForPosition(map, me.location, 96));
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateArrow);
    }

    updateArrow();
    map.on('moveend zoomend resize', scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      map.off('moveend zoomend resize', scheduleUpdate);
    };
  }, [map, me.location]);

  if (!arrow || !me.location) return null;

  return createPortal(
    <button
      className="map-my-location-arrow"
      onClick={() => me.location && map.flyTo([me.location.lat, me.location.lng], Math.max(map.getZoom(), 15))}
      style={{ left: `${arrow.x}px`, top: `${arrow.y}px` }}
      type="button"
    >
      <span className="map-my-location-arrow-label">Eu</span>
      <span className="map-my-location-arrow-chevron" style={{ transform: `rotate(${arrow.angle - 45}deg)` }} />
    </button>,
    map.getContainer(),
  );
}

function AppDialogModal({ dialog, onClose }: { dialog: AppDialog; onClose: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(dialog.type === 'prompt' ? dialog.initialValue : '');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    const nextValue = value.trim();
    if (dialog.type === 'prompt' && !nextValue) return;
    setBusy(true);
    try {
      if (dialog.type === 'prompt') await dialog.onConfirm(nextValue);
      else await dialog.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="raddo-modal-backdrop">
      <section className="raddo-modal-card">
        <div className="raddo-modal-header">
          <div>
            <h2 className="text-lg font-semibold">{dialog.title}</h2>
            {dialog.message && <p className="mt-1 text-sm text-slate-300">{dialog.message}</p>}
          </div>
          <button aria-label={t('close')} className="raddo-icon-button" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        {dialog.type === 'prompt' && dialog.inputKind === 'textarea' && (
          <textarea
            autoFocus
            className="min-h-28 w-full resize-none rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm outline-none"
            onChange={(inputEvent) => setValue(inputEvent.target.value)}
            value={value}
          />
        )}
        {dialog.type === 'prompt' && dialog.inputKind !== 'textarea' && (
          <input
            autoFocus
            className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
            onChange={(inputEvent) => setValue(inputEvent.target.value)}
            type={dialog.inputKind === 'text' ? 'text' : 'password'}
            value={value}
          />
        )}
        <div className="raddo-modal-actions">
          <button className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className={`h-11 rounded-lg text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${
              dialog.type === 'confirm' && dialog.destructive ? 'bg-rose-400 text-white' : 'bg-teal-300 text-slate-950'
            }`}
            disabled={busy}
            onClick={handleConfirm}
            type="button"
          >
            {busy ? 'Processando...' : dialog.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  );
}

function MapFocusController({ target }: { target: { event: MapEvent; nonce: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    map.flyTo([target.event.location.lat, target.event.location.lng], Math.max(map.getZoom(), 16), {
      duration: 0.8,
    });
  }, [map, target]);

  return null;
}

function OwnerEventArrows({ events, me, onFocusEvent }: { events: MapEvent[]; me: UserProfile; onFocusEvent: (event: MapEvent) => void }) {
  const map = useMap();
  const [arrows, setArrows] = useState<Array<{ angle: number; event: MapEvent; id: string; x: number; y: number }>>([]);

  const ownerEvents = useMemo(
    () => events.filter((event) => event.creatorUid === me.uid),
    [events, me.uid],
  );

  useEffect(() => {
    let frame = 0;

    function updateArrows() {
      frame = 0;
      const next = ownerEvents
        .filter((event) => !isPositionInView(map, event.location))
        .map((event) => ({
          event,
          id: event.id,
          ...edgeOverlayForPosition(map, event.location),
        }));
      setArrows(next);
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateArrows);
    }

    updateArrows();
    map.on('moveend zoomend resize', scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      map.off('moveend zoomend resize', scheduleUpdate);
    };
  }, [map, ownerEvents]);

  if (arrows.length === 0) return null;

  return createPortal(
    <div className="map-owner-event-arrow-layer">
      {arrows.map((arrow) => (
        <button
          aria-label={`Focar chat ${arrow.event.title}`}
          className="map-owner-event-arrow"
          key={arrow.id}
          onClick={() => onFocusEvent(arrow.event)}
          style={{
            left: `${arrow.x}px`,
            top: `${arrow.y}px`,
            transform: `translate(-50%, -50%) rotate(${arrow.angle}deg)`,
          }}
          type="button"
        >
          <span className="map-owner-event-arrow-chevron" />
        </button>
      ))}
    </div>,
    map.getContainer(),
  );
}

function ClusteredProfileMarkers({ me, profiles }: { me: UserProfile; profiles: UserProfile[] }) {
  const { t } = useI18n();
  const map = useMap();
  const [, setMapVersion] = useState(0);
  useLeafletMapEvents({
    moveend: () => setMapVersion((version) => version + 1),
    zoomend: () => setMapVersion((version) => version + 1),
  });

  const zoom = map.getZoom();
  const showProfilePhotos = zoom >= 15;
  const items = closestToMapCenter(profiles
    .map((profile) => {
      const position = visibleLocation(profile);
      return position && isPositionInView(map, position, 0.04) ? { profile, position } : null;
    })
    .filter(Boolean) as Array<{ profile: UserProfile; position: LatLng }>, map, MAX_RENDERED_PROFILE_MARKERS);
  const clusters = clusterMapItems(items, map, clusterDistanceForZoom(map, 'profile'));

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.items.length > 1) {
          return (
            <Marker
              icon={personGroupIcon}
              interactive={false}
              key={`people-group-${cluster.position.lat}-${cluster.position.lng}-${cluster.items.length}`}
              keyboard={false}
              position={[cluster.position.lat, cluster.position.lng]}
              zIndexOffset={100}
            />
          );
        }

        const { profile, position } = cluster.items[0];
        return (
          <Marker icon={showProfilePhotos && profile.photoURL ? profilePhotoIcon(profile.photoURL) : profileLiteIcon} key={profile.uid} position={[position.lat, position.lng]} zIndexOffset={100}>
            <Popup>
              <strong>{profile.displayName}</strong>
              <br />
              {me.location ? t('distanceAway', { distance: formatPersonDistanceKm(distanceKm(me.location, position)) }) : t('distanceUnavailable')}
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

function ClusteredEventMarkers({
  creatorNames,
  eventParticipantCounts,
  recentlyActiveEventIds,
  events,
  me,
  onOpenCluster,
  onPreviewEvent,
}: {
  creatorNames: Record<string, string>;
  eventParticipantCounts: Record<string, number>;
  recentlyActiveEventIds: Set<string>;
  events: MapEvent[];
  me: UserProfile;
  onOpenCluster: (events: MapEvent[]) => void;
  onPreviewEvent: (event: MapEvent) => void;
}) {
  const { t } = useI18n();
  const map = useMap();
  const [, setMapVersion] = useState(0);
  useLeafletMapEvents({
    moveend: () => setMapVersion((version) => version + 1),
    zoomend: () => setMapVersion((version) => version + 1),
  });

  const visibleInBounds = closestToMapCenter(
    events
      .filter((event) => isPositionInView(map, event.location, 0.04))
      .map((event) => ({ event, position: event.location })),
    map,
    MAX_RENDERED_EVENT_MARKERS,
  ).map((item) => item.event);
  const shouldSpreadOverlappingMarkers = map.getZoom() >= MAP_SPREAD_MARKERS_ZOOM;
  const maxZoomClusters = clusterMapItems(
    visibleInBounds.map((event) => ({ event, position: event.location })),
    map,
    MAP_SPREAD_OVERLAP_DISTANCE_PX,
  );
  const permanentEvents = visibleInBounds.filter((event) => event.isPermanent);
  const expiringEvents = visibleInBounds.filter((event) => !event.isPermanent);
  const clusters = clusterMapItems(
    expiringEvents.map((event) => ({ event, position: event.location })),
    map,
    clusterDistanceForZoom(map, 'event'),
  );

  return (
    <>
      {shouldSpreadOverlappingMarkers &&
        maxZoomClusters.flatMap((cluster) =>
          spreadClusterPositions(cluster, map).map(({ item, position }) => {
            const { event } = item;
            const activeEmoji = (eventParticipantCounts[event.id] ?? 0) > 0 && recentlyActiveEventIds.has(event.id);
            return (
              <Marker
                eventHandlers={{ click: () => onPreviewEvent(event) }}
                icon={event.emoji ? eventEmojiIcon(event.emoji, event.creatorUid === me.uid, activeEmoji) : eventIcon}
                key={`max-event-${event.id}`}
                position={[position.lat, position.lng]}
                zIndexOffset={500}
              >
                <Popup>
                  <strong>{event.title}</strong>
                  <br />
                  Criado por {creatorNames[event.creatorUid] ?? 'criador do chat'}
                  <br />
                  {eventParticipantCounts[event.id] ?? 1} pessoas
                  <br />
                  {!event.isPermanent && (
                    <>
                      {formatEventTimeLeft(event)}
                      <br />
                    </>
                  )}
                  {me.location ? t('distanceAway', { distance: `${distanceKm(me.location, event.location).toFixed(1)} km` }) : t('distanceUnavailable')}
                </Popup>
              </Marker>
            );
          }),
        )}
      {!shouldSpreadOverlappingMarkers && (
        <>
      {permanentEvents.map((event) => (
        <Marker
          eventHandlers={{ click: () => onPreviewEvent(event) }}
          icon={
            event.emoji
              ? eventEmojiIcon(
                  event.emoji,
                  event.creatorUid === me.uid,
                  (eventParticipantCounts[event.id] ?? 0) > 0 && recentlyActiveEventIds.has(event.id),
                )
              : eventIcon
          }
          key={event.id}
          position={[event.location.lat, event.location.lng]}
          zIndexOffset={500}
        >
          <Popup>
            <strong>{event.title}</strong>
            <br />
            Criado por {creatorNames[event.creatorUid] ?? 'criador do chat'}
            <br />
            {eventParticipantCounts[event.id] ?? 1} pessoas
            <br />
            {me.location ? t('distanceAway', { distance: `${distanceKm(me.location, event.location).toFixed(1)} km` }) : t('distanceUnavailable')}
          </Popup>
        </Marker>
      ))}
      {clusters.map((cluster) => {
        if (cluster.items.length > 1) {
          return (
            <Marker
              eventHandlers={{ click: () => onOpenCluster(cluster.items.map((item) => item.event)) }}
              icon={eventGroupIcon}
              key={`event-group-${cluster.position.lat}-${cluster.position.lng}-${cluster.items.length}`}
              position={[cluster.position.lat, cluster.position.lng]}
              zIndexOffset={500}
            />
          );
        }

        const { event } = cluster.items[0];
        const activeEmoji = (eventParticipantCounts[event.id] ?? 0) > 0 && recentlyActiveEventIds.has(event.id);
        return (
          <Marker
            eventHandlers={{ click: () => onPreviewEvent(event) }}
            icon={event.emoji ? eventEmojiIcon(event.emoji, event.creatorUid === me.uid, activeEmoji) : eventIcon}
            key={event.id}
            position={[event.location.lat, event.location.lng]}
            zIndexOffset={500}
          >
            <Popup>
              <strong>{event.title}</strong>
              <br />
              Criado por {creatorNames[event.creatorUid] ?? 'criador do chat'}
              <br />
              {eventParticipantCounts[event.id] ?? 1} pessoas
              <br />
              {formatEventTimeLeft(event)}
              <br />
              {me.location ? t('distanceAway', { distance: `${distanceKm(me.location, event.location).toFixed(1)} km` }) : t('distanceUnavailable')}
            </Popup>
          </Marker>
        );
      })}
        </>
      )}
    </>
  );
}

export default function RadarMap({ matches, me, onOpenEventHandled, openEventId = '', profiles, theme }: Props) {
  const { t } = useI18n();
  const center = me.location ?? { lat: -23.5505, lng: -46.6333 };
  const appModeratorRole = useAppModeratorRole(me.uid);
  const canManageApp = Boolean(appModeratorRole);
  const [selectedPoint, setSelectedPoint] = useState<LatLng | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventCoverURL, setEventCoverURL] = useState('');
  const [eventEmoji, setEventEmoji] = useState(modernEventEmojiOptions[0]);
  const [eventAccessMode, setEventAccessMode] = useState<MapEvent['accessMode']>('open');
  const [eventPassword, setEventPassword] = useState('');
  const [eventIsPermanent, setEventIsPermanent] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [eventRadius, setEventRadius] = useState(5);
  const [activeEvent, setActiveEvent] = useState<MapEvent | null>(null);
  const [previewEvent, setPreviewEvent] = useState<MapEvent | null>(null);
  const [clusteredEvents, setClusteredEvents] = useState<MapEvent[]>([]);
  const [createChatOpen, setCreateChatOpen] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MapEvent | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingCoverURL, setEditingCoverURL] = useState('');
  const [editingEmoji, setEditingEmoji] = useState(modernEventEmojiOptions[0]);
  const [editingAccessMode, setEditingAccessMode] = useState<MapEvent['accessMode']>('open');
  const [editingPassword, setEditingPassword] = useState('');
  const [editingRadius, setEditingRadius] = useState(5);
  const [editingIsPermanent, setEditingIsPermanent] = useState(false);
  const [uploadingEditingCover, setUploadingEditingCover] = useState(false);
  const [savingEventEdit, setSavingEventEdit] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [showChatsList, setShowChatsList] = useState(false);
  const [showMyChatsList, setShowMyChatsList] = useState(false);
  const [showNearbyChatsList, setShowNearbyChatsList] = useState(false);
  const [showPeopleList, setShowPeopleList] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [matchProfile, setMatchProfile] = useState<UserProfile | null>(null);
  const [gpsEvent, setGpsEvent] = useState<MapEvent | null>(null);
  const [localEvents, setLocalEvents] = useState<MapEvent[]>(() => readLocalMapEvents(me.uid));
  const [focusTarget, setFocusTarget] = useState<{ event: MapEvent; nonce: number } | null>(null);
  const [eventError, setEventError] = useState('');
  const [mapNotice, setMapNotice] = useState('');
  const [pendingOpenEventId, setPendingOpenEventId] = useState('');
  const [dialog, setDialog] = useState<AppDialog | null>(null);
  const [profileActionMessage, setProfileActionMessage] = useState('');
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storySettingsOpen, setStorySettingsOpen] = useState(false);
  const [mapStorySettings, setMapStorySettings] = useState<MapStorySettings>(() => readMapStorySettings(me.uid));
  const [storyComposerEvent, setStoryComposerEvent] = useState<MapEvent | null>(null);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState('');
  const [storyText, setStoryText] = useState('');
  const [storyImageURL, setStoryImageURL] = useState('');
  const [storyUploadFile, setStoryUploadFile] = useState<File | null>(null);
  const [storyMediaType, setStoryMediaType] = useState<'image' | 'video'>('image');
  const [localPublishingStories, setLocalPublishingStories] = useState<MapEventStory[]>([]);
  const [uploadingStory, setUploadingStory] = useState(false);
  const [storyRecording, setStoryRecording] = useState(false);
  const [storyRecordingBytes, setStoryRecordingBytes] = useState(0);
  const [storyRecordingStream, setStoryRecordingStream] = useState<MediaStream | null>(null);
  const storyRecorderRef = useRef<MediaRecorder | null>(null);
  const storyRecordingChunksRef = useRef<Blob[]>([]);
  const storyRecordingBytesRef = useRef(0);
  const storyRecordingDiscardRef = useRef(false);
  const storyRecordingPreviewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setLocalEvents(readLocalMapEvents(me.uid));
    setMapStorySettings(readMapStorySettings(me.uid));
  }, [me.uid]);

  useEffect(() => {
    writeLocalMapEvents(me.uid, localEvents.filter((event) => eventExpiresAt(event).getTime() > Date.now()));
  }, [localEvents, me.uid]);

  useEffect(() => {
    writeMapStorySettings(me.uid, mapStorySettings);
  }, [mapStorySettings, me.uid]);
  const [storyProgressKey, setStoryProgressKey] = useState(0);
  const [storyProgressSeconds, setStoryProgressSeconds] = useState(7);
  const [storyPeopleModal, setStoryPeopleModal] = useState<{ title: string; userIds: string[] } | null>(null);
  const [optimisticStoryLikes, setOptimisticStoryLikes] = useState<Record<string, boolean>>({});
  const [storyLikeBursts, setStoryLikeBursts] = useState<Set<string>>(new Set());
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(() => {
    const saved = window.localStorage.getItem(`raddo:viewed-map-stories:${me.uid}`);
    if (!saved) return new Set();
    try {
      return new Set(JSON.parse(saved) as string[]);
    } catch {
      return new Set();
    }
  });
  const mapEvents = useLocalMapEvents(me);
  const joinedMapEvents = useJoinedMapEvents(me.uid);
  const visibleEvents = useMemo(
    () =>
      [...localEvents, ...mapEvents.filter((event) => !localEvents.some((local) => local.id === event.id))].filter(
        (event) => eventExpiresAt(event).getTime() > Date.now(),
      ),
    [localEvents, mapEvents],
  );
  const eventDistance = (event: MapEvent) => (me.location ? distanceKm(me.location, event.location) : Number.MAX_SAFE_INTEGER);
  const profileDistance = (profile: UserProfile) =>
    me.location && profile.location ? distanceKm(me.location, profile.location) : Number.MAX_SAFE_INTEGER;
  const sortedVisibleEvents = useMemo(() => [...visibleEvents].sort((a, b) => eventDistance(a) - eventDistance(b)), [visibleEvents, me.location]);
  const myEvents = useMemo(() => sortedVisibleEvents.filter((event) => event.creatorUid === me.uid), [sortedVisibleEvents, me.uid]);
  const joinedActiveEvents = useMemo(
    () =>
      joinedMapEvents
        .filter((event) => eventExpiresAt(event).getTime() > Date.now())
        .sort((a, b) => eventDistance(a) - eventDistance(b)),
    [joinedMapEvents, me.location],
  );
  const joinedEventIds = useMemo(() => new Set(joinedActiveEvents.map((event) => event.id)), [joinedActiveEvents]);
  const joinedOnlyEvents = useMemo(
    () => joinedActiveEvents.filter((event) => event.creatorUid !== me.uid),
    [joinedActiveEvents, me.uid],
  );
  const nearbyReachableEvents = useMemo(
    () => sortedVisibleEvents.filter((event) => eventDistance(event) <= event.radiusKm),
    [sortedVisibleEvents, me.location],
  );
  const storyRadiusEvents = useMemo(
    () => sortedVisibleEvents.filter((event) => eventDistance(event) <= mapStorySettings.radiusKm).slice(0, 120),
    [mapStorySettings.radiusKm, sortedVisibleEvents, me.location],
  );
  const storySourceEvents = useMemo(
    () => [
      ...joinedActiveEvents,
      ...(mapStorySettings.includeOpenEventStories
        ? storyRadiusEvents.filter((event) => event.accessMode === 'open' && !joinedActiveEvents.some((joined) => joined.id === event.id))
        : []),
    ],
    [joinedActiveEvents, mapStorySettings.includeOpenEventStories, storyRadiusEvents],
  );
  const currentChatModalEvents = showMyChatsList ? myEvents : showNearbyChatsList ? nearbyReachableEvents : joinedOnlyEvents;
  const eventContextList = useMemo(
    () => {
      const primaryEvents = sortedVisibleEvents.slice(0, 180);
      return [
        ...primaryEvents,
        ...joinedActiveEvents.filter((event) => !primaryEvents.some((visibleEvent) => visibleEvent.id === event.id)),
      ];
    },
    [joinedActiveEvents, sortedVisibleEvents],
  );
  const eventContextListRef = useRef(eventContextList);
  useEffect(() => {
    eventContextListRef.current = eventContextList;
  }, [eventContextList]);
  const sortedProfiles = [...profiles].sort((a, b) => {
    const goalDiff = sharedRelationshipGoalCount(me, b) - sharedRelationshipGoalCount(me, a);
    if (goalDiff !== 0) return goalDiff;
    const interestDiff = sharedInterestCount(me, b) - sharedInterestCount(me, a);
    if (interestDiff !== 0) return interestDiff;
    return profileDistance(a) - profileDistance(b);
  });
  const tileLayer = tileLayerForTheme(theme);
  const eventParticipantCounts = useMapEventParticipantCounts(eventContextList);
  const recentlyActiveEventIds = useMapEventRecentActivity(eventContextList, 30);
  const eventCreatorNames = useMapEventCreatorNames(eventContextList, me);
  const remoteMapEventStories = useMapEventStories(storySourceEvents, me, {
    includeOpenEventStories: mapStorySettings.includeOpenEventStories,
    includeStandaloneStories: mapStorySettings.includeStandaloneStories,
  });
  const mapEventStories = useMemo(
    () => {
      const visibleEventIds = new Set(storySourceEvents.map((event) => event.id));
      const canShowStory = (story: MapEventStory) => {
        if (story.creatorUid === me.uid || story.id.startsWith('local-story-')) return true;
        if (!story.eventId) return mapStorySettings.includeStandaloneStories;
        return visibleEventIds.has(story.eventId);
      };
      return [
        ...localPublishingStories.filter(canShowStory),
        ...remoteMapEventStories.filter((story) => canShowStory(story) && !localPublishingStories.some((localStory) => localStory.id === story.id)),
      ].map((story) => {
        const optimisticLiked = optimisticStoryLikes[story.id];
        if (typeof optimisticLiked !== 'boolean') return story;
        const likedBy = new Set(story.likedBy);
        if (optimisticLiked) likedBy.add(me.uid);
        else likedBy.delete(me.uid);
        return { ...story, likedBy: [...likedBy] };
      });
    },
    [localPublishingStories, mapStorySettings.includeStandaloneStories, me.uid, optimisticStoryLikes, remoteMapEventStories, storySourceEvents],
  );
  const creatorLabel = (event: MapEvent) => eventCreatorNames[event.creatorUid] ?? (event.creatorUid === me.uid ? me.displayName : 'criador do chat');
  const previewEventIsParticipant = Boolean(
    previewEvent && (previewEvent.creatorUid === me.uid || joinedEventIds.has(previewEvent.id)),
  );
  const storiesByEvent = useMemo(() => {
    const grouped = new Map<string, MapEventStory[]>();
    mapEventStories.forEach((story) => {
      if (!story.eventId) return;
      grouped.set(story.eventId, [...(grouped.get(story.eventId) ?? []), story]);
    });
    return grouped;
  }, [mapEventStories]);

  useEffect(() => {
    mapEventStories.slice(0, 24).forEach((story) => {
      if (!story.imageURL || story.mediaType === 'video') return;
      void signedProfilePhotoUrl(story.imageURL).catch(() => undefined);
      const image = new Image();
      image.src = story.imageURL;
    });
  }, [mapEventStories]);
  const storyEvents = useMemo(
    () =>
      nearbyReachableEvents
        .filter((event) => storiesByEvent.has(event.id))
        .sort((a, b) => {
          const aStory = storiesByEvent.get(a.id)?.[0];
          const bStory = storiesByEvent.get(b.id)?.[0];
          return Date.parse(bStory?.createdAt ?? '') - Date.parse(aStory?.createdAt ?? '');
        }),
    [nearbyReachableEvents, storiesByEvent],
  );
  const storyGroups = useMemo(() => {
    const grouped = new Map<string, MapEventStory[]>();
    mapEventStories.forEach((story) => {
      grouped.set(story.creatorUid, [...(grouped.get(story.creatorUid) ?? []), story]);
    });
    return [...grouped.entries()]
      .map(([creatorUid, stories]) => ({
        creatorUid,
        latestStory: stories.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0],
        stories: stories.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      }))
      .sort((a, b) => Date.parse(b.latestStory.createdAt) - Date.parse(a.latestStory.createdAt));
  }, [mapEventStories]);
  const visibleStoryGroups = useMemo(() => storyGroups.slice(0, MAX_RENDERED_STORY_GROUPS), [storyGroups]);
  const selectedStory = mapEventStories.find((story) => story.id === selectedStoryId) ?? mapEventStories[0] ?? null;
  const selectedStoryEvent = selectedStory ? eventContextList.find((event) => event.id === selectedStory.eventId) ?? null : null;
  const storyPeopleProfiles = useMemo(() => {
    const byUid = new Map<string, UserProfile>();
    [me, ...profiles].forEach((profile) => byUid.set(profile.uid, profile));
    return byUid;
  }, [me, profiles]);
  const storyViewerStories = useMemo(
    () =>
      selectedStory
        ? (storyGroups.find((group) => group.creatorUid === selectedStory.creatorUid)?.stories ?? [])
        : mapEventStories.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [mapEventStories, selectedStory, storyGroups],
  );
  const focusChatOnMap = (event: MapEvent) => {
    setFocusTarget({ event, nonce: Date.now() });
  };

  useEffect(() => {
    const openMyChats = () => {
      setShowChatsList(false);
      setShowNearbyChatsList(false);
      setShowMyChatsList(true);
    };
    const openChats = () => {
      setShowMyChatsList(false);
      setShowNearbyChatsList(false);
      setShowChatsList(true);
    };
    const openNearbyChats = () => {
      setShowChatsList(false);
      setShowMyChatsList(false);
      setShowNearbyChatsList(true);
    };
    const openPeople = () => setShowPeopleList(true);

    window.addEventListener('raddo:open-chats', openChats);
    window.addEventListener('raddo:open-my-chats', openMyChats);
    window.addEventListener('raddo:open-nearby-chats', openNearbyChats);
    window.addEventListener('raddo:open-people', openPeople);
    return () => {
      window.removeEventListener('raddo:open-chats', openChats);
      window.removeEventListener('raddo:open-my-chats', openMyChats);
      window.removeEventListener('raddo:open-nearby-chats', openNearbyChats);
      window.removeEventListener('raddo:open-people', openPeople);
    };
  }, []);

  useEffect(() => {
    if (openEventId) setPendingOpenEventId(openEventId);
  }, [openEventId]);

  useEffect(() => {
    if (!pendingOpenEventId) return undefined;

    const openPendingEvent = () => {
      const targetEvent = eventContextListRef.current.find((item) => item.id === pendingOpenEventId);
      if (!targetEvent) return false;

      setShowChatsList(false);
      setShowMyChatsList(false);
      setShowNearbyChatsList(false);
      setActiveEvent(targetEvent);
      setFocusTarget({ event: targetEvent, nonce: Date.now() });
      setMapNotice('');
      onOpenEventHandled?.(pendingOpenEventId);
      setPendingOpenEventId('');
      return true;
    };

    if (openPendingEvent()) return undefined;

    const timer = window.setTimeout(() => {
      if (openPendingEvent()) return;
      setMapNotice('Esse grupo não existe mais.');
      onOpenEventHandled?.(pendingOpenEventId);
      setPendingOpenEventId('');
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [onOpenEventHandled, pendingOpenEventId]);

  useEffect(() => {
    const handleBack = (event: Event) => {
      if (event.defaultPrevented) return;

      if (gpsEvent) {
        event.preventDefault();
        setGpsEvent(null);
        return;
      }

      if (previewProfile) {
        event.preventDefault();
        setPreviewProfile(null);
        return;
      }

      if (matchProfile) {
        event.preventDefault();
        setMatchProfile(null);
        return;
      }

      if (activeEvent) {
        event.preventDefault();
        setActiveEvent(null);
        return;
      }

      if (storyComposerOpen) {
        event.preventDefault();
        cancelStoryRecording();
        setStoryComposerOpen(false);
        setStoryComposerEvent(null);
        return;
      }

      if (storyPeopleModal) {
        event.preventDefault();
        setStoryPeopleModal(null);
        return;
      }

      if (storyViewerOpen) {
        event.preventDefault();
        setStoryViewerOpen(false);
        return;
      }

      if (previewEvent) {
        event.preventDefault();
        setPreviewEvent(null);
        return;
      }

      if (emojiPickerOpen) {
        event.preventDefault();
        setEmojiPickerOpen(false);
        return;
      }

      if (createChatOpen) {
        event.preventDefault();
        setCreateChatOpen(false);
        return;
      }

      if (clusteredEvents.length > 0) {
        event.preventDefault();
        setClusteredEvents([]);
        return;
      }

      if (showChatsList || showMyChatsList || showNearbyChatsList) {
        event.preventDefault();
        setShowChatsList(false);
        setShowMyChatsList(false);
        setShowNearbyChatsList(false);
        return;
      }

      if (showPeopleList) {
        event.preventDefault();
        setShowPeopleList(false);
      }
    };

    window.addEventListener('raddo:android-back', handleBack);

    return () => {
      window.removeEventListener('raddo:android-back', handleBack);
    };
  }, [
    activeEvent,
    clusteredEvents.length,
    createChatOpen,
    emojiPickerOpen,
    gpsEvent,
    matchProfile,
    previewEvent,
    previewProfile,
    storyComposerEvent,
    storyComposerOpen,
    storyPeopleModal,
    storyViewerOpen,
    showChatsList,
    showMyChatsList,
    showNearbyChatsList,
    showPeopleList,
  ]);

  useEffect(() => {
    if (storyRecordingPreviewRef.current) {
      storyRecordingPreviewRef.current.srcObject = storyRecordingStream;
    }
  }, [storyRecordingStream]);

  useEffect(() => {
    return () => {
      storyRecorderRef.current?.stop();
      storyRecordingStream?.getTracks().forEach((track) => track.stop());
    };
  }, [storyRecordingStream]);

  async function processStoryMediaFile(file: File) {
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

    if (mediaType === 'video') {
      setEventError('Vídeos estarão disponíveis em breve. Por enquanto, envie uma imagem.');
      setUploadingStory(false);
      setStoryMediaType('image');
      setStoryUploadFile(null);
      return;
    }

    const previewURL = URL.createObjectURL(file);
    setStoryImageURL(previewURL);
    setUploadingStory(true);
    setEventError('');
    setStoryMediaType(mediaType);

    try {
      setStoryUploadFile(file);
    } catch (error) {
      setStoryImageURL('');
      setStoryUploadFile(null);
      setEventError(error instanceof Error ? error.message : t('storySendError'));
    } finally {
      setUploadingStory(false);
    }
  }

  async function uploadStoryMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await processStoryMediaFile(file);
  }

  function stopStoryRecording() {
    storyRecordingDiscardRef.current = false;
    const recorder = storyRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }

  function cancelStoryRecording() {
    storyRecordingDiscardRef.current = true;
    storyRecorderRef.current?.stop();
    storyRecorderRef.current = null;
    storyRecordingChunksRef.current = [];
    storyRecordingBytesRef.current = 0;
    setStoryRecording(false);
    setStoryRecordingBytes(0);
    setStoryRecordingStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }

  async function startStoryRecording() {
    if (storyRecording || uploadingStory) return;
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function' || typeof MediaRecorder === 'undefined') {
      setEventError('A gravação direta não está disponível neste aparelho.');
      return;
    }

    const mimeType = storyRecorderMimeType();
    if (!mimeType) {
      setEventError('A gravação direta não está disponível neste aparelho.');
      return;
    }

    try {
      setEventError('');
      setStoryImageURL('');
      setStoryMediaType('video');
      storyRecordingDiscardRef.current = false;
      setStoryRecordingBytes(0);
      storyRecordingBytesRef.current = 0;
      storyRecordingChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: 'environment' },
          height: { ideal: 720, max: 720 },
          width: { ideal: 1280, max: 1280 },
        },
      });
      setStoryRecordingStream(stream);

      const recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: STORY_RECORDING_AUDIO_BITRATE,
        mimeType,
        videoBitsPerSecond: STORY_RECORDING_VIDEO_BITRATE,
      });
      storyRecorderRef.current = recorder;

      recorder.ondataavailable = (recordEvent) => {
        if (recordEvent.data.size <= 0) return;
        storyRecordingChunksRef.current.push(recordEvent.data);
        storyRecordingBytesRef.current += recordEvent.data.size;
        setStoryRecordingBytes(storyRecordingBytesRef.current);
        if (storyRecordingBytesRef.current >= MAX_STORY_VIDEO_BYTES && recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      recorder.onerror = () => {
        setEventError(t('recordVideoError'));
        cancelStoryRecording();
      };

      recorder.onstop = () => {
        const chunks = storyRecordingChunksRef.current;
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' });
        const file = new File([blob], `story-${Date.now()}.webm`, { type: blob.type || 'video/webm', lastModified: Date.now() });
        const discard = storyRecordingDiscardRef.current;
        storyRecorderRef.current = null;
        storyRecordingChunksRef.current = [];
        storyRecordingBytesRef.current = 0;
        storyRecordingDiscardRef.current = false;
        setStoryRecording(false);
        setStoryRecordingBytes(0);
        setStoryRecordingStream((current) => {
          current?.getTracks().forEach((track) => track.stop());
          return null;
        });
        if (!discard && file.size > 0) void processStoryMediaFile(file);
      };

      recorder.start(500);
      setStoryRecording(true);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : t('cameraAccessError'));
      cancelStoryRecording();
    }
  }

  async function publishStory() {
    setEventError('');
    const localStoryId = `local-story-${Date.now()}`;
    const publishingText = storyText.trim();
    const localStory: MapEventStory = {
      id: localStoryId,
      creatorName: me.displayName,
      creatorUid: me.uid,
      eventId: storyComposerEvent?.id ?? null,
      imageURL: storyImageURL,
      mediaType: storyMediaType,
      text: publishingText || 'Publicando...',
      likedBy: [],
      viewedBy: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    const uploadFile = storyUploadFile;
    const composerEvent = storyComposerEvent;
    const textToPublish = storyText;
    const mediaTypeToPublish = storyMediaType;
    setLocalPublishingStories((current) => [localStory, ...current]);
    setSelectedStoryId(localStoryId);
    setStoryText('');
    setStoryImageURL('');
    setStoryUploadFile(null);
    setStoryMediaType('image');
    setStoryComposerEvent(null);
    setStoryComposerOpen(false);
    setStoryViewerOpen(true);

    let uploadedImageURL = '';
    const tryPublish = async (attempt = 0): Promise<void> => {
      try {
        let finalImageURL = uploadedImageURL || localStory.imageURL;
        if (uploadFile && !isDemoMode && !uploadedImageURL) {
          const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
          const path = `${me.uid}/map-stories/${Date.now()}-${safeName}`;
          finalImageURL = await uploadProfilePhoto(path, uploadFile);
          await moderateUploadedImage({ allowRejected: false, context: 'map-chat-image', contextId: composerEvent?.id, path, publicUrl: finalImageURL });
          uploadedImageURL = finalImageURL;
        }
        await createMapEventStory({
          creatorName: me.displayName,
          creatorUid: me.uid,
          eventId: composerEvent?.id ?? null,
          imageURL: finalImageURL,
          mediaType: mediaTypeToPublish,
          text: textToPublish,
        });
        setLocalPublishingStories((current) =>
          current.map((story) => (story.id === localStoryId ? { ...story, imageURL: finalImageURL, text: textToPublish, mediaType: mediaTypeToPublish } : story)),
        );
        window.setTimeout(() => {
          setLocalPublishingStories((current) => current.filter((story) => story.id !== localStoryId));
        }, 8000);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('storyPublishError');
        const retryable =
          message.toLowerCase().includes('fetch') ||
          message.toLowerCase().includes('network') ||
          message.toLowerCase().includes('timeout') ||
          !navigator.onLine;
        if (!retryable) {
          setLocalPublishingStories((current) => current.filter((story) => story.id !== localStoryId));
          setEventError(message);
          return;
        }
        const delayMs = Math.min(30000, 4000 * 2 ** Math.min(attempt, 3));
        setEventError('Internet instável. Vou continuar tentando publicar o story automaticamente.');
        window.setTimeout(() => {
          void tryPublish(attempt + 1);
        }, delayMs);
      }
    };

    void tryPublish();
  }

  async function reportStory(story: MapEventStory) {
    const event = eventContextList.find((item) => item.id === story.eventId) ?? null;
    try {
      await reportMapEventStory(story, event, me.uid);
      setEventError('Story denunciado para revisão.');
    } catch (error) {
      setEventError(error instanceof Error ? error.message : t('storyReportError'));
    }
  }

  async function deleteStory(story: MapEventStory) {
    setDialog({
      confirmLabel: 'Apagar',
      destructive: true,
      message: 'Este story será removido do mapa.',
      onConfirm: async () => {
        try {
          await deleteMapEventStory(story.id);
          setLocalPublishingStories((current) => current.filter((item) => item.id !== story.id));
          if (selectedStoryId === story.id) {
            setStoryViewerOpen(false);
            setSelectedStoryId('');
          }
        } catch (error) {
          setEventError(error instanceof Error ? error.message : t('storyDeleteError'));
        }
      },
      title: 'Apagar story?',
      type: 'confirm',
    });
  }

  async function likeStory(story: MapEventStory) {
    const nextLiked = !story.likedBy.includes(me.uid);
    setOptimisticStoryLikes((current) => ({ ...current, [story.id]: nextLiked }));
    setStoryLikeBursts((current) => new Set(current).add(story.id));
    window.setTimeout(() => {
      setStoryLikeBursts((current) => {
        const next = new Set(current);
        next.delete(story.id);
        return next;
      });
    }, 520);
    try {
      await toggleMapEventStoryLike(story, me.uid);
    } catch (error) {
      setOptimisticStoryLikes((current) => {
        const next = { ...current };
        delete next[story.id];
        return next;
      });
      setEventError(error instanceof Error ? error.message : t('storyLikeError'));
    }
  }

  function replyToStory(story: MapEventStory) {
    const match = matches.find((item) => item.users.includes(me.uid) && item.users.includes(story.creatorUid));
    if (!match) return;
    setDialog({
      confirmLabel: 'Enviar',
      inputKind: 'textarea',
      initialValue: '',
      message: 'Envie uma mensagem para responder ao story.',
      onConfirm: async (value) => {
        const text = value.trim();
        if (!text) return;
        try {
          await sendMessage(match.id, me.uid, `Story: ${text}`, me.displayName);
          setEventError(t('messageSent'));
        } catch (error) {
          setEventError(error instanceof Error ? error.message : t('messageSendError'));
        }
      },
      title: 'Comentar story',
      type: 'prompt',
    });
  }

  function markStoryViewed(storyId: string) {
    setViewedStoryIds((current) => {
      const next = new Set(current);
      next.add(storyId);
      window.localStorage.setItem(`raddo:viewed-map-stories:${me.uid}`, JSON.stringify([...next].slice(-200)));
      return next;
    });
  }

  function openStory(storyId: string) {
    setSelectedStoryId(storyId);
    markStoryViewed(storyId);
    const story = mapEventStories.find((item) => item.id === storyId);
    if (story) void markMapEventStoryViewed(story, me.uid);
    setStoryProgressSeconds(7);
    setStoryProgressKey((current) => current + 1);
    setStoryViewerOpen(true);
  }

  function handleStoryStripPointerDown(event: { button: number; clientX: number; currentTarget: HTMLDivElement }) {
    if (event.button !== 0) return;
    const strip = event.currentTarget;
    const startX = event.clientX;
    const startScrollLeft = strip.scrollLeft;
    let moved = false;

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      const distance = moveEvent.clientX - startX;
      if (Math.abs(distance) > 4) moved = true;
      strip.scrollLeft = startScrollLeft - distance;
    }

    function finishDrag() {
      strip.dataset.dragging = moved ? 'true' : 'false';
      window.setTimeout(() => {
        delete strip.dataset.dragging;
      }, 0);
      window.removeEventListener('pointermove', handlePointerMove);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag, { once: true });
  }

  function showNextStory() {
    if (!selectedStory) return;
    const currentIndex = storyViewerStories.findIndex((story) => story.id === selectedStory.id);
    const nextStory = storyViewerStories[currentIndex + 1];
    if (!nextStory) {
      setStoryViewerOpen(false);
      return;
    }
    openStory(nextStory.id);
  }

  function showPreviousStory() {
    if (!selectedStory) return;
    const currentIndex = storyViewerStories.findIndex((story) => story.id === selectedStory.id);
    const previousStory = storyViewerStories[currentIndex - 1];
    if (!previousStory) {
      setStoryProgressKey((current) => current + 1);
      return;
    }
    openStory(previousStory.id);
  }

  function openStoryPerson(uid: string) {
    const profile = storyPeopleProfiles.get(uid);
    if (!profile) return;
    setStoryPeopleModal(null);
    setStoryViewerOpen(false);
    setPreviewProfile(profile);
  }

  useEffect(() => {
    if (!storyViewerOpen || !selectedStory) return undefined;
    if (selectedStory.mediaType === 'video') return undefined;
    const timer = window.setTimeout(showNextStory, 7000);
    return () => window.clearTimeout(timer);
  }, [selectedStory?.id, storyProgressKey, storyViewerOpen, storyViewerStories]);

  async function uploadEventCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!me.isPremium) {
      setEventError('Apenas usuários Premium podem adicionar capa ao chat.');
      event.target.value = '';
      return;
    }

    const previousCoverURL = eventCoverURL;
    const previewURL = URL.createObjectURL(file);
    setEventCoverURL(previewURL);
    setUploadingCover(true);

    if (isDemoMode) {
      setUploadingCover(false);
      event.target.value = '';
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${me.uid}/map-events/${Date.now()}-${safeName}`;
    try {
      const signedUrl = await uploadProfilePhoto(path, file);
      await moderateUploadedImage({ context: 'chat-cover', path, publicUrl: signedUrl });
      setEventCoverURL(path);
    } catch (uploadError) {
      setEventCoverURL(previousCoverURL);
      setEventError(uploadError instanceof Error ? uploadError.message : t('reportSendError'));
    }

    setUploadingCover(false);
    event.target.value = '';
  }

  async function uploadEditingEventCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editingEvent) return;

    const previousCoverURL = editingCoverURL;
    const previewURL = URL.createObjectURL(file);
    setEditingCoverURL(previewURL);
    setUploadingEditingCover(true);
    setEventError('');

    if (isDemoMode) {
      setUploadingEditingCover(false);
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${me.uid}/map-events/${Date.now()}-${safeName}`;
    try {
      const uploadFile = await prepareStorageUploadFile(file);
      const signedUrl = await uploadProfilePhoto(path, uploadFile);
      await moderateUploadedImage({ allowRejected: false, context: 'chat-cover', contextId: editingEvent.id, path, publicUrl: signedUrl });
      setEditingCoverURL(path);
    } catch (uploadError) {
      setEditingCoverURL(previousCoverURL);
      setEventError(uploadError instanceof Error ? uploadError.message : t('reportSendError'));
    } finally {
      setUploadingEditingCover(false);
    }
  }

  async function handleCreateEvent(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (creatingEvent) return;
    setEventError('');
    const title = eventTitle.trim();
    const eventLocation = me.isPremium ? (selectedPoint ?? me.location) : me.location;

    if (!title) {
      setEventError('Escolha um título para o chat.');
      return;
    }

    if (uploadingCover) {
      setEventError('Aguarde a capa terminar de enviar.');
      return;
    }

    if (!eventLocation) {
      setEventError('Ative sua localização para criar um chat.');
      return;
    }

    if (eventAccessMode === 'password' && eventPassword.trim().length < 4) {
      setEventError('A senha do chat precisa ter pelo menos 4 caracteres.');
      return;
    }

    try {
      setCreatingEvent(true);
      const passwordHash = eventAccessMode === 'password' ? await hashMapEventPassword(eventPassword) : '';
      const safeCoverURL = eventCoverURL.startsWith('blob:') ? '' : eventCoverURL;
      const created = await createMapEvent({
        title,
        description: eventDescription.trim(),
        coverURL: me.isPremium ? safeCoverURL : '',
        emoji: eventEmoji,
        accessMode: eventAccessMode,
        passwordHash,
        isPermanent: eventIsPermanent,
        isPremium: me.isPremium,
        location: eventLocation,
        creatorUid: me.uid,
        radiusKm: eventRadius,
      });
      setEventTitle('');
      setEventDescription('');
      setEventCoverURL('');
      setEventEmoji(modernEventEmojiOptions[0]);
      setEventAccessMode('open');
      setEventPassword('');
      setEventIsPermanent(false);
      setSelectedPoint(null);
      setCreateChatOpen(false);
      setLocalEvents((current) => (current.some((event) => event.id === created.id) ? current : [created, ...current]));
      setActiveEvent(created);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : t('createChatError'));
    } finally {
      setCreatingEvent(false);
    }
  }

  function openEditEvent(event: MapEvent) {
    setEventError('');
    setEditingEvent(event);
    setEditingTitle(event.title);
    setEditingDescription(event.description);
    setEditingCoverURL(event.coverURL);
    setEditingEmoji(event.emoji);
    setEditingAccessMode(event.accessMode);
    setEditingPassword('');
    setEditingRadius(event.radiusKm);
    setEditingIsPermanent(event.isPermanent);
  }

  async function handleSaveEventEdit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!editingEvent) return;

    const title = editingTitle.trim();
    if (!title) {
      setEventError('Dê um nome para o chat.');
      return;
    }
    if (editingAccessMode === 'password' && !editingEvent.passwordHash && !editingPassword.trim()) {
      setEventError('Defina uma senha para este chat.');
      return;
    }

    setSavingEventEdit(true);
    setEventError('');
    try {
      const passwordHash =
        editingAccessMode === 'password'
          ? editingPassword.trim()
            ? await hashMapEventPassword(editingPassword)
            : editingEvent.passwordHash
          : '';
      const safeEditingCoverURL = editingCoverURL.startsWith('blob:') ? editingEvent.coverURL : editingCoverURL;
      const updated = await updateMapEventDetails(editingEvent.id, {
        accessMode: editingAccessMode,
        coverURL: safeEditingCoverURL.startsWith('blob:') ? '' : safeEditingCoverURL,
        description: editingDescription.trim(),
        emoji: editingEmoji,
        isPermanent: me.isPremium && editingIsPermanent,
        passwordHash,
        radiusKm: editingRadius,
        title,
      });
      setLocalEvents((current) => current.map((event) => (event.id === updated.id ? updated : event)));
      setActiveEvent((current) => (current?.id === updated.id ? updated : current));
      setPreviewEvent((current) => (current?.id === updated.id ? updated : current));
      setEditingEvent(null);
      setEditingPassword('');
    } catch (error) {
      setEventError(error instanceof Error ? error.message : t('editChatError'));
    } finally {
      setSavingEventEdit(false);
    }
  }

  async function handleEnterEvent(event: MapEvent) {
    setEventError('');

    try {
      const joinedEvent = joinedActiveEvents.find((joined) => joined.id === event.id);
      const [isParticipant, isModerator] = await Promise.all([
        joinedEvent || event.creatorUid === me.uid ? Promise.resolve(true) : isMapEventParticipant(event.id, me.uid),
        event.creatorUid === me.uid ? Promise.resolve(false) : isMapEventModerator(event.id, me.uid),
      ]);
      const canBypassRadius = Boolean(joinedEvent) || event.creatorUid === me.uid || isParticipant || isModerator;
      if (!canBypassRadius && me.location && distanceKm(me.location, event.location) > event.radiusKm) {
        setEventError(`Você precisa estar dentro de ${formatRadius(event.radiusKm)} para entrar neste chat.`);
        return;
      }
      if (isParticipant || isModerator) {
        setPreviewEvent(null);
        setActiveEvent(joinedEvent ?? event);
        return;
      }

      if (event.accessMode === 'approval' && event.creatorUid !== me.uid) {
        const result = await requestMapEventEntry(event.id, me.uid);
        if (result.alreadyJoined) {
          setPreviewEvent(null);
          setActiveEvent(event);
          return;
        }
        setEventError('Pedido enviado. Aguarde o dono ou moderador liberar sua entrada.');
        return;
      }

      if (event.accessMode === 'password' && event.creatorUid !== me.uid) {
        const rememberedPasswordHash = window.localStorage.getItem(rememberedMapEventPasswordKey(event.id, me.uid));
        if (rememberedPasswordHash && rememberedPasswordHash === event.passwordHash) {
          await joinMapEvent(event.id, me.uid);
          setPreviewEvent(null);
          setActiveEvent(event);
          return;
        }

        setDialog({
          confirmLabel: t('enterChat'),
          initialValue: '',
          message: 'Digite a senha deste chat.',
          onConfirm: async (password) => {
            const passwordHash = await hashMapEventPassword(password);
            if (passwordHash !== event.passwordHash) {
              setEventError('Senha incorreta.');
              return;
            }
            await joinMapEvent(event.id, me.uid);
            window.localStorage.setItem(rememberedMapEventPasswordKey(event.id, me.uid), passwordHash);
            setPreviewEvent(null);
            setActiveEvent(event);
          },
          title: t('chatPassword'),
          type: 'prompt',
        });
        return;
      }

      await joinMapEvent(event.id, me.uid);
      setPreviewEvent(null);
      setActiveEvent(event);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : t('enterChatError'));
    }
  }

  async function handleLeaveEventFromList(event: MapEvent) {
    setEventError('');
    setDialog({
      confirmLabel: t('signOut'),
      destructive: true,
      message: `Você deixará de participar de "${event.title}".`,
      onConfirm: async () => {
        try {
          await leaveMapEvent(event.id, me.uid);
          if (activeEvent?.id === event.id) setActiveEvent(null);
          if (previewEvent?.id === event.id) setPreviewEvent(null);
        } catch (error) {
          setEventError(error instanceof Error ? error.message : t('leaveChatError'));
        }
      },
      title: t('leaveChatQuestion'),
      type: 'confirm',
    });
  }

  async function handleDeleteEvent(event: MapEvent) {
    setDialog({
      confirmLabel: t('delete'),
      destructive: true,
      message: 'Todas as mensagens dele serão removidas.',
      onConfirm: async () => {
        try {
          await deleteMapEvent(event.id, me.uid);
          setLocalEvents((current) => current.filter((localEvent) => localEvent.id !== event.id));
          setPreviewEvent(null);
          if (activeEvent?.id === event.id) setActiveEvent(null);
        } catch (error) {
          setEventError(error instanceof Error ? error.message : t('deleteChatError'));
        }
      },
      title: t('deleteChatQuestion'),
      type: 'confirm',
    });
  }

  async function handleReportEvent(event: MapEvent) {
    setDialog({
      confirmLabel: t('report'),
      message: t('reportChatQuestion'),
      onConfirm: async () => {
        try {
          await reportMapEvent(event, me.uid);
          setEventError('Denúncia enviada. Obrigado por ajudar a manter o Raddo seguro.');
        } catch (error) {
          setEventError(error instanceof Error ? error.message : t('reportSendError'));
        }
      },
      title: t('reportChat'),
      type: 'confirm',
    });
  }

  async function likeNearbyProfile(profile: UserProfile) {
    const result = await trySendLike(me, profile.uid);
    setProfileActionMessage(result.ok ? (result.matched ? `Deu match com ${profile.displayName}.` : `Você curtiu ${profile.displayName}.`) : result.message);
    if (result.ok) {
      setPreviewProfile(null);
      if (result.matched) setMatchProfile(profile);
    }
  }

  async function dislikeNearbyProfile(profile: UserProfile) {
    try {
      await sendDislike(me.uid, profile.uid);
      setProfileActionMessage(`Você recusou ${profile.displayName}.`);
      setPreviewProfile(null);
    } catch (error) {
      setProfileActionMessage(error instanceof Error ? error.message : t('dislikeError'));
    }
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {dialog && <AppDialogModal dialog={dialog} onClose={() => setDialog(null)} />}
      {mapNotice && (
        <div className="pointer-events-none absolute inset-x-4 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[760] flex justify-center">
          <p className="pointer-events-auto rounded-lg border border-white/10 bg-[#07111f]/95 px-4 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur">
            {mapNotice}
          </p>
        </div>
      )}
      <div className="pointer-events-none absolute left-0 right-0 top-[calc(env(safe-area-inset-top)+5.75rem)] z-[640] px-3 sm:top-[calc(env(safe-area-inset-top)+6.25rem)]">
        <div
          className="raddo-story-strip pointer-events-auto mx-auto flex max-w-4xl gap-[3px] overflow-x-auto scrollbar-hidden p-2"
          onClickCapture={(event) => {
            if ((event.currentTarget as HTMLDivElement).dataset.dragging === 'true') {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onPointerDown={handleStoryStripPointerDown}
        >
          {me.location && (
            <button
              className="raddo-story-ring raddo-story-ring-new relative mx-2 grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[#ff3f68]/15 text-[10px] font-semibold text-white"
              onClick={() => {
                setStoryComposerEvent(null);
                setStoryComposerOpen(true);
                setStoryText('');
                setStoryImageURL('');
                setStoryUploadFile(null);
                setStoryMediaType('image');
              }}
              type="button"
            >
              <span
                aria-label="Configurar stories do mapa"
                className="absolute -left-1 -top-1 z-10 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-[#07111f] text-white shadow-lg"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setStorySettingsOpen(true);
                }}
                role="button"
                tabIndex={0}
              >
                <Settings className="h-3.5 w-3.5" />
              </span>
              <Plus className="raddo-story-plus-icon h-5 w-5 text-white" />
              Story
            </button>
          )}
          {visibleStoryGroups.map((group) => {
            const latestStory = group.latestStory;
            const event = eventContextList.find((item) => item.id === latestStory.eventId);
            const allViewed = group.stories.every((story) => viewedStoryIds.has(story.id));
            return (
              <button
                className={`raddo-story-ring ${allViewed ? 'raddo-story-ring-viewed' : 'raddo-story-ring-new'} relative mx-2 grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-950 text-white`}
                key={group.creatorUid}
                onClick={(clickEvent) => {
                  if ((clickEvent.currentTarget as HTMLButtonElement).closest('.raddo-story-strip')?.getAttribute('data-dragging') === 'true') return;
                  openStory(latestStory.id);
                }}
                title={latestStory.creatorName}
                type="button"
              >
                {latestStory?.imageURL && latestStory.mediaType === 'video' ? (
                  <div className="grid h-full w-full place-items-center bg-black text-white">
                    <Video className="h-5 w-5" />
                  </div>
                ) : latestStory?.imageURL ? (
                  <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-full w-full" src={latestStory.imageURL} thumbnailOnly />
                ) : (
                  <span className="text-2xl">{event?.emoji || '\u{1F4AC}'}</span>
                )}
                {latestStory.id.startsWith('local-story-') && (
                  <span className="absolute inset-x-1 bottom-1 rounded bg-[#ff3f68] px-1 py-0.5 text-[9px] font-bold text-white">
                    Publicando...
                  </span>
                )}
                <span className="absolute mt-11 max-w-14 truncate rounded bg-black/55 px-1 text-[10px]">{latestStory.creatorName}</span>
              </button>
            );
          })}
        </div>
      </div>
      {storySettingsOpen && (
        <div className="fixed inset-0 z-[1450] grid place-items-end bg-black/60 p-4 pb-[calc(var(--raddo-bottom-safe)+16px)] backdrop-blur-sm sm:place-items-center">
          <section className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-4 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Stories do mapa</h2>
                <p className="text-xs text-slate-400">Escolha o que aparece para você.</p>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/8" onClick={() => setStorySettingsOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-2 text-xs text-slate-300">
                Raio dos stories: {formatRadius(mapStorySettings.radiusKm)}
                <input
                  max={50}
                  min={1}
                  onChange={(event) => setMapStorySettings((current) => ({ ...current, radiusKm: Number(event.target.value) }))}
                  step={1}
                  type="range"
                  value={mapStorySettings.radiusKm}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/8 p-3 text-sm">
                <span>Mostrar stories soltos no mapa</span>
                <input
                  checked={mapStorySettings.includeStandaloneStories}
                  className="h-5 w-5"
                  onChange={(event) => setMapStorySettings((current) => ({ ...current, includeStandaloneStories: event.target.checked }))}
                  type="checkbox"
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/8 p-3 text-sm">
                <span>Mostrar stories de chats abertos</span>
                <input
                  checked={mapStorySettings.includeOpenEventStories}
                  className="h-5 w-5"
                  onChange={(event) => setMapStorySettings((current) => ({ ...current, includeOpenEventStories: event.target.checked }))}
                  type="checkbox"
                />
              </label>
              <p className="rounded-lg bg-white/8 p-3 text-xs text-slate-300">
                Se desativar essas opções, ficam visíveis no mapa apenas stories dos chats em que você participa.
              </p>
            </div>
          </section>
        </div>
      )}
      {storyViewerOpen && selectedStory && (
        <div className="fixed inset-0 z-[1500] bg-black/90 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
          <section className="relative flex h-full w-full flex-col bg-[#07111f] text-white shadow-2xl">
            <div className="grid grid-flow-col gap-1 bg-black/40 p-2">
              {storyViewerStories.map((story) => (
                <div className="h-1 overflow-hidden rounded-full bg-white/15" key={story.id}>
                  {Date.parse(story.createdAt) < Date.parse(selectedStory.createdAt) ? (
                    <div className="h-full w-full bg-white/80" />
                  ) : story.id === selectedStory.id ? (
                    <div
                      className="h-full bg-[#ff3f68]"
                      key={`${selectedStory.id}-${storyProgressKey}`}
                      style={{ animation: `raddoStoryProgress ${storyProgressSeconds}s linear forwards` }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{selectedStoryEvent?.title ?? 'Story do mapa'}</p>
                <p className="truncate text-xs text-slate-400">{selectedStory.creatorName} · expira em 24h</p>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/8" onClick={() => setStoryViewerOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            {selectedStory.imageURL && selectedStory.mediaType === 'video' ? (
              <video
                autoPlay
                className="min-h-0 flex-1 bg-black object-contain"
                muted
                onEnded={showNextStory}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration;
                  if (Number.isFinite(duration) && duration > 0) {
                    setStoryProgressSeconds(Math.max(1, duration));
                    setStoryProgressKey((current) => current + 1);
                  }
                }}
                playsInline
                src={selectedStory.imageURL}
              />
            ) : selectedStory.imageURL ? (
              <CachedMediaImage className="h-full w-full object-contain" fallbackClassName="min-h-0 flex-1 bg-black" src={selectedStory.imageURL} />
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center bg-slate-950 p-6 text-center text-lg font-semibold">{selectedStory.text}</div>
            )}
            {selectedStory.text && selectedStory.imageURL && <p className="p-4 text-sm text-slate-100">{selectedStory.text}</p>}
            {selectedStory.id.startsWith('local-story-') && (
              <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 rounded-full bg-[#ff3f68] px-3 py-1 text-xs font-bold text-white shadow-lg">
                Publicando...
              </div>
            )}
            <button
              aria-label="Story anterior"
              className="absolute bottom-24 left-0 top-14 z-10 w-1/2 bg-transparent"
              onClick={showPreviousStory}
              type="button"
            />
            <button
              aria-label="Próximo story"
              className="absolute bottom-24 right-0 top-14 z-10 w-1/2 bg-transparent"
              onClick={showNextStory}
              type="button"
            />
            <div className="pointer-events-none absolute bottom-28 right-3 z-20 grid gap-2">
              {(selectedStory.creatorUid === me.uid || canManageApp) && (
                <button
                  aria-label="Apagar story"
                  className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-black/45 px-3 text-white backdrop-blur"
                  onClick={() => deleteStory(selectedStory)}
                  type="button"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              {selectedStory.creatorUid !== me.uid && (
                <button
                  aria-label={t('likeStory')}
                  className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-black/45 px-3 text-white backdrop-blur"
                  onClick={() => likeStory(selectedStory)}
                  type="button"
                >
                  <Heart
                    className={`h-5 w-5 ${
                      selectedStory.likedBy.includes(me.uid) ? 'fill-[#ff3f68] text-[#ff3f68]' : 'text-white'
                    } ${storyLikeBursts.has(selectedStory.id) ? 'raddo-like-burst' : ''}`}
                  />
                </button>
              )}
              {selectedStory.creatorUid === me.uid && selectedStory.likedBy.length > 0 && (
                <button
                  className="pointer-events-auto inline-flex h-10 items-center justify-center gap-1 rounded-full bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur"
                  onClick={() => setStoryPeopleModal({ title: t('storyLikes'), userIds: [...new Set(selectedStory.likedBy)] })}
                  type="button"
                >
                  <Heart className="h-4 w-4 fill-[#ff3f68] text-[#ff3f68]" />
                  {selectedStory.likedBy.length}
                </button>
              )}
              {selectedStory.creatorUid === me.uid && selectedStory.viewedBy.filter((uid) => uid !== selectedStory.creatorUid).length > 0 && (
                <button
                  className="pointer-events-auto inline-flex h-10 items-center justify-center gap-1 rounded-full bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur"
                  onClick={() => setStoryPeopleModal({ title: t('storyViews'), userIds: [...new Set(selectedStory.viewedBy.filter((uid) => uid !== selectedStory.creatorUid))] })}
                  type="button"
                >
                  <Eye className="h-4 w-4 text-white" />
                  {selectedStory.viewedBy.filter((uid) => uid !== selectedStory.creatorUid).length}
                </button>
              )}
              {selectedStory.creatorUid !== me.uid && matches.some((item) => item.users.includes(me.uid) && item.users.includes(selectedStory.creatorUid)) && (
                <button
                  aria-label={t('send')}
                  className="pointer-events-auto inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-black/45 px-3 text-white backdrop-blur"
                  onClick={() => replyToStory(selectedStory)}
                  type="button"
                >
                  <MessageCircle className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3 pb-[calc(var(--raddo-bottom-safe)+12px)]">
              <button
                className="h-10 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                onClick={() => {
                  setStoryViewerOpen(false);
                  if (selectedStoryEvent) {
                    focusChatOnMap(selectedStoryEvent);
                    setPreviewEvent(selectedStoryEvent);
                  }
                }}
                type="button"
                disabled={!selectedStoryEvent}
              >
                {selectedStoryEvent ? t('enterChat') : t('noChat')}
              </button>
              <button
                aria-label={t('reportStory')}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-300/20 bg-rose-300/10 text-sm font-semibold text-rose-100"
                onClick={() => reportStory(selectedStory)}
                type="button"
              >
                <Flag className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      )}
      {storyPeopleModal && (
        <div className="fixed inset-0 z-[1800] grid place-items-end bg-black/65 p-4 pb-[calc(var(--raddo-bottom-safe)+16px)] pt-[calc(env(safe-area-inset-top)+16px)] backdrop-blur-sm sm:place-items-center">
          <section className="w-full max-w-sm rounded-lg border border-white/10 bg-[#07111f] p-4 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{storyPeopleModal.title}</h2>
              <button className="grid h-9 w-9 place-items-center rounded-lg bg-white/8" onClick={() => setStoryPeopleModal(null)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid max-h-[55dvh] gap-2 overflow-auto scrollbar-hidden">
              {storyPeopleModal.userIds.length === 0 ? (
                <p className="rounded-lg bg-white/8 p-3 text-sm text-slate-300">Ainda não tem ninguém aqui.</p>
              ) : (
                storyPeopleModal.userIds.map((uid) => {
                  const profile = storyPeopleProfiles.get(uid);
                  return (
                    <button
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-left text-sm text-slate-100 disabled:opacity-70"
                      disabled={!profile}
                      key={uid}
                      onClick={() => openStoryPerson(uid)}
                      type="button"
                    >
                      <span className="min-w-0 truncate font-semibold">{profile?.displayName ?? 'Pessoa do Raddo'}</span>
                      {profile && <span className="text-xs text-slate-400">Ver bio</span>}
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
      {storyComposerOpen && (
        <div className="fixed inset-0 z-[1500] overflow-hidden bg-black/85 px-3 pb-[calc(var(--raddo-bottom-safe)+12px)] pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-sm sm:grid sm:place-items-center sm:p-6">
          <section className="flex h-full max-h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#07111f] p-4 text-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-lg sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t('newStory')}</h2>
                <p className="text-xs text-slate-400">{storyComposerEvent?.title ?? t('mapStory')}</p>
              </div>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg bg-white/8"
                onClick={() => {
                  cancelStoryRecording();
                  setStoryComposerOpen(false);
                  setStoryComposerEvent(null);
                }}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto scrollbar-hidden">
              {storyImageURL && storyMediaType === 'video' ? (
                <video autoPlay className="min-h-0 w-full flex-1 rounded-lg bg-black object-contain" loop muted playsInline src={storyImageURL} />
              ) : storyImageURL ? (
                <CachedMediaImage className="h-full w-full object-contain" fallbackClassName="min-h-0 w-full flex-1 rounded-lg bg-black" src={storyImageURL} />
              ) : (
                <div className="grid min-h-[38dvh] place-items-center rounded-lg border border-dashed border-white/15 bg-slate-950/60 text-sm text-slate-400">
                  {t('optionalPhoto')}
                </div>
              )}
              <textarea
                className="scrollbar-hidden h-10 min-h-10 w-full resize-none overflow-hidden rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm leading-5 outline-none"
                maxLength={160}
                onChange={(event) => setStoryText(event.target.value)}
                placeholder="Texto curto do story"
                rows={1}
                value={storyText}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold">
                <Camera className="h-4 w-4" />
                {t('camera')}
                <input accept="image/*" capture="environment" className="hidden" disabled={uploadingStory} onChange={uploadStoryMedia} type="file" />
              </label>
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold">
                <ImagePlus className="h-4 w-4" />
                {t('gallery')}
                <input accept={GALLERY_IMAGE_ACCEPT} className="hidden" disabled={uploadingStory} onChange={uploadStoryMedia} type="file" />
              </label>
            </div>
            {eventError && <p className="mb-3 rounded-lg bg-rose-400/15 p-2 text-xs text-rose-100">{eventError}</p>}
            <button
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#ff3f68] text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
              disabled={uploadingStory || storyRecording}
              onClick={publishStory}
              type="button"
            >
              <Send className="h-4 w-4" />
              {uploadingStory ? t('uploading') : t('publishStory')}
            </button>
          </section>
        </div>
      )}
      {previewProfile && (
        <ProfilePreview
          me={me}
          onClose={() => setPreviewProfile(null)}
          onDislike={dislikeNearbyProfile}
          onLike={likeNearbyProfile}
          profile={previewProfile}
        />
      )}
      {matchProfile && (
        <div className="fixed inset-0 z-[1500] grid place-items-center bg-black/70 p-6 text-white backdrop-blur">
          <section className="raddo-match-pop w-full max-w-sm rounded-lg border border-[#ff3f68]/50 bg-[#07111f] p-6 text-center shadow-2xl shadow-rose-950/50">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-[#ff3f68] text-white">
              <Sparkles className="h-8 w-8" />
            </div>
            <h1 className="mt-4 text-3xl font-semibold">Deu match!</h1>
            <p className="mt-2 text-sm text-slate-300">Você e {matchProfile.displayName} se curtiram.</p>
            <div className="mt-5 flex justify-center -space-x-4">
              <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-20 w-20 rounded-lg border-2 border-[#07111f]" src={me.photoURL} />
              <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-20 w-20 rounded-lg border-2 border-[#07111f]" src={matchProfile.photoURL} />
            </div>
            <button
              className="mt-6 h-11 w-full rounded-lg bg-[#ff3f68] font-semibold text-white"
              onClick={() => setMatchProfile(null)}
              type="button"
            >
              Continuar
            </button>
          </section>
        </div>
      )}
      {previewEvent && (
        <div className="fixed inset-0 z-[1200] grid place-items-end bg-black/60 px-0 pb-[calc(var(--raddo-bottom-safe)+24px)] pt-0 backdrop-blur-sm sm:place-items-center sm:p-6">
          <section className="max-h-[calc(88dvh-var(--raddo-bottom-safe)-24px)] w-full max-w-lg overflow-auto rounded-t-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl sm:max-h-[88dvh] sm:rounded-lg">
            {previewEvent.coverURL && (
              <div className="-mx-5 -mt-5 mb-4 aspect-video overflow-hidden bg-slate-950">
                <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-full w-full" src={previewEvent.coverURL} />
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">{previewEvent.title}</h1>
                <p className="raddo-event-creator-label mt-1 text-xs font-semibold text-teal-200">
                  Criado por {creatorLabel(previewEvent)}
                </p>
                <p className="mt-1 text-sm text-slate-300">{previewEvent.description || t('chatLocalMap')}</p>
              </div>
              <button
                aria-label={t('close')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
                onClick={() => setPreviewEvent(null)}
                type="button"
              >
                <span className="text-lg leading-none">x</span>
              </button>
            </div>

            <div className="mt-4 grid gap-2 rounded-lg bg-slate-950/60 p-3 text-sm">
              <span className="flex items-center gap-2 text-slate-200">
                <Users className="h-4 w-4 text-teal-300" />
                {eventParticipantCounts[previewEvent.id] ?? 0} pessoas online agora
              </span>
              <span className="text-xs text-slate-300">
                {me.location
                  ? `${distanceKm(me.location, previewEvent.location).toFixed(1)} km de você`
                  : t('distanceUnavailable')} - {formatRadius(previewEvent.radiusKm)}
                {formatEventTimeLeft(previewEvent) ? ` - ${formatEventTimeLeft(previewEvent)}` : ''}
              </span>
            </div>

            {eventError && <p className="mt-3 rounded-lg bg-rose-400/15 p-2 text-xs text-rose-100">{eventError}</p>}

            <button
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
              onClick={() => setGpsEvent(previewEvent)}
              type="button"
            >
              <MapPin className="h-4 w-4 text-teal-300" />
              {t('openLocationGps')}
            </button>

            {previewEvent.creatorUid !== me.uid && (
              <button
                className="raddo-report-chat-button mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-100"
                onClick={() => handleReportEvent(previewEvent)}
                type="button"
              >
                <Megaphone className="h-4 w-4" />
                {t('reportChat')}
              </button>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="h-11 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
                onClick={() => setPreviewEvent(null)}
                type="button"
              >
                Agora não
              </button>
              <button
                className="h-11 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950"
                onClick={() => handleEnterEvent(previewEvent)}
                type="button"
              >
                {previewEventIsParticipant ? t('talk') : t('enterChat')}
              </button>
            </div>
            {(previewEvent.creatorUid === me.uid || canManageApp) && (
              <button
                className="raddo-delete-chat-button mt-2 h-10 w-full rounded-lg bg-rose-400/20 text-sm font-semibold text-white"
                onClick={() => handleDeleteEvent(previewEvent)}
                type="button"
              >
                {t('deleteChat')}
              </button>
            )}
          </section>
        </div>
      )}
      {gpsEvent && <ExternalGpsModal location={gpsEvent.location} onClose={() => setGpsEvent(null)} title={gpsEvent.title} />}
      {clusteredEvents.length > 0 && (
        <div className="fixed inset-0 z-[1200] grid place-items-end bg-black/60 px-0 pb-[calc(var(--raddo-bottom-safe)+24px)] pt-0 backdrop-blur-sm sm:place-items-center sm:p-6">
          <section className="max-h-[calc(88dvh-var(--raddo-bottom-safe)-24px)] w-full max-w-lg overflow-auto rounded-t-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl sm:max-h-[88dvh] sm:rounded-lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Chats neste ponto</h2>
                <p className="text-sm text-slate-300">{clusteredEvents.length} chats muito próximos no mapa</p>
              </div>
              <button
                aria-label={t('close')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
                onClick={() => setClusteredEvents([])}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-2">
              {clusteredEvents
                .slice()
                .sort((a, b) => eventDistance(a) - eventDistance(b))
                .map((event) => (
                  <button
                    className="w-full rounded-lg border border-white/10 bg-slate-950/60 p-3 text-left transition hover:bg-white/8"
                    key={event.id}
                    onClick={() => {
                      setClusteredEvents([]);
                      focusChatOnMap(event);
                      setPreviewEvent(event);
                    }}
                    type="button"
                  >
                    <span className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8 text-xl">{event.emoji || '\u{1F4AC}'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{event.title}</span>
                        <span className="mt-1 block text-xs font-semibold text-teal-200">Criado por {creatorLabel(event)}</span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
                          <span>{eventParticipantCounts[event.id] ?? 1} pessoas</span>
                          <span>{me.location ? `${distanceKm(me.location, event.location).toFixed(1)} km` : t('distanceUnavailable')}</span>
                          {formatEventTimeLeft(event) && <span>{formatEventTimeLeft(event)}</span>}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        </div>
      )}
      {activeEvent && (
        <MapEventChatBoundary key={activeEvent.id} onClose={() => setActiveEvent(null)} t={t}>
          <MapEventChat
            event={activeEvent}
            matches={matches}
            me={me}
            onClose={() => setActiveEvent(null)}
            onCreateStory={(storyEvent) => {
              setStoryComposerEvent(storyEvent);
              setStoryComposerOpen(true);
              setStoryText('');
              setStoryImageURL('');
              setStoryUploadFile(null);
              setStoryMediaType('image');
            }}
            onDeleted={(eventId) => {
              setLocalEvents((current) => current.filter((event) => event.id !== eventId));
              setActiveEvent(null);
            }}
            onEditEvent={openEditEvent}
            stories={storiesByEvent.get(activeEvent.id) ?? []}
          />
        </MapEventChatBoundary>
      )}
      {(showChatsList || showMyChatsList || showNearbyChatsList) && (
        <div className="fixed inset-0 z-[1200] grid place-items-end bg-black/60 px-0 pb-[calc(var(--raddo-bottom-safe)+24px)] pt-0 backdrop-blur-sm sm:place-items-center sm:p-6">
          <section className="max-h-[calc(88dvh-var(--raddo-bottom-safe)-24px)] w-full max-w-lg overflow-auto rounded-t-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl sm:max-h-[88dvh] sm:rounded-lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold">
                  {showMyChatsList ? 'Meus chats' : showNearbyChatsList ? 'Chats próximos' : 'Chats em que estou'}
                </h2>
                <p className="text-sm text-slate-300">
                  {showMyChatsList
                    ? `${myEvents.length} criados por você`
                    : showNearbyChatsList
                      ? `${nearbyReachableEvents.length} chats no seu alcance`
                      : `${joinedOnlyEvents.length} chats participando`}
                </p>
              </div>
              <button
                aria-label={t('close')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
                onClick={() => {
                  setShowChatsList(false);
                  setShowMyChatsList(false);
                  setShowNearbyChatsList(false);
                }}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {eventError && <p className="mb-3 rounded-lg bg-rose-400/15 p-2 text-xs text-rose-100">{eventError}</p>}

            <div className="grid gap-2">
              {currentChatModalEvents.length === 0 && (
                <p className="rounded-lg bg-white/8 p-3 text-sm text-slate-300">
                  {showMyChatsList ? 'Você ainda não criou nenhum chat.' : 'Você ainda não entrou em nenhum chat.'}
                </p>
              )}
              {currentChatModalEvents.map((event) => {
                const isOwner = event.creatorUid === me.uid;
                const isJoined = joinedEventIds.has(event.id);
                return (
                  <article
                    className={
                      'w-full rounded-lg border p-3 text-left ' +
                      (isOwner
                        ? 'border-sky-400/70 bg-sky-400/10 shadow-[0_0_24px_rgba(56,189,248,0.18)]'
                        : 'border-white/10 bg-slate-950/60')
                    }
                    key={event.id}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        className="flex min-w-0 flex-1 items-start gap-2 text-left"
                        onClick={() => {
                          setShowChatsList(false);
                          setShowMyChatsList(false);
                          setShowNearbyChatsList(false);
                          focusChatOnMap(event);
                          setPreviewEvent(event);
                        }}
                        type="button"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8 text-lg">{event.emoji || '\u{1F4AC}'}</span>
                        {event.coverURL && <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-9 w-9 shrink-0 rounded-lg" src={event.coverURL} thumbnailOnly />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{event.title}</span>
                            {isOwner && <span className="shrink-0 rounded-full bg-sky-300 px-2 py-0.5 text-[10px] font-bold text-slate-950">Seu chat</span>}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-teal-200">Criado por {creatorLabel(event)}</span>
                          {formatEventTimeLeft(event) && <span className="mt-1 block text-xs text-teal-200">{formatEventTimeLeft(event)}</span>}
                        </span>
                      </button>
                      <div className="flex shrink-0 gap-2">
                        <button
                          aria-label={isJoined ? t('talk') : t('enterChat')}
                          className="grid h-10 w-10 place-items-center rounded-lg bg-[#ff3f68] text-white shadow-lg shadow-[#ff3f68]/20 transition hover:brightness-110"
                          onClick={() => {
                            setShowChatsList(false);
                            setShowMyChatsList(false);
                            setShowNearbyChatsList(false);
                            focusChatOnMap(event);
                            handleEnterEvent(event);
                          }}
                          type="button"
                        >
                          {isJoined ? <MessageCircle className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                        </button>
                        <button
                          aria-label="Centralizar no mapa"
                          className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/8 text-slate-100 transition hover:bg-white/12"
                          onClick={() => {
                            setShowChatsList(false);
                            setShowMyChatsList(false);
                            setShowNearbyChatsList(false);
                            focusChatOnMap(event);
                          }}
                          type="button"
                        >
                          <MapPin className="h-5 w-5 text-[#ff3f68]" />
                        </button>
                        {isJoined && (
                          <button
                            aria-label={t('leaveChat')}
                            className="grid h-10 w-10 place-items-center rounded-lg border border-rose-300/30 bg-rose-400/15 text-rose-100 transition hover:bg-rose-400/25"
                            onClick={() => handleLeaveEventFromList(event)}
                            type="button"
                          >
                            <LogOut className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {showPeopleList && (
        <div className="fixed inset-0 z-[1200] grid place-items-end bg-black/60 px-0 pb-[calc(var(--raddo-bottom-safe)+24px)] pt-0 backdrop-blur-sm sm:place-items-center sm:p-6">
          <section className="max-h-[calc(88dvh-var(--raddo-bottom-safe)-24px)] w-full max-w-lg overflow-auto rounded-t-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl sm:max-h-[88dvh] sm:rounded-lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t('nearbyPeople')}</h2>
                <p className="text-sm text-slate-300">{sortedProfiles.length} pessoas no seu alcance</p>
              </div>
              <button
                aria-label={t('close')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
                onClick={() => setShowPeopleList(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {profileActionMessage && <p className="mb-3 rounded-lg bg-white/8 p-2 text-xs text-slate-100">{profileActionMessage}</p>}
            <div className="grid gap-3">
              {sortedProfiles.length === 0 && <p className="rounded-lg bg-white/8 p-3 text-sm text-slate-300">{t('noProfilesCurrentRadius')}</p>}
              {sortedProfiles.map((profile) => (
                <article className="rounded-lg bg-slate-950/60 p-3" key={profile.uid}>
                  <div className="flex items-center gap-3">
                    <button
                      className="shrink-0"
                      onClick={() => {
                        setShowPeopleList(false);
                        setPreviewProfile(profile);
                      }}
                      type="button"
                    >
                      <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-12 w-12 rounded-lg" src={profile.photoURL} thumbnailOnly />
                    </button>
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setShowPeopleList(false);
                        setPreviewProfile(profile);
                      }}
                      type="button"
                    >
                      <h3 className="truncate text-sm font-semibold">{profile.displayName}</h3>
                      <p className="text-xs text-slate-300">
                        {me.location && profile.location
                          ? formatPersonDistanceKm(distanceKm(me.location, profile.location))
                          : t('distanceUnavailable')}
                      </p>
                    </button>
                    <span className="rounded-md bg-cyan-200/15 px-2 py-1 text-xs text-cyan-100">
                      {profile.privacyMode === 'exact' ? 'Visível no mapa' : 'Fora do mapa'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      className="h-10 rounded-lg border border-white/10 bg-white/8 text-xs font-semibold text-slate-100"
                      onClick={() => {
                        setShowPeopleList(false);
                        setPreviewProfile(profile);
                      }}
                      type="button"
                    >
                      Ver perfil
                    </button>
                    <button
                      aria-label={t('rejectPerson', { name: profile.displayName })}
                      className="grid h-10 place-items-center rounded-lg border border-white/10 bg-white/8 text-rose-100"
                      onClick={() => dislikeNearbyProfile(profile)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Curtir ${profile.displayName}`}
                      className="grid h-10 place-items-center rounded-lg bg-teal-300 text-slate-950"
                      onClick={() => likeNearbyProfile(profile)}
                      type="button"
                    >
                      <Heart className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {createChatOpen && (
        <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/60 p-4 backdrop-blur-sm sm:p-6">
          <section className="scrollbar-hidden max-h-[92dvh] w-full max-w-md overflow-auto rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Plus className="h-4 w-4 text-teal-300" />
                {t('createMapChat')}
              </div>
              <button
                aria-label={t('close')}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200"
                onClick={() => setCreateChatOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="grid gap-3" onSubmit={handleCreateEvent}>
              <input
                className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
                onChange={(event) => setEventTitle(event.target.value)}
                placeholder={t('eventName')}
                value={eventTitle}
              />
              <textarea
                className="min-h-24 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm outline-none"
                onChange={(event) => setEventDescription(event.target.value)}
                placeholder={t('eventDescription')}
                value={eventDescription}
              />
              <label className="grid gap-2 text-sm">
                {t('chatCover')}
                {me.isPremium ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <span className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm">
                      <Camera className="h-4 w-4 text-teal-300" />
                      {uploadingCover ? t('uploadingCover') : t('openCamera')}
                      <input accept="image/*" capture="environment" className="hidden" disabled={creatingEvent} onChange={uploadEventCover} type="file" />
                    </span>
                    <span className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm">
                      <ImagePlus className="h-4 w-4 text-teal-300" />
                      {uploadingCover ? t('uploadingCover') : eventCoverURL ? t('changeCover') : t('sendCover')}
                      <input accept={GALLERY_IMAGE_ACCEPT} className="hidden" disabled={creatingEvent} onChange={uploadEventCover} type="file" />
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-center text-sm text-slate-300">
                    <ImagePlus className="h-4 w-4 text-slate-400" />
                    {t('coverPremiumOnly')}
                  </span>
                )}
              </label>
              {eventCoverURL && (
                <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                  <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="aspect-video w-full rounded-lg" src={eventCoverURL} />
                </div>
              )}
              <label className="grid gap-2 text-sm">
                {t('mapEmoji')}
                <div className="grid grid-cols-6 gap-2">
                  {eventEmojiQuickOptions.map((emoji) => (
                    <button
                      className={`grid h-10 place-items-center rounded-lg border text-lg ${
                        eventEmoji === emoji ? 'border-teal-300 bg-teal-300 text-slate-950' : 'border-white/10 bg-slate-950/60'
                      }`}
                      key={emoji}
                      onClick={() => setEventEmoji(emoji)}
                      type="button"
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    className="grid h-10 place-items-center rounded-lg border border-white/10 bg-slate-950/60 text-sm font-semibold"
                    onClick={() => setEmojiPickerOpen(true)}
                    type="button"
                  >
                    ...
                  </button>
                </div>
              </label>
              <label className="grid gap-2 text-sm">
                {t('whoCanEnter')}
                <select
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
                  onChange={(event) => setEventAccessMode(event.target.value as MapEvent['accessMode'])}
                  value={eventAccessMode}
                >
                  <option value="open">{t('openToAnyone')}</option>
                  <option value="approval">{t('approvalRequired')}</option>
                  <option value="password">{t('passwordRequired')}</option>
                </select>
              </label>
              {eventAccessMode === 'approval' && (
                <p className="rounded-lg bg-white/8 p-3 text-xs text-slate-300">
                  {t('approvalHelp')}
                </p>
              )}
              {eventAccessMode === 'password' && (
                <input
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
                  onChange={(event) => setEventPassword(event.target.value)}
                  placeholder={t('chatPasswordPlaceholder')}
                  type="password"
                  value={eventPassword}
                />
              )}
              {me.isPremium && (
                <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm">
                  <span>
                    <span className="block font-semibold">{t('permanentChat')}</span>
                    <span className="text-xs text-slate-300">{t('permanentChatHelp')}</span>
                  </span>
                  <input
                    checked={eventIsPermanent}
                    className="h-5 w-5"
                    onChange={(event) => setEventIsPermanent(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              )}
              <label className="grid gap-2 text-xs text-slate-300">
                Raio do chat: {formatRadius(eventRadius)}
                <input
                  max={50}
                  min={0.1}
                  onChange={(event) => setEventRadius(Number(event.target.value))}
                  step={0.1}
                  type="range"
                  value={eventRadius}
                />
              </label>
              <p className="text-xs text-slate-400">
                {me.isPremium
                  ? selectedPoint
                    ? 'Ponto escolhido no mapa.'
                    : 'Sem ponto escolhido: o chat será criado na sua posição atual.'
                  : 'Seu chat será criado na sua localização atual. Apenas Premium pode criar em outro local.'}
              </p>
              <p className="hidden">
                {selectedPoint ? 'Ponto escolhido no mapa.' : 'Sem ponto escolhido: o chat será criado na sua posição atual.'}
              </p>
              {eventError && <p className="rounded-lg bg-rose-400/15 p-2 text-xs text-rose-100">{eventError}</p>}
              <button
                className="h-11 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950 disabled:cursor-wait disabled:opacity-70"
                disabled={creatingEvent || uploadingCover}
                type="submit"
              >
                {creatingEvent ? t('creating') : t('createAndJoin')}
              </button>
            </form>
          </section>
        </div>
      )}
      {editingEvent && (
        <div className="fixed inset-0 z-[1300] grid place-items-center bg-black/60 p-4 backdrop-blur-sm sm:p-6">
          <section className="scrollbar-hidden max-h-[92dvh] w-full max-w-md overflow-auto rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t('editChat')}</h2>
                <p className="text-sm text-slate-300">{t('editChatHelp')}</p>
              </div>
              <button
                aria-label={t('close')}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/8 text-slate-200"
                onClick={() => setEditingEvent(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="grid gap-3" onSubmit={handleSaveEventEdit}>
              <input
                className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
                onChange={(event) => setEditingTitle(event.target.value)}
                placeholder={t('eventName')}
                value={editingTitle}
              />
              <textarea
                className="min-h-24 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm outline-none"
                onChange={(event) => setEditingDescription(event.target.value)}
                placeholder={t('eventDescription')}
                value={editingDescription}
              />
              <label className="grid gap-2 text-sm">
                {t('chatCover')}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="relative h-11 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60 text-sm font-semibold"
                    disabled={uploadingEditingCover}
                    type="button"
                  >
                    <Camera className="mr-2 inline h-4 w-4 text-[#ff3f68]" />
                    {t('openCamera')}
                    <input
                      accept={GALLERY_IMAGE_ACCEPT}
                      capture="environment"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      disabled={uploadingEditingCover}
                      onChange={uploadEditingEventCover}
                      type="file"
                    />
                  </button>
                  <button
                    className="relative h-11 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60 text-sm font-semibold"
                    disabled={uploadingEditingCover}
                    type="button"
                  >
                    <ImagePlus className="mr-2 inline h-4 w-4 text-[#ff3f68]" />
                    {t('sendCover')}
                    <input
                      accept="image/*"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      disabled={uploadingEditingCover}
                      onChange={uploadEditingEventCover}
                      type="file"
                    />
                  </button>
                </div>
                {editingCoverURL && (
                  <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                    <CachedMediaImage alt="" className="h-32 w-full object-cover" src={editingCoverURL} />
                    <button
                      className="w-full border-t border-white/10 px-3 py-2 text-left text-xs font-semibold text-rose-100 hover:bg-rose-400/10"
                      disabled={uploadingEditingCover}
                      onClick={() => setEditingCoverURL('')}
                      type="button"
                    >
                      Remover capa
                    </button>
                  </div>
                )}
                {uploadingEditingCover && <span className="text-xs text-slate-300">Enviando capa...</span>}
              </label>
              <label className="grid gap-2 text-sm">
                Emoji do mapa
                <div className="grid grid-cols-6 gap-2">
                  {eventEmojiQuickOptions.map((emoji) => (
                    <button
                      className={`grid h-10 place-items-center rounded-lg border text-lg ${
                        editingEmoji === emoji ? 'border-teal-300 bg-teal-300 text-slate-950' : 'border-white/10 bg-slate-950/60'
                      }`}
                      key={emoji}
                      onClick={() => setEditingEmoji(emoji)}
                      type="button"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </label>
              <label className="grid gap-2 text-sm">
                {t('whoCanEnter')}
                <select
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
                  onChange={(event) => setEditingAccessMode(event.target.value as MapEvent['accessMode'])}
                  value={editingAccessMode}
                >
                  <option value="open">Aberto para qualquer pessoa</option>
                  <option value="approval">Precisa de autorização</option>
                  <option value="password">Precisa de senha</option>
                </select>
              </label>
              {editingAccessMode === 'password' && (
                <input
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
                  onChange={(event) => setEditingPassword(event.target.value)}
                  placeholder={editingEvent.passwordHash ? 'Nova senha, ou deixe em branco para manter' : 'Senha do chat'}
                  type="password"
                  value={editingPassword}
                />
              )}
              {me.isPremium && (
                <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm">
                  <span>
                    <span className="block font-semibold">{t('permanentChat')}</span>
                    <span className="text-xs text-slate-300">Disponível para Premium.</span>
                  </span>
                  <input
                    checked={editingIsPermanent}
                    className="h-5 w-5"
                    onChange={(event) => setEditingIsPermanent(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              )}
              <label className="grid gap-2 text-xs text-slate-300">
                Raio do chat: {formatRadius(editingRadius)}
                <input
                  max={50}
                  min={0.1}
                  onChange={(event) => setEditingRadius(Number(event.target.value))}
                  step={0.1}
                  type="range"
                  value={editingRadius}
                />
              </label>
              {eventError && <p className="rounded-lg bg-rose-400/15 p-2 text-xs text-rose-100">{eventError}</p>}
              <button
                className="h-11 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950 disabled:cursor-wait disabled:opacity-70"
                disabled={savingEventEdit || uploadingEditingCover}
                type="submit"
              >
                {savingEventEdit ? t('saving') : t('saveChanges')}
              </button>
            </form>
          </section>
        </div>
      )}
      {emojiPickerOpen && (
        <div className="fixed inset-0 z-[1300] grid place-items-center bg-black/60 p-4 backdrop-blur-sm sm:p-6">
          <section className="max-h-[82dvh] w-full max-w-md overflow-auto rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Escolher emoji</h2>
                <p className="text-sm text-slate-300">Esse emoji aparece no mapa do chat.</p>
              </div>
              <button
                aria-label={t('close')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
                onClick={() => setEmojiPickerOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {eventEmojiOptions.map((emoji) => (
                <button
                  className={`grid h-11 place-items-center rounded-lg border text-xl ${
                    eventEmoji === emoji ? 'border-teal-300 bg-teal-300 text-slate-950' : 'border-white/10 bg-slate-950/60'
                  }`}
                  key={emoji}
                  onClick={() => {
                    setEventEmoji(emoji);
                    setEmojiPickerOpen(false);
                  }}
                  type="button"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <section className={`absolute inset-0 overflow-hidden ${mapShellClass(theme)}`}>
        <MapContainer
          center={[center.lat, center.lng]}
          className={`h-full min-h-0 w-full raddo-leaflet-map raddo-leaflet-map-${theme}`}
          maxZoom={MAP_MAX_ZOOM}
          scrollWheelZoom
          zoomControl={false}
          zoom={13}
        >
          <TileLayer
            attribution={tileLayer.attribution}
            keepBuffer={6}
            key={theme}
            updateWhenIdle={false}
            updateWhenZooming={false}
            url={tileLayer.url}
          />
          <MapFocusController target={focusTarget} />
          {me.isPremium && <MapClickTarget onPick={setSelectedPoint} selectedPoint={selectedPoint} />}

          {me.location && (
            <Marker icon={meIcon} position={[me.location.lat, me.location.lng]}>
              <Popup>
                <strong>Você</strong>
                <br />
                Sua posição aproximada
              </Popup>
            </Marker>
          )}
          <MyLocationArrow me={me} />

          {me.isPremium && selectedPoint && (
            <Marker
              eventHandlers={{
                click(event) {
                  L.DomEvent.stopPropagation(event);
                },
              }}
              icon={draftIcon}
              position={[selectedPoint.lat, selectedPoint.lng]}
            >
              <Popup>Ponto escolhido para o novo chat</Popup>
            </Marker>
          )}

          <ClusteredProfileMarkers me={me} profiles={profiles} />
          <ClusteredEventMarkers
            creatorNames={eventCreatorNames}
            eventParticipantCounts={eventParticipantCounts}
            recentlyActiveEventIds={recentlyActiveEventIds}
            events={visibleEvents}
            me={me}
            onOpenCluster={setClusteredEvents}
            onPreviewEvent={(event) => {
              focusChatOnMap(event);
              setPreviewEvent(event);
            }}
          />
          {false && profiles.map((profile) => {
            const position = visibleLocation(profile);
            if (!position) return null;

            return (
              <Marker icon={personIcon} key={profile.uid} position={[position.lat, position.lng]}>
                <Popup>
                  <strong>{profile.displayName}</strong>
                  <br />
                  {me.location ? t('distanceAway', { distance: formatPersonDistanceKm(distanceKm(me.location, position)) }) : t('distanceUnavailable')}
                  <br />
                  {profile.privacyMode === 'exact' ? 'Visível no mapa' : 'Fora do mapa'}
                </Popup>
              </Marker>
            );
          })}

          {false && visibleEvents.map((event) => (
            <Marker
              eventHandlers={{ click: () => setPreviewEvent(event) }}
              icon={event.emoji ? eventEmojiIcon(event.emoji) : eventIcon}
              key={event.id}
              position={[event.location.lat, event.location.lng]}
            >
              <Popup>
                <strong>{event.title}</strong>
                <br />
                {eventParticipantCounts[event.id] ?? 1} pessoas
                <br />
                {formatEventTimeLeft(event)}
                <br />
                {me.location ? t('distanceAway', { distance: `${distanceKm(me.location, event.location).toFixed(1)} km` }) : t('distanceUnavailable')}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </section>

      {(me.isPremium ? selectedPoint || me.location : me.location) && (
        <button
          aria-label={t('createChat')}
          className="raddo-create-chat-cta absolute left-1/2 z-[560] grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full text-white"
          onClick={() => setCreateChatOpen(true)}
          type="button"
        >
          <Plus className="h-7 w-7" />
          <span className="absolute -bottom-6 whitespace-nowrap text-xs font-semibold text-white drop-shadow">{t('createChat')}</span>
        </button>
      )}

      <aside className="hidden">
        <section
          className="raddo-radar-card raddo-radar-card-chat pointer-events-auto cursor-pointer rounded-2xl p-3 text-left shadow-2xl backdrop-blur transition"
          onClick={() => setShowChatsList(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setShowChatsList(true);
          }}
          role="button"
          tabIndex={0}
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <span className="raddo-radar-card-icon raddo-radar-card-icon-chat">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="raddo-count-badge raddo-count-badge-chat">{visibleEvents.length}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-100">
              {visibleEvents.length === 1 ? '1 chat' : `${visibleEvents.length} chats`}
            </p>
            <span className="raddo-mini-arrow raddo-mini-arrow-chat">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="hidden">
            {visibleEvents.length === 0 && <p className="text-sm text-slate-300">{t('noNearbyChats')}</p>}
            {sortedVisibleEvents.map((event) => (
              <button
                className="w-full rounded-lg bg-slate-950/60 p-3 text-left"
                key={event.id}
                onClick={() => setPreviewEvent(event)}
                type="button"
              >
                <span className="flex items-center gap-2 truncate text-sm font-semibold">
                  {event.coverURL && <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-8 w-8 rounded-lg" src={event.coverURL} thumbnailOnly />}
                  <MessageCircle className="h-4 w-4 text-fuchsia-300" />
                  {event.title}
                </span>
                <span className="mt-1 block text-xs font-semibold text-teal-200">Criado por {creatorLabel(event)}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-slate-300">
                  <Users className="h-3.5 w-3.5" />
                  {eventParticipantCounts[event.id] ?? 1} online agora
                </span>
                <span className="mt-1 block text-xs text-slate-300">
                  {me.location ? `${distanceKm(me.location, event.location).toFixed(1)} km` : t('distanceUnavailable')} - {formatRadius(event.radiusKm)}
                </span>
                {formatEventTimeLeft(event) && <span className="mt-1 block text-xs text-teal-200">{formatEventTimeLeft(event)}</span>}
              </button>
            ))}
          </div>
        </section>

        <section
          className="hidden"
          onClick={() => setShowPeopleList(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setShowPeopleList(true);
          }}
          role="button"
          tabIndex={0}
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <span className="raddo-radar-card-icon raddo-radar-card-icon-people">
              <Users className="h-5 w-5" />
            </span>
            <span className="raddo-count-badge raddo-count-badge-people">{profiles.length}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-100">
              {profiles.length === 1 ? '1 pessoa' : `${profiles.length} pessoas`}
            </p>
            <span className="raddo-mini-arrow raddo-mini-arrow-people">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
          {profileActionMessage && <p className="mt-3 rounded-lg bg-white/8 p-2 text-xs text-slate-100">{profileActionMessage}</p>}
          <div className="hidden">
            {profiles.length === 0 && <p className="text-sm text-slate-300">{t('noProfilesCurrentRadius')}</p>}
            {profileActionMessage && <p className="rounded-lg bg-white/8 p-2 text-xs text-slate-100">{profileActionMessage}</p>}
            {sortedProfiles.slice(0, 6).map((profile) => (
              <article className="flex items-center gap-3" key={profile.uid}>
                <button className="shrink-0" onClick={() => setPreviewProfile(profile)} type="button">
                  <CachedMediaImage className="h-full w-full object-cover" fallbackClassName="h-11 w-11 rounded-lg" src={profile.photoURL} thumbnailOnly />
                </button>
                <button className="min-w-0 flex-1 text-left" onClick={() => setPreviewProfile(profile)} type="button">
                  <h3 className="truncate text-sm font-semibold">{profile.displayName}</h3>
                  <p className="text-xs text-slate-300">
                    {me.location && profile.location
                      ? formatPersonDistanceKm(distanceKm(me.location, profile.location))
                      : t('distanceUnavailable')}
                  </p>
                </button>
                <span className="rounded-md bg-cyan-200/15 px-2 py-1 text-xs text-cyan-100">
                  {profile.privacyMode === 'exact' ? 'Visível no mapa' : 'Fora do mapa'}
                </span>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}




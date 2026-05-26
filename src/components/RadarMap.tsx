import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents as useLeafletMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowRight, Camera, Heart, ImagePlus, MapPin, Megaphone, MessageCircle, Plus, Users, X } from 'lucide-react';
import { formatRadius } from '../profileOptions';
import {
  createMapEvent,
  deleteMapEvent,
  hashMapEventPassword,
  joinMapEvent,
  leaveMapEvent,
  reportMapEvent,
  requestMapEventEntry,
  useJoinedMapEvents,
  useMapEventCreatorNames,
  useMapEventParticipantCounts,
  useMapEvents as useLocalMapEvents,
} from '../hooks/useMapEvents';
import type { AppTheme, LatLng, MapEvent, UserProfile } from '../types';
import { distanceKm, visibleLocation } from '../utils/geo';
import MapEventChat from './MapEventChat';
import { isDemoMode } from '../demoData';
import { supabase } from '../supabase';
import ProfilePreview from './ProfilePreview';
import { sendDislike, trySendLike } from '../hooks/useMatches';
import ExternalGpsModal from './ExternalGpsModal';
import { moderateUploadedImage } from '../imageModeration';

type Props = {
  me: UserProfile;
  profiles: UserProfile[];
  theme: AppTheme;
};

type MapPointSetter = (point: LatLng) => void;

const MAP_MAX_ZOOM = 19;
const MAP_SPREAD_MARKERS_ZOOM = MAP_MAX_ZOOM - 4;

const meIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin map-pin-me"></div>',
  iconAnchor: [12, 12],
  iconSize: [24, 24],
});

const personIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin map-pin-person"></div>',
  iconAnchor: [10, 10],
  iconSize: [20, 20],
});

const personGroupIcon = L.divIcon({
  className: '',
  html: '<div class="map-group-marker">ðŸ‘¥</div>',
  iconAnchor: [18, 18],
  iconSize: [36, 36],
});

const eventIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin map-pin-event"></div>',
  iconAnchor: [13, 13],
  iconSize: [26, 26],
});

const eventEmojiOptions: string[] = [];

const modernEventEmojiOptions = [
  '\u{1F4AC}',
  '\u{1F4CD}',
  '\u{1F389}',
  '\u{2728}',
  '\u{1F525}',
  '\u{1FAE1}',
  '\u{1F60E}',
  '\u{1F929}',
  '\u{1F970}',
  '\u{1F44B}',
  '\u{1F91D}',
  '\u{1F64C}',
  '\u{1F483}',
  '\u{1F57A}',
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
  '\u{1F379}',
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
const eventEmojiQuickOptions = eventEmojiOptions.slice(0, 15);

function eventEmojiIcon(emoji: string, highlighted = false) {
  const emojiClassName = highlighted ? 'map-pin-emoji map-pin-emoji-own' : 'map-pin-emoji';
  if (!eventEmojiOptions.includes(emoji)) {
    return L.divIcon({
      className: '',
      html: `<div class="${emojiClassName}">\u{1F4AC}</div>`,
      iconAnchor: highlighted ? [12, 12] : [18, 18],
      iconSize: highlighted ? [24, 24] : [36, 36],
    });
  }

  const visibleEmoji = eventEmojiOptions.includes(emoji) ? emoji : 'ðŸ’¬';
  return L.divIcon({
    className: '',
    html: `<div class="${emojiClassName}">${visibleEmoji}</div>`,
    iconAnchor: highlighted ? [12, 12] : [18, 18],
    iconSize: highlighted ? [24, 24] : [36, 36],
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function profilePhotoIcon(photoURL: string) {
  return L.divIcon({
    className: '',
    html: `<div class="map-profile-photo"><img alt="" src="${escapeHtml(photoURL)}" /></div>`,
    iconAnchor: [17, 17],
    iconSize: [34, 34],
  });
}

const draftIcon = L.divIcon({
  className: '',
  html: '<div class="map-pin map-pin-draft"></div>',
  iconAnchor: [10, 10],
  iconSize: [20, 20],
});

const eventGroupIcon = L.divIcon({
  className: '',
  html: '<div class="map-group-marker">ðŸ’¬</div>',
  iconAnchor: [18, 18],
  iconSize: [36, 36],
});

function ownerEventArrowIcon(angle: number) {
  return L.divIcon({
    className: '',
    html: `<div class="map-owner-event-arrow" style="transform: rotate(${angle}deg)">âžœ</div>`,
    iconAnchor: [18, 18],
    iconSize: [36, 36],
  });
}

function MapClickTarget({ onPick }: { onPick: MapPointSetter }) {
  useLeafletMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function mapShellClass(theme: AppTheme) {
  if (theme === 'light') return 'bg-slate-100';
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
  const spacingPx = 18;
  const verticalSpacingPx = 8;
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

function isPositionInView(map: L.Map, position: LatLng) {
  return map.getBounds().pad(0.08).contains(L.latLng(position.lat, position.lng));
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

function edgeOverlayForPosition(map: L.Map, position: LatLng) {
  const size = map.getSize();
  const center = L.point(size.x / 2, size.y / 2);
  const target = map.latLngToContainerPoint(L.latLng(position.lat, position.lng));
  const delta = target.subtract(center);
  const margin = 30;
  const availableX = Math.max(1, size.x / 2 - margin);
  const availableY = Math.max(1, size.y / 2 - margin);
  const scaleX = delta.x === 0 ? Number.POSITIVE_INFINITY : availableX / Math.abs(delta.x);
  const scaleY = delta.y === 0 ? Number.POSITIVE_INFINITY : availableY / Math.abs(delta.y);
  const scale = Math.min(scaleX, scaleY);
  const edge = center.add(delta.multiplyBy(scale));

  return {
    angle: Math.atan2(delta.y, delta.x) * (180 / Math.PI),
    x: Math.min(size.x - margin, Math.max(margin, edge.x)),
    y: Math.min(size.y - margin, Math.max(margin, edge.y)),
  };
}

function OwnerEventArrows({ events, me }: { events: MapEvent[]; me: UserProfile }) {
  const map = useMap();
  const [arrows, setArrows] = useState<Array<{ angle: number; id: string; x: number; y: number }>>([]);

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
    map.on('move zoom moveend zoomend resize', scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      map.off('move zoom moveend zoomend resize', scheduleUpdate);
    };
  }, [map, ownerEvents]);

  if (arrows.length === 0) return null;

  return createPortal(
    <div className="map-owner-event-arrow-layer">
      {arrows.map((arrow) => (
        <div
          aria-hidden="true"
          className="map-owner-event-arrow"
          key={arrow.id}
          style={{
            left: `${arrow.x}px`,
            top: `${arrow.y}px`,
            transform: `translate(-50%, -50%) rotate(${arrow.angle}deg)`,
          }}
        >
          <span className="map-owner-event-arrow-chevron" />
        </div>
      ))}
    </div>,
    map.getContainer(),
  );
}

function ClusteredProfileMarkers({ me, profiles }: { me: UserProfile; profiles: UserProfile[] }) {
  const map = useMap();
  const [, setMapVersion] = useState(0);
  useLeafletMapEvents({
    moveend: () => setMapVersion((version) => version + 1),
    zoomend: () => setMapVersion((version) => version + 1),
  });

  const items = profiles
    .map((profile) => {
      const position = visibleLocation(profile);
      return position && isPositionInView(map, position) ? { profile, position } : null;
    })
    .filter(Boolean) as Array<{ profile: UserProfile; position: LatLng }>;
  const clusters = clusterMapItems(items, map, 2);

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
          <Marker icon={profilePhotoIcon(profile.photoURL)} key={profile.uid} position={[position.lat, position.lng]} zIndexOffset={100}>
            <Popup>
              <strong>{profile.displayName}</strong>
              <br />
              {me.location ? `${distanceKm(me.location, position).toFixed(1)} km de você` : 'Distância indisponível'}
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
  events,
  me,
  onOpenCluster,
  onPreviewEvent,
}: {
  creatorNames: Record<string, string>;
  eventParticipantCounts: Record<string, number>;
  events: MapEvent[];
  me: UserProfile;
  onOpenCluster: (events: MapEvent[]) => void;
  onPreviewEvent: (event: MapEvent) => void;
}) {
  const map = useMap();
  const [, setMapVersion] = useState(0);
  useLeafletMapEvents({
    moveend: () => setMapVersion((version) => version + 1),
    zoomend: () => setMapVersion((version) => version + 1),
  });

  const visibleInBounds = events.filter((event) => isPositionInView(map, event.location));
  const shouldSpreadOverlappingMarkers = map.getZoom() >= MAP_SPREAD_MARKERS_ZOOM;
  const maxZoomClusters = clusterMapItems(
    visibleInBounds.map((event) => ({ event, position: event.location })),
    map,
    4,
  );
  const permanentEvents = visibleInBounds.filter((event) => event.isPermanent);
  const expiringEvents = visibleInBounds.filter((event) => !event.isPermanent);
  const clusters = clusterMapItems(
    expiringEvents.map((event) => ({ event, position: event.location })),
    map,
    4,
  );

  return (
    <>
      {shouldSpreadOverlappingMarkers &&
        maxZoomClusters.flatMap((cluster) =>
          spreadClusterPositions(cluster, map).map(({ item, position }) => {
            const { event } = item;
            return (
              <Marker
                eventHandlers={{ click: () => onPreviewEvent(event) }}
                icon={event.emoji ? eventEmojiIcon(event.emoji, event.creatorUid === me.uid) : eventIcon}
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
                  {me.location ? `${distanceKm(me.location, event.location).toFixed(1)} km de você` : 'Distância indisponível'}
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
          icon={event.emoji ? eventEmojiIcon(event.emoji, event.creatorUid === me.uid) : eventIcon}
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
            {me.location ? `${distanceKm(me.location, event.location).toFixed(1)} km de você` : 'Distância indisponível'}
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
        return (
          <Marker
            eventHandlers={{ click: () => onPreviewEvent(event) }}
            icon={event.emoji ? eventEmojiIcon(event.emoji, event.creatorUid === me.uid) : eventIcon}
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
              {me.location ? `${distanceKm(me.location, event.location).toFixed(1)} km de você` : 'Distância indisponível'}
            </Popup>
          </Marker>
        );
      })}
        </>
      )}
      <OwnerEventArrows events={events} me={me} />
    </>
  );
}

export default function RadarMap({ me, profiles, theme }: Props) {
  const center = me.location ?? { lat: -23.5505, lng: -46.6333 };
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
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [showChatsList, setShowChatsList] = useState(false);
  const [showMyChatsList, setShowMyChatsList] = useState(false);
  const [showNearbyChatsList, setShowNearbyChatsList] = useState(false);
  const [showPeopleList, setShowPeopleList] = useState(false);
  const [previewProfile, setPreviewProfile] = useState<UserProfile | null>(null);
  const [gpsEvent, setGpsEvent] = useState<MapEvent | null>(null);
  const [localEvents, setLocalEvents] = useState<MapEvent[]>([]);
  const [eventError, setEventError] = useState('');
  const [profileActionMessage, setProfileActionMessage] = useState('');
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
  const currentChatModalEvents = showMyChatsList ? myEvents : showNearbyChatsList ? nearbyReachableEvents : joinedOnlyEvents;
  const eventContextList = useMemo(
    () => [
      ...visibleEvents,
      ...joinedActiveEvents.filter((event) => !visibleEvents.some((visibleEvent) => visibleEvent.id === event.id)),
    ],
    [joinedActiveEvents, visibleEvents],
  );
  const sortedProfiles = [...profiles].sort((a, b) => profileDistance(a) - profileDistance(b));
  const tileLayer = tileLayerForTheme(theme);
  const eventParticipantCounts = useMapEventParticipantCounts(eventContextList);
  const eventCreatorNames = useMapEventCreatorNames(eventContextList, me);
  const creatorLabel = (event: MapEvent) => eventCreatorNames[event.creatorUid] ?? (event.creatorUid === me.uid ? me.displayName : 'criador do chat');

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

  async function uploadEventCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!me.isPremium) {
      setEventError('Apenas usuários Premium podem adicionar capa ao chat.');
      event.target.value = '';
      return;
    }

    setUploadingCover(true);

    if (isDemoMode) {
      setEventCoverURL(URL.createObjectURL(file));
      setUploadingCover(false);
      event.target.value = '';
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${me.uid}/map-events/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from('profile-photos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (!error) {
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
      try {
        await moderateUploadedImage({ context: 'chat-cover', path, publicUrl: data.publicUrl });
        setEventCoverURL(data.publicUrl);
      } catch (moderationError) {
        setEventError(moderationError instanceof Error ? moderationError.message : 'Imagem recusada pela verificação de segurança.');
      }
    } else {
      setEventError(error.message || 'Não consegui enviar a capa.');
    }

    setUploadingCover(false);
    event.target.value = '';
  }

  async function handleCreateEvent(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setEventError('');
    const title = eventTitle.trim();
    const eventLocation = me.isPremium ? (selectedPoint ?? me.location) : me.location;

    if (!title) {
      setEventError('Escolha um título para o chat.');
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
      const passwordHash = eventAccessMode === 'password' ? await hashMapEventPassword(eventPassword) : '';
      const created = await createMapEvent({
        title,
        description: eventDescription.trim(),
        coverURL: me.isPremium ? eventCoverURL : '',
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
      setLocalEvents((current) => [created, ...current]);
      setActiveEvent(created);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : 'Não consegui criar o chat.');
    }
  }

  async function handleEnterEvent(event: MapEvent) {
    setEventError('');
    if (me.location && distanceKm(me.location, event.location) > event.radiusKm) {
      setEventError(`Você precisa estar dentro de ${formatRadius(event.radiusKm)} para entrar neste chat.`);
      return;
    }

    try {
      if (event.accessMode === 'approval' && event.creatorUid !== me.uid) {
        await requestMapEventEntry(event.id, me.uid);
        setEventError('Pedido enviado. Aguarde o dono ou moderador liberar sua entrada.');
        return;
      }

      if (event.accessMode === 'password' && event.creatorUid !== me.uid) {
        const password = window.prompt('Digite a senha deste chat.');
        if (!password) return;
        const passwordHash = await hashMapEventPassword(password);
        if (passwordHash !== event.passwordHash) {
          setEventError('Senha incorreta.');
          return;
        }
      }

      await joinMapEvent(event.id, me.uid);
      setPreviewEvent(null);
      setActiveEvent(event);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : 'Não consegui entrar no chat.');
    }
  }

  async function handleLeaveEventFromList(event: MapEvent) {
    setEventError('');
    const confirmed = window.confirm(`Sair do chat "${event.title}"?`);
    if (!confirmed) return;

    try {
      await leaveMapEvent(event.id, me.uid);
      if (activeEvent?.id === event.id) setActiveEvent(null);
      if (previewEvent?.id === event.id) setPreviewEvent(null);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : 'Não consegui sair do chat.');
    }
  }

  async function handleDeleteEvent(event: MapEvent) {
    const confirmed = window.confirm('Excluir este chat do mapa? Todas as mensagens dele serão removidas.');
    if (!confirmed) return;

    try {
      await deleteMapEvent(event.id, me.uid);
      setLocalEvents((current) => current.filter((localEvent) => localEvent.id !== event.id));
      setPreviewEvent(null);
      if (activeEvent?.id === event.id) setActiveEvent(null);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : 'Não consegui excluir o chat.');
    }
  }

  async function handleReportEvent(event: MapEvent) {
    const confirmed = window.confirm('Denunciar este chat para revisão?');
    if (!confirmed) return;

    try {
      await reportMapEvent(event, me.uid);
      setEventError('Denúncia enviada. Obrigado por ajudar a manter o Raddo seguro.');
    } catch (error) {
      setEventError(error instanceof Error ? error.message : 'Não consegui enviar a denúncia.');
    }
  }

  async function likeNearbyProfile(profile: UserProfile) {
    const result = await trySendLike(me, profile.uid);
    setProfileActionMessage(result.ok ? (result.matched ? `Deu match com ${profile.displayName}.` : `Você curtiu ${profile.displayName}.`) : result.message);
    if (result.ok) setPreviewProfile(null);
  }

  async function dislikeNearbyProfile(profile: UserProfile) {
    try {
      await sendDislike(me.uid, profile.uid);
      setProfileActionMessage(`Você recusou ${profile.displayName}.`);
      setPreviewProfile(null);
    } catch (error) {
      setProfileActionMessage(error instanceof Error ? error.message : 'Não consegui registrar o dislike.');
    }
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {previewProfile && (
        <ProfilePreview
          me={me}
          onClose={() => setPreviewProfile(null)}
          onDislike={dislikeNearbyProfile}
          onLike={likeNearbyProfile}
          profile={previewProfile}
        />
      )}
      {previewEvent && (
        <div className="fixed inset-0 z-[1200] grid place-items-end bg-black/60 px-0 pb-[calc(var(--raddo-bottom-safe)+24px)] pt-0 backdrop-blur-sm sm:place-items-center sm:p-6">
          <section className="max-h-[calc(88dvh-var(--raddo-bottom-safe)-24px)] w-full max-w-lg overflow-auto rounded-t-lg border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl sm:max-h-[88dvh] sm:rounded-lg">
            {previewEvent.coverURL && (
              <div className="-mx-5 -mt-5 mb-4 aspect-video overflow-hidden bg-slate-950">
                <img alt="" className="h-full w-full object-cover" src={previewEvent.coverURL} />
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">{previewEvent.title}</h1>
                <p className="mt-1 text-xs font-semibold text-teal-200">Criado por {creatorLabel(previewEvent)}</p>
                <p className="mt-1 text-sm text-slate-300">{previewEvent.description || 'Chat local do mapa'}</p>
              </div>
              <button
                aria-label="Fechar"
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
                  : 'Distância indisponível'} - {formatRadius(previewEvent.radiusKm)}
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
              Abrir localização no GPS
            </button>

            {previewEvent.creatorUid !== me.uid && (
              <button
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-100"
                onClick={() => handleReportEvent(previewEvent)}
                type="button"
              >
                <Megaphone className="h-4 w-4" />
                Denunciar chat
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
                Entrar no chat
              </button>
            </div>
            {previewEvent.creatorUid === me.uid && (
              <button
                className="mt-2 h-10 w-full rounded-lg bg-rose-400/20 text-sm font-semibold text-rose-100"
                onClick={() => handleDeleteEvent(previewEvent)}
                type="button"
              >
                Excluir chat
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
                aria-label="Fechar"
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
                      setPreviewEvent(event);
                    }}
                    type="button"
                  >
                    <span className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8 text-xl">{event.emoji || 'ðŸ’¬'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{event.title}</span>
                        <span className="mt-1 block text-xs font-semibold text-teal-200">Criado por {creatorLabel(event)}</span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
                          <span>{eventParticipantCounts[event.id] ?? 1} pessoas</span>
                          <span>{me.location ? `${distanceKm(me.location, event.location).toFixed(1)} km` : 'Distância indisponível'}</span>
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
        <MapEventChat
          event={activeEvent}
          me={me}
          onClose={() => setActiveEvent(null)}
          onDeleted={(eventId) => {
            setLocalEvents((current) => current.filter((event) => event.id !== eventId));
            setActiveEvent(null);
          }}
        />
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
                aria-label="Fechar"
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
                          setPreviewEvent(event);
                        }}
                        type="button"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8 text-lg">{event.emoji || '??'}</span>
                        {event.coverURL && <img alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" src={event.coverURL} />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{event.title}</span>
                            {isOwner && <span className="shrink-0 rounded-full bg-sky-300 px-2 py-0.5 text-[10px] font-bold text-slate-950">Seu chat</span>}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-teal-200">Criado por {creatorLabel(event)}</span>
                          <span className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                            <Users className="h-3.5 w-3.5" />
                            {eventParticipantCounts[event.id] ?? 1} online agora
                          </span>
                          <span className="mt-1 block text-xs text-slate-300">
                            {me.location ? distanceKm(me.location, event.location).toFixed(1) + ' km' : 'Distância indisponível'} - {formatRadius(event.radiusKm)}
                          </span>
                          {formatEventTimeLeft(event) && <span className="mt-1 block text-xs text-teal-200">{formatEventTimeLeft(event)}</span>}
                        </span>
                      </button>
                      <div className="grid shrink-0 gap-2">
                        <button
                          className="h-9 rounded-lg bg-teal-300 px-3 text-xs font-bold text-slate-950"
                          onClick={() => {
                            setShowChatsList(false);
                            setShowMyChatsList(false);
                            setShowNearbyChatsList(false);
                            handleEnterEvent(event);
                          }}
                          type="button"
                        >
                          {isJoined ? 'Conversar' : 'Entrar'}
                        </button>
                        {isJoined && (
                          <button
                            className="h-9 rounded-lg border border-rose-300/30 bg-rose-400/15 px-3 text-xs font-bold text-rose-100"
                            onClick={() => handleLeaveEventFromList(event)}
                            type="button"
                          >
                            Sair
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
                <h2 className="text-lg font-semibold">Pessoas próximas</h2>
                <p className="text-sm text-slate-300">{sortedProfiles.length} pessoas no seu alcance</p>
              </div>
              <button
                aria-label="Fechar"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
                onClick={() => setShowPeopleList(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {profileActionMessage && <p className="mb-3 rounded-lg bg-white/8 p-2 text-xs text-slate-100">{profileActionMessage}</p>}
            <div className="grid gap-3">
              {sortedProfiles.length === 0 && <p className="rounded-lg bg-white/8 p-3 text-sm text-slate-300">Nenhum perfil no raio atual.</p>}
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
                      <img alt="" className="h-12 w-12 rounded-lg object-cover" src={profile.photoURL} />
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
                          ? `${distanceKm(me.location, profile.location).toFixed(1)} km`
                          : 'Distância indisponível'}
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
                      aria-label={`Recusar ${profile.displayName}`}
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
          <section className="max-h-[92dvh] w-full max-w-md overflow-auto rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Plus className="h-4 w-4 text-teal-300" />
                Criar chat no mapa
              </div>
              <button
                aria-label="Fechar"
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
                placeholder="Nome do evento"
                value={eventTitle}
              />
              <textarea
                className="min-h-24 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm outline-none"
                onChange={(event) => setEventDescription(event.target.value)}
                placeholder="Descrição, ponto de encontro ou local exato"
                value={eventDescription}
              />
              <label className="grid gap-2 text-sm">
                Capa do chat
                {me.isPremium ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <span className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm">
                      <Camera className="h-4 w-4 text-teal-300" />
                      {uploadingCover ? 'Enviando capa...' : 'Abrir câmera'}
                      <input accept="image/*" capture="environment" className="hidden" onChange={uploadEventCover} type="file" />
                    </span>
                    <span className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm">
                      <ImagePlus className="h-4 w-4 text-teal-300" />
                      {uploadingCover ? 'Enviando capa...' : eventCoverURL ? 'Trocar capa' : 'Enviar capa'}
                      <input accept="image/*" className="hidden" onChange={uploadEventCover} type="file" />
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-center text-sm text-slate-300">
                    <ImagePlus className="h-4 w-4 text-slate-400" />
                    Capa disponível apenas no Premium
                  </span>
                )}
              </label>
              {eventCoverURL && (
                <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                  <img alt="" className="aspect-video w-full object-cover" src={eventCoverURL} />
                </div>
              )}
              <label className="grid gap-2 text-sm">
                Emoji do mapa
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
                Quem pode entrar
                <select
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
                  onChange={(event) => setEventAccessMode(event.target.value as MapEvent['accessMode'])}
                  value={eventAccessMode}
                >
                  <option value="open">Aberto para qualquer pessoa</option>
                  <option value="approval">Precisa de autorização</option>
                  <option value="password">Precisa de senha</option>
                </select>
              </label>
              {eventAccessMode === 'approval' && (
                <p className="rounded-lg bg-white/8 p-3 text-xs text-slate-300">
                  Dono e moderadores poderão aprovar quem pedir para entrar.
                </p>
              )}
              {eventAccessMode === 'password' && (
                <input
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm outline-none"
                  onChange={(event) => setEventPassword(event.target.value)}
                  placeholder="Senha do chat"
                  type="password"
                  value={eventPassword}
                />
              )}
              {me.isPremium && (
                <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm">
                  <span>
                    <span className="block font-semibold">Chat permanente</span>
                    <span className="text-xs text-slate-300">Disponível para Premium. Apenas 1 chat permanente por pessoa.</span>
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
              <button className="h-11 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950" type="submit">
                Criar e entrar
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
                aria-label="Fechar"
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
            key={theme}
            url={tileLayer.url}
          />
          {me.isPremium && <MapClickTarget onPick={setSelectedPoint} />}

          {me.location && (
            <Marker icon={meIcon} position={[me.location.lat, me.location.lng]}>
              <Popup>
                <strong>Você</strong>
                <br />
                Sua posição aproximada
              </Popup>
            </Marker>
          )}

          {me.isPremium && selectedPoint && (
            <Marker icon={draftIcon} position={[selectedPoint.lat, selectedPoint.lng]}>
              <Popup>Ponto escolhido para o novo chat</Popup>
            </Marker>
          )}

          <ClusteredProfileMarkers me={me} profiles={profiles} />
          <ClusteredEventMarkers
            creatorNames={eventCreatorNames}
            eventParticipantCounts={eventParticipantCounts}
            events={visibleEvents}
            me={me}
            onOpenCluster={setClusteredEvents}
            onPreviewEvent={setPreviewEvent}
          />

          {false && profiles.map((profile) => {
            const position = visibleLocation(profile);
            if (!position) return null;

            return (
              <Marker icon={personIcon} key={profile.uid} position={[position.lat, position.lng]}>
                <Popup>
                  <strong>{profile.displayName}</strong>
                  <br />
                  {me.location ? `${distanceKm(me.location, position).toFixed(1)} km de você` : 'Distância indisponível'}
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
                {me.location ? `${distanceKm(me.location, event.location).toFixed(1)} km de você` : 'Distância indisponível'}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </section>

      {(me.isPremium ? selectedPoint : me.location) && (
        <button
          aria-label="Criar chat"
          className="raddo-create-chat-cta absolute left-1/2 z-[560] grid h-20 w-20 -translate-x-1/2 place-items-center rounded-full text-white"
          onClick={() => setCreateChatOpen(true)}
          type="button"
        >
          <Plus className="h-10 w-10" />
          <span className="absolute -bottom-7 whitespace-nowrap text-xs font-semibold text-white drop-shadow">Criar chat</span>
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
            {visibleEvents.length === 0 && <p className="text-sm text-slate-300">Nenhum chat próximo.</p>}
            {sortedVisibleEvents.map((event) => (
              <button
                className="w-full rounded-lg bg-slate-950/60 p-3 text-left"
                key={event.id}
                onClick={() => setPreviewEvent(event)}
                type="button"
              >
                <span className="flex items-center gap-2 truncate text-sm font-semibold">
                  {event.coverURL && <img alt="" className="h-8 w-8 rounded-lg object-cover" src={event.coverURL} />}
                  <MessageCircle className="h-4 w-4 text-fuchsia-300" />
                  {event.title}
                </span>
                <span className="mt-1 block text-xs font-semibold text-teal-200">Criado por {creatorLabel(event)}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-slate-300">
                  <Users className="h-3.5 w-3.5" />
                  {eventParticipantCounts[event.id] ?? 1} online agora
                </span>
                <span className="mt-1 block text-xs text-slate-300">
                  {me.location ? `${distanceKm(me.location, event.location).toFixed(1)} km` : 'Distância indisponível'} - {formatRadius(event.radiusKm)}
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
            {profiles.length === 0 && <p className="text-sm text-slate-300">Nenhum perfil no raio atual.</p>}
            {profileActionMessage && <p className="rounded-lg bg-white/8 p-2 text-xs text-slate-100">{profileActionMessage}</p>}
            {sortedProfiles.slice(0, 6).map((profile) => (
              <article className="flex items-center gap-3" key={profile.uid}>
                <button className="shrink-0" onClick={() => setPreviewProfile(profile)} type="button">
                  <img alt="" className="h-11 w-11 rounded-lg object-cover" src={profile.photoURL} />
                </button>
                <button className="min-w-0 flex-1 text-left" onClick={() => setPreviewProfile(profile)} type="button">
                  <h3 className="truncate text-sm font-semibold">{profile.displayName}</h3>
                  <p className="text-xs text-slate-300">
                    {me.location && profile.location
                      ? `${distanceKm(me.location, profile.location).toFixed(1)} km`
                      : 'Distância indisponível'}
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




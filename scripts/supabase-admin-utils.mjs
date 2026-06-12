import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export const PROFILE_BUCKET = 'profile-photos';

export function loadDotEnv(path = '.env') {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export function createSupabaseAdmin() {
  loadDotEnv();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_URL.');
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Add it to your local environment before running admin scripts.');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bytesToHuman(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export function objectSize(row) {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return Number(metadata.size || metadata.contentLength || 0);
}

export function pathFromStorageValue(value) {
  if (!value || typeof value !== 'string') return '';
  if (!value.startsWith('http')) return value.replace(/^profile-photos\//, '');

  try {
    const url = new URL(value);
    const publicMarker = `/storage/v1/object/public/${PROFILE_BUCKET}/`;
    const signMarker = `/storage/v1/object/sign/${PROFILE_BUCKET}/`;
    if (url.pathname.includes(publicMarker)) return decodeURIComponent(url.pathname.split(publicMarker)[1] || '');
    if (url.pathname.includes(signMarker)) return decodeURIComponent(url.pathname.split(signMarker)[1] || '');
  } catch {
    return '';
  }
  return '';
}

export function categorizePath(path) {
  if (!path) return 'unknown';
  if (path.includes('/chat-images/')) return 'chat-media';
  if (path.includes('/map-stories/')) return 'story-media';
  if (path.includes('/map-events/')) return 'chat-covers';
  if (path.includes('/video-moderation/')) return 'moderation-temp';
  if (path.includes('/profile-')) return 'profile-photos';
  return 'other-profile-bucket';
}

export async function fetchStorageObjects(supabase, bucket = PROFILE_BUCKET) {
  const rows = [];
  const pageSize = 1000;

  async function walk(prefix = '') {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      const items = data || [];

      for (const item of items) {
        const name = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) {
          rows.push({ ...item, bucket_id: bucket, name });
        } else {
          await walk(name);
        }
      }

      if (items.length < pageSize) break;
    }
  }

  await walk('');
  return rows;
}

export async function fetchReferencedStoragePaths(supabase) {
  const references = new Set();

  function add(value) {
    const path = pathFromStorageValue(value);
    if (path) references.add(path);
  }

  const [{ data: profiles }, { data: events }, { data: stories }, { data: messages }, { data: mapMessages }] = await Promise.all([
    supabase.from('profiles').select('photo_url,photos'),
    supabase.from('map_events').select('cover_url'),
    supabase.from('map_event_stories').select('image_url'),
    supabase.from('messages').select('image_path,image_url'),
    supabase.from('map_event_messages').select('image_path,image_url'),
  ]);

  for (const profile of profiles || []) {
    add(profile.photo_url);
    for (const photo of profile.photos || []) add(photo);
  }
  for (const event of events || []) add(event.cover_url);
  for (const story of stories || []) add(story.image_url);
  for (const message of messages || []) {
    add(message.image_path);
    add(message.image_url);
  }
  for (const message of mapMessages || []) {
    add(message.image_path);
    add(message.image_url);
  }

  return references;
}

export async function removeStoragePaths(supabase, paths, execute) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return { count: 0, paths: [] };
  if (!execute) return { count: uniquePaths.length, paths: uniquePaths };

  const batchSize = 100;
  for (let index = 0; index < uniquePaths.length; index += batchSize) {
    const batch = uniquePaths.slice(index, index + batchSize);
    const { error } = await supabase.storage.from(PROFILE_BUCKET).remove(batch);
    if (error) throw error;
  }
  return { count: uniquePaths.length, paths: uniquePaths };
}

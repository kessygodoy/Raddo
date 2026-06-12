import {
  bytesToHuman,
  categorizePath,
  createSupabaseAdmin,
  fetchReferencedStoragePaths,
  fetchStorageObjects,
  objectSize,
  pathFromStorageValue,
  removeStoragePaths,
} from './supabase-admin-utils.mjs';

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const now = new Date();
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
const expiredMapEventsBefore = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

const supabase = createSupabaseAdmin();
const plannedPaths = new Set();
const plannedReasons = new Map();
const plannedDeletes = [];

function planPath(path, reason) {
  if (!path) return;
  plannedPaths.add(path);
  if (!plannedReasons.has(reason)) plannedReasons.set(reason, []);
  plannedReasons.get(reason).push(path);
}

async function deleteRows(label, query) {
  plannedDeletes.push(label);
  if (!execute) return;
  const { error } = await query;
  if (error) throw error;
}

async function deleteRowsByIds(label, table, ids) {
  plannedDeletes.push(`${label}: ${ids.length}`);
  if (!execute || ids.length === 0) return;
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) throw error;
}

const { data: expiredStories, error: expiredStoriesError } = await supabase
  .from('map_event_stories')
  .select('id,image_url,expires_at')
  .lt('expires_at', now.toISOString());
if (expiredStoriesError) throw expiredStoriesError;
for (const story of expiredStories || []) planPath(pathFromStorageValue(story.image_url), 'expired stories');
await deleteRows(
  `expired story rows: ${(expiredStories || []).length}`,
  supabase.from('map_event_stories').delete().lt('expires_at', now.toISOString()),
);

const { data: viewOnceMessages, error: viewOnceError } = await supabase
  .from('messages')
  .select('id,image_path,image_url,created_at,viewed_by')
  .eq('view_once', true)
  .eq('message_type', 'image');
if (viewOnceError) throw viewOnceError;
const staleViewOnceMessages = (viewOnceMessages || []).filter(
  (message) => Date.parse(message.created_at) < Date.parse(oneDayAgo) || (message.viewed_by || []).length > 0,
);
for (const message of staleViewOnceMessages) planPath(message.image_path || pathFromStorageValue(message.image_url), 'match view-once media');
await deleteRowsByIds('match view-once message rows', 'messages', staleViewOnceMessages.map((message) => message.id));

const { data: viewOnceMapMessages, error: viewOnceMapError } = await supabase
  .from('map_event_messages')
  .select('id,image_path,image_url,created_at,viewed_by')
  .eq('view_once', true)
  .eq('message_type', 'image');
if (viewOnceMapError) throw viewOnceMapError;
const staleViewOnceMapMessages = (viewOnceMapMessages || []).filter(
  (message) => Date.parse(message.created_at) < Date.parse(oneDayAgo) || (message.viewed_by || []).length > 0,
);
for (const message of staleViewOnceMapMessages) planPath(message.image_path || pathFromStorageValue(message.image_url), 'map view-once media');
await deleteRowsByIds('map view-once message rows', 'map_event_messages', staleViewOnceMapMessages.map((message) => message.id));

const { data: expiredEvents, error: expiredEventsError } = await supabase
  .from('map_events')
  .select('id,cover_url,created_at')
  .eq('is_permanent', false)
  .lt('created_at', expiredMapEventsBefore);
if (expiredEventsError) throw expiredEventsError;
for (const event of expiredEvents || []) planPath(pathFromStorageValue(event.cover_url), 'expired map event covers');
await deleteRowsByIds('expired map events', 'map_events', (expiredEvents || []).map((event) => event.id));

await deleteRows('push delivery logs older than 30 days', supabase.from('push_delivery_logs').delete().lt('created_at', thirtyDaysAgo));
await deleteRows('anti-spam logs older than 30 days', supabase.from('anti_spam_events').delete().lt('created_at', thirtyDaysAgo));
await deleteRows('reports older than 90 days', supabase.from('reports').delete().lt('created_at', ninetyDaysAgo));
await deleteRows('image moderation reports older than 90 days', supabase.from('image_moderation_reports').delete().lt('created_at', ninetyDaysAgo));

const objects = await fetchStorageObjects(supabase);
const references = await fetchReferencedStoragePaths(supabase);
let orphanBytes = 0;
for (const object of objects) {
  const createdAt = object.created_at ? new Date(object.created_at) : now;
  const olderThanOneDay = createdAt.getTime() < new Date(oneDayAgo).getTime();
  const isModerationTemp = object.name.includes('/video-moderation/');
  const isReferenced = references.has(object.name);
  if ((isModerationTemp || !isReferenced) && olderThanOneDay) {
    planPath(object.name, isModerationTemp ? 'old moderation temp files' : 'orphan storage objects');
    orphanBytes += objectSize(object);
  }
}

let plannedBytes = 0;
const sizeByPath = new Map(objects.map((object) => [object.name, objectSize(object)]));
for (const path of plannedPaths) plannedBytes += sizeByPath.get(path) || 0;

console.log(`Raddo cleanup ${execute ? 'EXECUTE' : 'DRY RUN'}`);
console.log(`Storage files planned: ${plannedPaths.size} (${bytesToHuman(plannedBytes)})`);
console.log(`Probable orphan bytes included: ${bytesToHuman(orphanBytes)}`);
console.log('');

for (const [reason, paths] of plannedReasons.entries()) {
  const bytes = paths.reduce((sum, path) => sum + (sizeByPath.get(path) || 0), 0);
  console.log(`- ${reason}: ${paths.length} files, ${bytesToHuman(bytes)}`);
}

console.log('');
console.log('Database cleanup steps:');
for (const label of plannedDeletes) console.log(`- ${execute ? 'deleted' : 'would delete'} ${label}`);

const result = await removeStoragePaths(supabase, [...plannedPaths], execute);
console.log('');
console.log(`${execute ? 'Deleted' : 'Would delete'} ${result.count} storage files.`);

if (!execute) {
  console.log('');
  console.log('Nothing was deleted. Run with --execute after reviewing the dry-run output:');
  console.log('  npm run supabase:cleanup:execute');
}

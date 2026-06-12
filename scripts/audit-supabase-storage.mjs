import {
  bytesToHuman,
  categorizePath,
  createSupabaseAdmin,
  fetchReferencedStoragePaths,
  fetchStorageObjects,
  objectSize,
} from './supabase-admin-utils.mjs';

const supabase = createSupabaseAdmin();
const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
if (bucketsError) throw bucketsError;
const bucketObjects = await Promise.all((buckets || []).map(async (bucket) => ({
  bucket,
  objects: await fetchStorageObjects(supabase, bucket.id),
})));
const objects = bucketObjects.flatMap(({ bucket, objects: bucketRows }) =>
  bucketRows.map((object) => ({ ...object, bucket_id: bucket.id })),
);
const references = await fetchReferencedStoragePaths(supabase);

const totals = new Map();
let totalBytes = 0;
let orphanBytes = 0;
let orphanCount = 0;

for (const object of objects) {
  const size = objectSize(object);
  const category = categorizePath(object.name);
  totalBytes += size;
  const current = totals.get(category) || { bytes: 0, count: 0 };
  current.bytes += size;
  current.count += 1;
  totals.set(category, current);
  if (!references.has(object.name)) {
    orphanBytes += size;
    orphanCount += 1;
  }
}

console.log('Raddo Supabase Storage audit');
console.log(`Buckets: ${(buckets || []).map((bucket) => bucket.id).join(', ') || 'none'}`);
console.log(`Bucket objects: ${objects.length}`);
console.log(`Total size: ${bytesToHuman(totalBytes)}`);
console.log('');
console.log('By bucket/folder/category:');
for (const [category, total] of [...totals.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`- ${category}: ${bytesToHuman(total.bytes)} (${total.count} objects)`);
}

console.log('');
console.log(`Probable orphan objects: ${orphanCount} (${bytesToHuman(orphanBytes)})`);

console.log('');
console.log('Largest objects:');
for (const object of [...objects].sort((a, b) => objectSize(b) - objectSize(a)).slice(0, 25)) {
  console.log(`- ${bytesToHuman(objectSize(object)).padStart(10)}  ${object.bucket_id.padEnd(16)}  ${categorizePath(object.name).padEnd(20)}  ${object.name}`);
}

console.log('');
console.log('Run cleanup in dry mode first:');
console.log('  npm run supabase:cleanup:dry');

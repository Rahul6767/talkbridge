// Applies one source's documents to an index: upsert new/changed, skip unchanged,
// delete documents this source created that are gone from the feed. Never deletes
// records from other sources (e.g. the fictional demo session) and never drops an index.

// Bookkeeping fields added next to the Session fields. Additive mapping change only.
const SYNC_FIELDS = {
  source: { type: "keyword" },
  contentHash: { type: "keyword", index: false },
  syncedAt: { type: "date" },
};

// Speaker profiles: created and owned by the sync job (no seed script for this index).
const SPEAKER_MAPPING = {
  properties: {
    id: { type: "keyword" },
    fullName: { type: "text", fields: { raw: { type: "keyword" } } },
    tagLine: { type: "text" },
    company: { type: "keyword" },
    title: { type: "text" },
    bio: { type: "text" },
    photoUrl: { type: "keyword", index: false },
    links: { type: "object", enabled: false },
    sessionIds: { type: "keyword" },
    ...SYNC_FIELDS,
  },
};

// If a feed suddenly returns far fewer documents than we hold, the page is probably
// broken; keep existing data rather than mass-deleting.
const MIN_FEED_RATIO = 0.5;

export async function ensureSyncFields(client, index) {
  if (!(await client.indices.exists({ index }))) {
    throw new Error(`Index ${index} does not exist; run scripts/seed.mjs first (it owns the mapping).`);
  }
  await client.indices.putMapping({ index, properties: SYNC_FIELDS });
}

export async function ensureSpeakerIndex(client, index) {
  if (!(await client.indices.exists({ index }))) {
    await client.indices.create({ index, mappings: SPEAKER_MAPPING });
  }
}

/** id -> { source, contentHash } for every document in the index (empty if it doesn't exist yet). */
export async function loadExisting(client, index) {
  const existing = new Map();
  if (!(await client.indices.exists({ index }))) return existing;
  const result = await client.search({
    index,
    size: 10_000,
    _source: ["source", "contentHash"],
    query: { match_all: {} },
  });
  for (const hit of result.hits.hits) {
    existing.set(hit._id, { source: hit._source?.source, contentHash: hit._source?.contentHash });
  }
  return existing;
}

/**
 * @param docs   documents with `id` and `contentHash`
 * @param toDoc  optional extra fields per document (e.g. the semantic_text `content`)
 */
export async function applySource(
  client,
  index,
  { source, sessions: docs, existing, dryRun, log, toDoc = () => ({}) }
) {
  const now = new Date().toISOString();
  const feedIds = new Set(docs.map((d) => d.id));

  const toUpsert = [];
  let added = 0;
  let unchanged = 0;
  for (const d of docs) {
    const previous = existing.get(d.id);
    if (previous?.contentHash === d.contentHash && previous?.source === source) {
      unchanged++;
      continue;
    }
    if (!previous) added++;
    toUpsert.push({ ...d, ...toDoc(d), source, syncedAt: now });
  }
  const updated = toUpsert.length - added;

  const owned = [...existing].filter(([, doc]) => doc.source === source).map(([id]) => id);
  let toDelete = owned.filter((id) => !feedIds.has(id));
  let deletesSkipped = false;
  if (owned.length >= 10 && docs.length < owned.length * MIN_FEED_RATIO) {
    log(
      `WARN ${source}: feed has ${docs.length} documents but ${index} holds ${owned.length}; ` +
        `skipping ${toDelete.length} deletes in case the feed is broken.`
    );
    toDelete = [];
    deletesSkipped = true;
  }

  const counts = { added, updated, unchanged, deleted: toDelete.length, failed: 0, deletesSkipped };
  if (dryRun) return counts;

  if (toUpsert.length > 0) {
    const result = await client.helpers.bulk({
      datasource: toUpsert,
      onDocument: (doc) => ({ index: { _index: index, _id: doc.id } }),
      // semantic_text embeds at ingest time, so keep batches small.
      flushBytes: 100_000,
      refreshOnCompletion: index,
      onDrop: (dropped) => log(`ERROR dropped ${dropped.document.id}: ${dropped.error?.reason}`),
    });
    counts.failed += result.failed;
  }

  if (toDelete.length > 0) {
    const result = await client.helpers.bulk({
      datasource: toDelete.map((id) => ({ id })),
      onDocument: (doc) => ({ delete: { _index: index, _id: doc.id } }),
      refreshOnCompletion: index,
      onDrop: (dropped) => log(`ERROR could not delete ${dropped.document.id}: ${dropped.error?.reason}`),
    });
    counts.failed += result.failed;
  }

  return counts;
}

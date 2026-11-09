// Owner: Rahul (B) — task A2 (moved from Hemanth). Spec: Notion guide, Phase 4 "Seed script".
// Run: node --env-file=.env.local scripts/seed.mjs --reset
// Uses ELASTICSEARCH_SEED_API_KEY (write) — the only place that key is used.
import { readFile } from "node:fs/promises";
import { Client } from "@elastic/elasticsearch";

const node = process.env.ELASTICSEARCH_URL;
const apiKey = process.env.ELASTICSEARCH_SEED_API_KEY;
if (!node || !apiKey) {
  throw new Error("Missing ELASTICSEARCH_URL or ELASTICSEARCH_SEED_API_KEY.");
}

const index = "talkbridge-sessions";
const inferenceId = process.env.ELASTICSEARCH_INFERENCE_ID;
const reset = process.argv.includes("--reset");

const sessions = JSON.parse(
  await readFile(new URL("../data/sessions.json", import.meta.url), "utf8")
);

// Validate before touching the cluster, so a bad record never leaves a half-built index.
const STRING_FIELDS = ["id", "title", "track", "level", "day", "room", "abstract", "sourceUrl"];
const REQUIRED_NON_EMPTY = ["id", "title", "track", "level", "day", "abstract"];
const seen = new Set();
for (const s of sessions) {
  const label = typeof s?.id === "string" ? s.id : JSON.stringify(s).slice(0, 80);
  for (const field of STRING_FIELDS) {
    if (typeof s[field] !== "string") throw new Error(`${label}: "${field}" must be a string`);
  }
  for (const field of REQUIRED_NON_EMPTY) {
    if (!s[field].trim()) throw new Error(`${label}: "${field}" is empty`);
  }
  if (!Array.isArray(s.speakers) || !s.speakers.every((p) => typeof p === "string")) {
    throw new Error(`${label}: "speakers" must be an array of strings`);
  }
  if (seen.has(s.id)) throw new Error(`Duplicate session id: ${s.id}`);
  seen.add(s.id);
}

const client = new Client({ node, auth: { apiKey } });

try {
  if (reset && (await client.indices.exists({ index }))) {
    await client.indices.delete({ index });
    console.log("Deleted old index.");
  }

  if (!(await client.indices.exists({ index }))) {
    await client.indices.create({
      index,
      mappings: {
        properties: {
          // keyword = exact filters/facets; text = BM25 keyword search.
          id: { type: "keyword" },
          title: { type: "text" },
          speakers: { type: "text", fields: { raw: { type: "keyword" } } },
          track: { type: "keyword" },
          level: { type: "keyword" },
          day: { type: "keyword" },
          room: { type: "keyword" },
          abstract: { type: "text" },
          sourceUrl: { type: "keyword", index: false },
          // Elasticsearch embeds this at ingest time; semantic queries need no client vectors.
          content: inferenceId
            ? { type: "semantic_text", inference_id: inferenceId }
            : { type: "semantic_text" },
        },
      },
    });
    console.log("Created index " + index);
  }

  const result = await client.helpers.bulk({
    datasource: sessions.map((s) => ({ ...s, content: s.title + "\n\n" + s.abstract })),
    // Stable _id = session id, so re-running the seed overwrites instead of duplicating.
    onDocument: (doc) => ({ index: { _index: index, _id: doc.id } }),
    flushBytes: 100_000,
    refreshOnCompletion: index,
    onDrop: (dropped) =>
      console.error("Dropped:", dropped.document.id, dropped.error?.reason),
  });

  console.log(`Indexed ${result.successful}/${result.total}; failed ${result.failed}.`);
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await client.close();
}

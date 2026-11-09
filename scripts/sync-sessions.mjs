// Owner: Hemanth (A). Keeps talkbridge-sessions in step with the official KubeCon NA 2026
// schedule. Runs every 6 hours as the talkbridge-sync CronJob (k8s/sync-cronjob.yaml).
//
//   node --env-file=.env.local scripts/sync-sessions.mjs --dry-run   # read-only: show what would change
//   node --env-file=.env.local scripts/sync-sessions.mjs             # apply changes
//
// Writes require ELASTICSEARCH_SYNC_API_KEY. A dry run only reads, so it uses the sync key or the
// read-only ELASTICSEARCH_API_KEY. The seed key (ELASTICSEARCH_SEED_API_KEY) is never used here.
// Required key privileges for writes, on indices talkbridge-sessions and talkbridge-speakers:
// read, write, view_index_metadata, manage (manage: additive putMapping on sessions, and
// creating talkbridge-speakers on the first run).
// Also syncs speaker profiles (bio, company, links the speakers published) into talkbridge-speakers.
import { Client } from "@elastic/elasticsearch";
import { hashDocument, hashSession, validateSession, validateSpeaker } from "./sync/common.mjs";
import * as kubecon from "./sync/kubecon.mjs";
import { applySource, ensureSpeakerIndex, ensureSyncFields, loadExisting } from "./sync/elastic.mjs";
import { inSpan, log, recordCounts, startTelemetry, stopTelemetry } from "./sync/telemetry.mjs";

const INDEX = "talkbridge-sessions";
const SPEAKER_INDEX = "talkbridge-speakers";
const SOURCES = [kubecon];

const dryRun = process.argv.includes("--dry-run");
const node = process.env.ELASTICSEARCH_URL;
const apiKey = dryRun
  ? process.env.ELASTICSEARCH_SYNC_API_KEY || process.env.ELASTICSEARCH_API_KEY
  : process.env.ELASTICSEARCH_SYNC_API_KEY;

if (!node || !apiKey) {
  console.error(
    dryRun
      ? "Missing ELASTICSEARCH_URL, or neither ELASTICSEARCH_SYNC_API_KEY nor ELASTICSEARCH_API_KEY is set."
      : "Missing ELASTICSEARCH_URL or ELASTICSEARCH_SYNC_API_KEY (a key with write access)."
  );
  process.exit(2);
}

startTelemetry();
const client = new Client({ node, auth: { apiKey }, requestTimeout: 120_000 });
let failedSources = 0;

try {
  await inSpan("talkbridge.sync", { "talkbridge.sync.dry_run": dryRun }, async (root) => {
    if (!dryRun) {
      await ensureSyncFields(client, INDEX);
      await ensureSpeakerIndex(client, SPEAKER_INDEX);
    }
    const existing = await loadExisting(client, INDEX);
    const existingSpeakers = await loadExisting(client, SPEAKER_INDEX);
    root.setAttribute("talkbridge.sync.index_documents_before", existing.size);

    async function syncSpeakers(source, { speakers: raw, skipped }) {
      return inSpan("talkbridge.sync.speakers", { "talkbridge.sync.source": source }, async () => {
        const valid = [];
        let rejected = skipped.length;
        for (const s of raw) {
          const problem = validateSpeaker(s);
          if (problem) {
            rejected++;
            log(`WARN ${source}: rejected speaker ${s.id}: ${problem}`);
          } else {
            valid.push({ ...s, contentHash: hashDocument(s) });
          }
        }
        const counts = await applySource(client, SPEAKER_INDEX, {
          source,
          sessions: valid,
          existing: existingSpeakers,
          dryRun,
          log,
        });
        return { ...counts, rejected };
      });
    }

    for (const source of SOURCES) {
      const started = Date.now();
      try {
        const counts = await inSpan(
          "talkbridge.sync.source",
          { "talkbridge.sync.source": source.SOURCE },
          async (span) => {
            const { sessions: raw, skipped, cards, speakerData } = await source.fetchSchedule();
            const valid = [];
            let rejected = 0;
            for (const s of raw) {
              const problem = validateSession(s);
              if (problem) {
                rejected++;
                log(`WARN ${source.SOURCE}: rejected ${s.id}: ${problem}`);
              } else {
                valid.push({ ...s, contentHash: hashSession(s) });
              }
            }
            const result = await applySource(client, INDEX, {
              source: source.SOURCE,
              sessions: valid,
              existing,
              dryRun,
              log,
              // semantic_text field Elasticsearch embeds for semantic/hybrid search.
              toDoc: (doc) => ({ content: `${doc.title}\n\n${doc.abstract}` }),
            });
            if (result.failed > 0) throw new Error(`${result.failed} sessions failed to index`);

            const speakers = await syncSpeakers(source.SOURCE, speakerData);
            const all = {
              ...result,
              rejected,
              skipped: skipped.length,
              fetched: cards,
              speakers_added: speakers.added,
              speakers_updated: speakers.updated,
              speakers_unchanged: speakers.unchanged,
              speakers_deleted: speakers.deleted,
              speakers_rejected: speakers.rejected,
            };
            for (const [key, value] of Object.entries(all)) {
              span.setAttribute(`talkbridge.sync.${key}`, value);
            }
            if (speakers.failed > 0) throw new Error(`${speakers.failed} speakers failed to index`);
            return all;
          }
        );
        recordCounts(source.SOURCE, counts, Date.now() - started, true);
        log(
          `${dryRun ? "[dry run] " : ""}${source.SOURCE}: ${counts.fetched} cards, ` +
            `${counts.added} added, ${counts.updated} updated, ${counts.unchanged} unchanged, ` +
            `${counts.deleted} deleted${counts.deletesSkipped ? " (deletes skipped)" : ""}, ` +
            `${counts.skipped} skipped (no abstract), ${counts.rejected} rejected; speakers: ` +
            `${counts.speakers_added} added, ${counts.speakers_updated} updated, ` +
            `${counts.speakers_unchanged} unchanged, ${counts.speakers_deleted} deleted, ` +
            `${counts.speakers_rejected} rejected`,
          counts
        );
      } catch (error) {
        failedSources++;
        recordCounts(source.SOURCE, { failed: 1 }, Date.now() - started, false);
        log(`ERROR ${source.SOURCE}: sync failed: ${error?.message ?? error}`);
      }
    }
  });
} finally {
  await client.close();
  await stopTelemetry();
}

// Non-zero exit marks the Kubernetes Job as failed, which Radar and Dash0 surface.
process.exitCode = failedSources > 0 ? 1 : 0;

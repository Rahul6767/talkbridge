// Owner: Hemanth (A). Keeps talkbridge-sessions in step with the official KubeCon NA 2026
// schedule. Runs every 6 hours as the talkbridge-sync CronJob (k8s/sync-cronjob.yaml).
//
//   node --env-file=.env.local scripts/sync-sessions.mjs --dry-run   # read-only: show what would change
//   node --env-file=.env.local scripts/sync-sessions.mjs             # apply changes
//
// Writes use ELASTICSEARCH_SYNC_API_KEY.
// A dry run only reads, so it can fall back to the read-only ELASTICSEARCH_API_KEY.
// Required key privileges for writes, on index talkbridge-sessions: read, write,
// view_index_metadata, manage (manage is only for the additive putMapping of sync fields).
import { Client } from "@elastic/elasticsearch";
import { hashSession, validateSession } from "./sync/common.mjs";
import * as kubecon from "./sync/kubecon.mjs";
import { applySource, ensureSyncFields, loadExisting } from "./sync/elastic.mjs";
import { inSpan, log, recordCounts, startTelemetry, stopTelemetry } from "./sync/telemetry.mjs";

const INDEX = "talkbridge-sessions";
const SOURCES = [kubecon];

const dryRun = process.argv.includes("--dry-run");
const node = process.env.ELASTICSEARCH_URL;
const apiKey = dryRun
  ? process.env.ELASTICSEARCH_SYNC_API_KEY || process.env.ELASTICSEARCH_API_KEY
  : process.env.ELASTICSEARCH_SYNC_API_KEY;

if (!node || !apiKey) {
  console.error(
    dryRun
      ? "Missing ELASTICSEARCH_URL or an Elasticsearch API key."
      : "Missing ELASTICSEARCH_URL or ELASTICSEARCH_SYNC_API_KEY (a key with write access)."
  );
  process.exit(2);
}

startTelemetry();
const client = new Client({ node, auth: { apiKey }, requestTimeout: 120_000 });
let failedSources = 0;

try {
  await inSpan("talkbridge.sync", { "talkbridge.sync.dry_run": dryRun }, async (root) => {
    if (!dryRun) await ensureSyncFields(client, INDEX);
    const existing = await loadExisting(client, INDEX);
    root.setAttribute("talkbridge.sync.index_documents_before", existing.size);

    for (const source of SOURCES) {
      const started = Date.now();
      try {
        const counts = await inSpan(
          "talkbridge.sync.source",
          { "talkbridge.sync.source": source.SOURCE },
          async (span) => {
            const { sessions: raw, skipped, cards } = await source.fetchSessions();
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
            });
            const all = { ...result, rejected, skipped: skipped.length, fetched: cards };
            for (const [key, value] of Object.entries(all)) {
              span.setAttribute(`talkbridge.sync.${key}`, value);
            }
            if (result.failed > 0) throw new Error(`${result.failed} documents failed to index`);
            return all;
          }
        );
        recordCounts(source.SOURCE, counts, Date.now() - started, true);
        log(
          `${dryRun ? "[dry run] " : ""}${source.SOURCE}: ${counts.fetched} cards, ` +
            `${counts.added} added, ${counts.updated} updated, ${counts.unchanged} unchanged, ` +
            `${counts.deleted} deleted${counts.deletesSkipped ? " (deletes skipped)" : ""}, ` +
            `${counts.skipped} skipped (no abstract), ${counts.rejected} rejected`,
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

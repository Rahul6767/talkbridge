import "server-only";
import { Client } from "@elastic/elasticsearch";

export const SESSION_INDEX = "talkbridge-sessions";
/** The semantic_text field holds embeddings; never return it to the browser. */
export const SOURCE_EXCLUDES = ["content"];

let client: Client | undefined;

/** Uses the read-only app key. Only scripts/seed.mjs uses the seed key. */
export function getElasticClient() {
  const node = process.env.ELASTICSEARCH_URL;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  if (!node || !apiKey) {
    throw new Error("Missing Elasticsearch settings.");
  }
  if (!client) {
    client = new Client({ node, auth: { apiKey }, requestTimeout: 10_000 });
  }
  return client;
}

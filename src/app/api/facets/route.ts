// Owner: Hemanth (A) — task A4. Spec: Notion guide, Phase 6 facets route.
// Distinct track, level and day values for the UI filters.
import { connection, NextResponse } from "next/server";
import type { estypes } from "@elastic/elasticsearch";
import { getElasticClient, SESSION_INDEX } from "@/lib/elastic";
import { observe } from "@/lib/telemetry";
import type { Facets } from "@/lib/types";

export async function GET() {
  // This handler does not read the request; without connection() Next 16
  // (cacheComponents) would try to prerender it at build time.
  await connection();

  try {
    const result = await observe("talkbridge.facets", {}, () =>
      getElasticClient().search({
        index: SESSION_INDEX,
        size: 0,
        aggs: {
          tracks: { terms: { field: "track", size: 50 } },
          levels: { terms: { field: "level", size: 10 } },
          days: { terms: { field: "day", size: 10, order: { _key: "asc" } } },
        },
      })
    );

    const keys = (name: string) => {
      const agg = result.aggregations?.[name] as
        | estypes.AggregationsStringTermsAggregate
        | undefined;
      const buckets = (agg?.buckets ?? []) as estypes.AggregationsStringTermsBucket[];
      return buckets.map((bucket) => String(bucket.key));
    };

    return NextResponse.json<Facets>({
      tracks: keys("tracks"),
      levels: keys("levels"),
      days: keys("days"),
    });
  } catch {
    return NextResponse.json({ error: "Facets unavailable." }, { status: 500 });
  }
}

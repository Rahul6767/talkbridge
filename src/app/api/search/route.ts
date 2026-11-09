// Owner: Hemanth (A) — task A3. Spec: Notion guide, Phase 6 search route.
// Keyword (BM25), semantic (semantic_text) or hybrid (RRF of both) search with filters.
import { NextRequest, NextResponse } from "next/server";
import type { estypes } from "@elastic/elasticsearch";
import { getElasticClient, SESSION_INDEX, SOURCE_EXCLUDES } from "@/lib/elastic";
import { log, observe, searchResults } from "@/lib/telemetry";
import { rateLimit } from "@/lib/rate-limit";
import type { SearchMode, SearchResponse, Session } from "@/lib/types";

const MODES: SearchMode[] = ["keyword", "semantic", "hybrid"];
const FILTER_FIELDS = ["track", "level", "day"] as const;

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "search", 60);
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  if (q.length > 200) {
    return NextResponse.json(
      { error: "Keep the search under 200 characters." },
      { status: 400 }
    );
  }

  // Empty query lists everything, which only makes sense as a keyword (match_all) search.
  const requested = params.get("mode") as SearchMode | null;
  const mode: SearchMode = !q
    ? "keyword"
    : requested && MODES.includes(requested)
      ? requested
      : "hybrid";

  const filters: estypes.QueryDslQueryContainer[] = [];
  for (const field of FILTER_FIELDS) {
    const value = params.get(field);
    if (value) filters.push({ term: { [field]: value.slice(0, 100) } });
  }

  const keyword: estypes.QueryDslQueryContainer = {
    bool: {
      must: q
        ? {
            multi_match: {
              query: q,
              fields: ["title^3", "abstract", "speakers"],
              fuzziness: "AUTO",
            },
          }
        : { match_all: {} },
      filter: filters,
    },
  };
  const semantic: estypes.QueryDslQueryContainer = {
    bool: { must: { semantic: { field: "content", query: q } }, filter: filters },
  };

  try {
    const result = await observe(
      "talkbridge.search",
      {
        "talkbridge.search.mode": mode,
        "talkbridge.search.query_length": q.length,
        "talkbridge.search.filter_count": filters.length,
      },
      async (span) => {
        const es = getElasticClient();
        const found =
          mode === "hybrid"
            ? await es.search<Session>({
                index: SESSION_INDEX,
                size: 20,
                _source: { excludes: SOURCE_EXCLUDES },
                retriever: {
                  rrf: {
                    retrievers: [
                      { standard: { query: keyword } },
                      { standard: { query: semantic } },
                    ],
                    rank_window_size: 50,
                  },
                },
              })
            : await es.search<Session>({
                index: SESSION_INDEX,
                size: q ? 20 : 100,
                _source: { excludes: SOURCE_EXCLUDES },
                query: mode === "semantic" ? semantic : keyword,
              });
        const count = found.hits.hits.length;
        span.setAttribute("talkbridge.search.result_count", count);
        searchResults.record(count, { "talkbridge.search.mode": mode });
        return found;
      }
    );

    const sessions = result.hits.hits.flatMap((hit) =>
      hit._source ? [hit._source] : []
    );
    log("INFO", "search completed", {
      "talkbridge.search.mode": mode,
      "talkbridge.search.result_count": sessions.length,
    });
    return NextResponse.json<SearchResponse>({ mode, sessions });
  } catch {
    // observe() already recorded the error span, metric and log.
    return NextResponse.json(
      { error: "Search failed. Please try again." },
      { status: 500 }
    );
  }
}

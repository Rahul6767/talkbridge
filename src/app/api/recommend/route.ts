// Owner: Hemanth (A) — task A5. Spec: Notion guide, Phase 6 recommend route.
// Semantic search of the attendee's background and goal against talk content.
import { NextResponse } from "next/server";
import { getElasticClient, SESSION_INDEX, SOURCE_EXCLUDES } from "@/lib/elastic";
import { log, observe } from "@/lib/telemetry";
import { rateLimit } from "@/lib/rate-limit";
import type { RecommendResponse, Session } from "@/lib/types";

export async function POST(request: Request) {
  const limited = rateLimit(request, "recommend", 20);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const background =
    typeof body?.background === "string" ? body.background.trim() : "";
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  if (!background || background.length > 1000 || goal.length > 300) {
    return NextResponse.json(
      { error: "Enter a background (up to 1000 characters) and an optional goal." },
      { status: 400 }
    );
  }

  const intent = goal
    ? `I want to learn: ${goal}. My background: ${background}`
    : `Talks useful for someone with this background: ${background}`;

  try {
    const result = await observe(
      "talkbridge.recommend",
      {
        // Lengths only: background and goal are attendee text and never go into telemetry.
        "talkbridge.recommend.background_length": background.length,
        "talkbridge.recommend.has_goal": goal.length > 0,
      },
      async (span) => {
        const found = await getElasticClient().search<Session>({
          index: SESSION_INDEX,
          size: 5,
          _source: { excludes: SOURCE_EXCLUDES },
          query: { semantic: { field: "content", query: intent } },
        });
        span.setAttribute("talkbridge.search.result_count", found.hits.hits.length);
        return found;
      }
    );

    const sessions = result.hits.hits.flatMap((hit) =>
      hit._source ? [hit._source] : []
    );
    log("INFO", "recommendations returned", {
      "talkbridge.search.result_count": sessions.length,
    });
    return NextResponse.json<RecommendResponse>({ sessions });
  } catch {
    return NextResponse.json(
      { error: "Could not load recommendations." },
      { status: 500 }
    );
  }
}

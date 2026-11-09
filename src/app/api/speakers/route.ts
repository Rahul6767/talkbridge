// Owner: Hemanth (A). Speaker profiles for one talk, from talkbridge-speakers.
// No AI here: this is the data speakers published on the official schedule.
import { NextRequest, NextResponse } from "next/server";
import { getElasticClient } from "@/lib/elastic";
import { log, observe } from "@/lib/telemetry";
import { rateLimit } from "@/lib/rate-limit";
import {
  SPEAKER_INDEX,
  type SpeakerProfile,
  type SpeakersResponse,
} from "@/lib/speakers";

const SOURCE_FIELDS = [
  "id", "fullName", "tagLine", "company", "title", "bio", "photoUrl", "links", "sessionIds",
];

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "speakers", 60);
  if (limited) return limited;

  const sessionId = (request.nextUrl.searchParams.get("sessionId") ?? "").trim();
  if (!sessionId || sessionId.length > 200) {
    return NextResponse.json({ error: "Choose a session." }, { status: 400 });
  }

  try {
    const speakers = await observe(
      "talkbridge.speakers.lookup",
      { "talkbridge.session.id": sessionId },
      async (span) => {
        const found = await getElasticClient().search<SpeakerProfile>({
          index: SPEAKER_INDEX,
          size: 20,
          _source: SOURCE_FIELDS,
          query: { term: { sessionIds: sessionId } },
          sort: [{ "fullName.raw": "asc" }],
        });
        span.setAttribute("talkbridge.speakers.count", found.hits.hits.length);
        return found.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : []));
      }
    );
    log("INFO", "speakers returned", {
      "talkbridge.session.id": sessionId,
      "talkbridge.speakers.count": speakers.length,
    });
    return NextResponse.json<SpeakersResponse>({ speakers });
  } catch {
    // Missing index or a key without read access to talkbridge-speakers: the UI hides the section.
    return NextResponse.json({ error: "Speaker profiles are unavailable." }, { status: 503 });
  }
}

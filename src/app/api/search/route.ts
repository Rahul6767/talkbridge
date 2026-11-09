// Owner: Engineer A — task A3. Spec: Notion guide, Phase 6 search route.
// Stub so the app builds; replace this whole file.
// Next 16 + cacheComponents: do NOT export `runtime` or `dynamic` (see CLAUDE.md "Plan deviations").
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ error: "Not implemented yet (A3)." }, { status: 501 });
}

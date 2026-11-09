// Owner: Engineer B. Kubernetes readiness/liveness probe target (Phase 9).
import { connection } from "next/server";

export async function GET() {
  await connection(); // never prerender: must answer per request
  return Response.json({ status: "ok" });
}

import "server-only";
import { NextResponse } from "next/server";

// In-memory, per pod: enough for a one-replica demo, not for production.
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns a 429 response when the caller exceeds perMinute, otherwise null. */
export function rateLimit(request: Request, name: string, perMinute: number) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${name}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > perMinute) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  return null;
}

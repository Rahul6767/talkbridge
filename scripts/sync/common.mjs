// Shared helpers for the session sync job (scripts/sync-sessions.mjs).
import { createHash } from "node:crypto";

export const USER_AGENT =
  "TalkBridgeSync/1.0 (+https://github.com/talkbridge-team/talkbridge; conference prep app)";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET a URL as text with a timeout and one retry on 429/5xx or network errors. */
export async function fetchText(url, { timeoutMs = 60_000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= retries) {
        throw new Error(`GET ${url} -> HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt >= retries) throw error;
    }
    await sleep(2_000 * (attempt + 1));
  }
}

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", darr: "↓", rarr: "→",
  middot: "·", bull: "•", trade: "™", reg: "®", copy: "©",
};

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** HTML fragment -> plain text; paragraphs become blank-line separated, like the seed data. */
export function htmlToText(fragment) {
  return decodeEntities(
    fragment
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/?(ul|ol)[^>]*>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Same rules as scripts/seed.mjs, so synced and seeded records are interchangeable.
const STRING_FIELDS = ["id", "title", "track", "level", "day", "room", "abstract", "sourceUrl"];
const REQUIRED_NON_EMPTY = ["id", "title", "track", "level", "day", "abstract"];

/** Returns an error message, or null if the session is valid. */
export function validateSession(s) {
  for (const field of STRING_FIELDS) {
    if (typeof s[field] !== "string") return `"${field}" must be a string`;
  }
  for (const field of REQUIRED_NON_EMPTY) {
    if (!s[field].trim()) return `"${field}" is empty`;
  }
  if (!Array.isArray(s.speakers) || !s.speakers.every((p) => typeof p === "string")) {
    return `"speakers" must be an array of strings`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.day)) return `"day" must be YYYY-MM-DD`;
  if (s.sourceUrl && !s.sourceUrl.startsWith("https://")) return `"sourceUrl" must be https`;
  return null;
}

/** Returns an error message, or null if the speaker profile is valid. */
export function validateSpeaker(s) {
  for (const field of ["id", "fullName", "tagLine", "company", "title", "bio", "photoUrl"]) {
    if (typeof s[field] !== "string") return `"${field}" must be a string`;
  }
  if (!s.fullName.trim()) return `"fullName" is empty`;
  if (!Array.isArray(s.links) || !s.links.every((l) => l.url?.startsWith("https://"))) {
    return `"links" must be https URLs`;
  }
  if (!Array.isArray(s.sessionIds)) return `"sessionIds" must be an array`;
  return null;
}

export function hashDocument(fields) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

/** Stable hash of the fields users see; unchanged sessions are not re-embedded. */
export function hashSession(s) {
  const canonical = JSON.stringify([
    s.id, s.title, s.speakers, s.track, s.level, s.day, s.room, s.abstract, s.sourceUrl,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

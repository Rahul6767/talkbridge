// Source: the official KubeCon + CloudNativeCon North America 2026 schedule page
// (Linux Foundation). Every session is a server-rendered card that carries the full
// abstract, so one request fetches the whole schedule. Ids match scripts/seed.mjs, so
// the seeded sessions are updated in place rather than duplicated.
import { decodeEntities, fetchText, htmlToText } from "./common.mjs";

export const SOURCE = "kubecon-na-2026";

const DEFAULT_URL =
  "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/";
const ID_PREFIX = "kubecon-na-2026-";
const LEVELS = new Set(["Beginner", "Intermediate", "Advanced", "Any Level"]);

const pick = (re, text) => re.exec(text)?.[1] ?? "";

/** Parses the schedule HTML. Exported separately so it can be tested without the network. */
export function parseSchedule(html) {
  const cards = html.split('<div class="sess-wrap">').slice(1);
  const sessions = [];
  const skipped = [];
  const seen = new Set();

  for (const card of cards) {
    const rawId = pick(/data-session-id="(\d+)"/, card);
    if (!rawId || seen.has(rawId)) continue;
    seen.add(rawId);
    const id = ID_PREFIX + rawId;

    const abstract = htmlToText(pick(/<div class="sess__seodesc">([\s\S]*?)<\/div>/, card));
    if (!abstract) {
      skipped.push({ id, reason: "no abstract (break, keynote or placeholder)" });
      continue;
    }

    const tags = [...card.matchAll(/<span class="tag(?: ([^"]*))?"[^>]*>([\s\S]*?)<\/span>/g)]
      .filter(([, cls]) => !(cls ?? "").includes("tag--asset"))
      .map(([, cls, text]) => ({
        primary: (cls ?? "").includes("tag--primary"),
        text: htmlToText(text),
      }));

    sessions.push({
      id,
      title: htmlToText(pick(/<div class="sess__title">([\s\S]*?)<\/div>/, card)),
      speakers: htmlToText(pick(/<span class="sess__speakers">([\s\S]*?)<\/span>/, card))
        .split(/\s*,\s*/)
        .filter(Boolean),
      track: tags.find((t) => t.primary)?.text || "General",
      level: tags.find((t) => LEVELS.has(t.text))?.text || "Any Level",
      // Times on the page are local Salt Lake City times without an offset.
      day: pick(/<time datetime="([^"]+)"/, card).slice(0, 10),
      room: htmlToText(pick(/<span class="sess__room">([\s\S]*?)<\/span>/, card)),
      abstract,
      sourceUrl: decodeEntities(pick(/class="sess-link" href="([^"]+)"/, card)),
    });
  }

  return { cards: cards.length, sessions, skipped };
}

export async function fetchSessions() {
  const url = process.env.KUBECON_SCHEDULE_URL || DEFAULT_URL;
  const result = parseSchedule(await fetchText(url));
  if (result.cards === 0) {
    throw new Error("No session cards found; the schedule page layout may have changed.");
  }
  return result;
}

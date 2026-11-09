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

// Sessionize custom questions used on this event's speaker profiles.
const QUESTION_COMPANY = 128829;
const QUESTION_TITLE = 128830;
const LINK_TYPES = new Set(["LinkedIn", "Twitter", "Blog", "Company_Website", "Sessionize", "Other"]);

/**
 * Speaker profiles from the page's embedded Sessionize data (<script class="sched-data">).
 * Everything here was published by the speakers themselves on the official schedule,
 * including the LinkedIn and other links they chose to share.
 */
export function parseSpeakers(html) {
  const json = /<script type="application\/json" class="sched-data">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!json) return { speakers: [], skipped: [] };
  const all = JSON.parse(json).all ?? {};
  const speakers = [];
  const skipped = [];
  for (const raw of all.speakers ?? []) {
    const name = (raw.fullName ?? "").trim();
    if (!raw.id || !name) {
      skipped.push({ id: String(raw.id ?? "?"), reason: "no id or name" });
      continue;
    }
    const answer = (questionId) =>
      (raw.questionAnswers ?? []).find((q) => q.questionId === questionId)?.answerValue?.trim() ?? "";
    speakers.push({
      id: `${ID_PREFIX}spk-${raw.id}`,
      fullName: name,
      tagLine: (raw.tagLine ?? "").trim(),
      company: answer(QUESTION_COMPANY),
      title: answer(QUESTION_TITLE),
      bio: (raw.bio ?? "").replace(/\r\n/g, "\n").trim(),
      photoUrl: /^https:\/\//.test(raw.profilePicture ?? "") ? raw.profilePicture : "",
      links: (raw.links ?? [])
        .filter((l) => LINK_TYPES.has(l.linkType) && /^https:\/\//.test(l.url ?? ""))
        .map((l) => ({ type: l.linkType, url: l.url })),
      sessionIds: (raw.sessions ?? []).map((n) => `${ID_PREFIX}${n}`),
    });
  }
  return { speakers, skipped };
}

/** One request for the whole schedule page; sessions and speakers come from the same HTML. */
export async function fetchSchedule() {
  const url = process.env.KUBECON_SCHEDULE_URL || DEFAULT_URL;
  const html = await fetchText(url);
  const sessions = parseSchedule(html);
  if (sessions.cards === 0) {
    throw new Error("No session cards found; the schedule page layout may have changed.");
  }
  return { ...sessions, speakerData: parseSpeakers(html) };
}

export async function fetchSessions() {
  return fetchSchedule();
}

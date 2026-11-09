// Owner: Hemanth (A). Speaker profiles (synced from the official schedule by
// scripts/sync-sessions.mjs) and AI web-research insights. Types are shared by the
// /api/speakers routes and the UI.

export const SPEAKER_INDEX = "talkbridge-speakers";

export type SpeakerLink = {
  /** LinkedIn | Twitter | Blog | Company_Website | Sessionize | Other */
  type: string;
  url: string;
};

/** Published by the speaker on the official schedule (Sessionize). */
export type SpeakerProfile = {
  id: string;
  fullName: string;
  tagLine: string;
  company: string;
  title: string;
  bio: string;
  photoUrl: string;
  links: SpeakerLink[];
  sessionIds: string[];
};

/** AI-generated summary of public professional information, with sources. */
export type SpeakerInsights = {
  summary: string;
  highlights: string[];
  confidence: "high" | "medium" | "low";
  sources: { title: string; url: string }[];
  generatedAt: string;
  cached: boolean;
};

export type SpeakersResponse = { speakers: SpeakerProfile[] };

export const LINK_LABELS: Record<string, string> = {
  LinkedIn: "LinkedIn",
  Twitter: "X / Twitter",
  Blog: "Blog",
  Company_Website: "Company website",
  Sessionize: "Sessionize",
  Other: "Website",
};

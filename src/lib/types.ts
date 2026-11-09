// SHARED CONTRACT — owned jointly by Engineer A and B. Change only with both agreeing (see docs/PLAN.md).

export type Session = {
  id: string;
  title: string;
  speakers: string[];
  track: string;
  level: string;
  day: string;
  room: string;
  abstract: string;
  /** Official session page; empty string for fictional demo sessions. */
  sourceUrl: string;
};

export type SearchMode = "keyword" | "semantic" | "hybrid";

export type Facets = {
  tracks: string[];
  levels: string[];
  days: string[];
};

// API response shapes (request shapes are documented in docs/PLAN.md "API contract").
export type SearchResponse = { mode: SearchMode; sessions: Session[] };
export type RecommendResponse = { sessions: Session[] };
export type PrepareResponse = { guide: string; language: string };
export type ErrorResponse = { error: string };

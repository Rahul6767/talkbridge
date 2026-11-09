"use client";

// Owner: Hemanth (A) — tasks A7–A8. Spec: Notion guide, Phase 7.
// Accessible, multilingual UI over /api/search, /api/facets, /api/recommend and /api/prepare.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { LANGUAGES, READING_LEVELS } from "@/lib/options";
import type {
  Facets,
  PrepareResponse,
  RecommendResponse,
  SearchMode,
  SearchResponse,
  Session,
} from "@/lib/types";

const MODES: { value: SearchMode; label: string; hint: string }[] = [
  { value: "hybrid", label: "Hybrid", hint: "keywords + meaning (recommended)" },
  { value: "semantic", label: "Semantic", hint: "matches meaning, not exact words" },
  { value: "keyword", label: "Keyword", hint: "exact words, typo-tolerant" },
];

const FILTERS = [
  { name: "track", label: "Track", facet: "tracks" },
  { name: "level", label: "Level", facet: "levels" },
  { name: "day", label: "Day", facet: "days" },
] as const;

type FilterName = (typeof FILTERS)[number]["name"];

const field =
  "mt-1 w-full rounded-lg border border-slate-500 bg-slate-900 p-3 text-base text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300";
const primary =
  "rounded-lg bg-teal-300 px-5 py-3 font-semibold text-slate-950 hover:bg-teal-200 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function TalkBridgeApp() {
  const [background, setBackground] = useState(
    "I am a Salesforce developer familiar with Apex, LWC, and REST APIs."
  );
  const [goal, setGoal] = useState("");
  const [language, setLanguage] = useState("en");
  const [readingLevel, setReadingLevel] = useState("standard");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [filters, setFilters] = useState<Record<FilterName, string>>({
    track: "",
    level: "",
    day: "",
  });
  const [facets, setFacets] = useState<Facets>({ tracks: [], levels: [], days: [] });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resultsLabel, setResultsLabel] = useState("");
  const [selected, setSelected] = useState<Session | null>(null);
  const [guide, setGuide] = useState<PrepareResponse | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  // Bumped on every new result list / error so focus moves even if the text is unchanged.
  const [resultsVersion, setResultsVersion] = useState(0);
  const [errorVersion, setErrorVersion] = useState(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const errorAlert = useRef<HTMLParagraphElement>(null);
  const guideHeading = useRef<HTMLHeadingElement>(null);
  // While busy, controls stay focusable (aria-disabled + early returns) instead of
  // using `disabled`, which would drop keyboard focus to <body>.
  const busy = status !== "";

  // Filters are optional: if facets fail to load, the selects just offer "Any".
  useEffect(() => {
    fetch("/api/facets")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Facets | null) => {
        if (data) setFacets(data);
      })
      .catch(() => {});
  }, []);

  // Move focus deliberately to whatever the last action produced: the guide,
  // the new result list, or the error, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (guide) guideHeading.current?.focus();
  }, [guide]);

  useEffect(() => {
    if (resultsVersion > 0) resultsHeading.current?.focus();
  }, [resultsVersion]);

  useEffect(() => {
    if (errorVersion > 0) errorAlert.current?.focus();
  }, [errorVersion]);

  async function call<T>(label: string, url: string, init?: RequestInit) {
    setStatus(label);
    setError("");
    try {
      const response = await fetch(url, init);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }
      return data as T;
    } catch (err) {
      setErrorVersion((version) => version + 1);
      setError(
        err instanceof TypeError
          ? "Network error. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again."
      );
      return null;
    } finally {
      setStatus("");
    }
  }

  function showResults(list: Session[], label: string) {
    setSessions(list);
    setResultsLabel(label);
    setSelected(null);
    setGuide(null);
    setResultsVersion((version) => version + 1);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const params = new URLSearchParams({ q: query.trim(), mode });
    for (const { name } of FILTERS) {
      if (filters[name]) params.set(name, filters[name]);
    }
    const data = await call<SearchResponse>("Searching sessions…", "/api/search?" + params);
    if (data) {
      const count = data.sessions.length;
      showResults(
        data.sessions,
        `${count} ${count === 1 ? "session" : "sessions"} · ${data.mode} search`
      );
    }
  }

  async function recommend() {
    if (busy || !background.trim()) return;
    const data = await call<RecommendResponse>("Finding talks for you…", "/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background, goal }),
    });
    if (data) showResults(data.sessions, "Recommended for your background and goal");
  }

  async function prepare() {
    if (busy || !selected || !background.trim()) return;
    setGuide(null);
    const data = await call<PrepareResponse>(
      "Writing your preparation guide… this can take up to 30 seconds.",
      "/api/prepare",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selected.id,
          background,
          language,
          readingLevel,
        }),
      }
    );
    if (data) setGuide(data);
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded focus:bg-white focus:p-3 focus:text-slate-950"
      >
        Skip to main content
      </a>
      <main
        id="main"
        className="flex-1 bg-slate-950 px-4 py-10 text-base text-slate-100 sm:px-6"
      >
        <div className="mx-auto max-w-3xl space-y-8">
          <header>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-300">
              Conference prep for everyone
            </p>
            <h1 className="mt-2 text-4xl font-bold">TalkBridge</h1>
            <p className="mt-3 text-slate-200">
              Find the right talk, understand its vocabulary in your language, and arrive
              prepared.
            </p>
          </header>

          <section
            aria-labelledby="profile-heading"
            className="space-y-4 rounded-xl border border-slate-700 p-5"
          >
            <h2 id="profile-heading" className="text-xl font-semibold">
              About you
            </h2>
            <div>
              <label htmlFor="background" className="block font-medium">
                Your technical background
              </label>
              <textarea
                id="background"
                value={background}
                maxLength={1000}
                rows={3}
                aria-describedby="background-hint"
                onChange={(event) => {
                  setBackground(event.target.value);
                  setGuide(null);
                }}
                className={field}
              />
              <p id="background-hint" className="mt-1 text-sm text-slate-300">
                Sent only to our search and AI providers to tailor results and guides. TalkBridge does not save it. Please leave out names, employers or other personal details.
              </p>
            </div>
            <div>
              <label htmlFor="goal" className="block font-medium">
                What do you want to learn?{" "}
                <span className="font-normal text-slate-300">(optional)</span>
              </label>
              <input
                id="goal"
                value={goal}
                maxLength={300}
                aria-describedby="background-hint"
                placeholder="For example: get started with Kubernetes"
                onChange={(event) => setGoal(event.target.value)}
                className={field}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="language" className="block font-medium">
                  Guide language
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(event) => {
                    setLanguage(event.target.value);
                    setGuide(null);
                  }}
                  className={field}
                >
                  {Object.entries(LANGUAGES).map(([code, name]) => (
                    <option key={code} value={code} lang={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reading-level" className="block font-medium">
                  Reading level
                </label>
                <select
                  id="reading-level"
                  value={readingLevel}
                  onChange={(event) => {
                    setReadingLevel(event.target.value);
                    setGuide(null);
                  }}
                  className={field}
                >
                  {Object.entries(READING_LEVELS).map(([value, description]) => (
                    <option key={value} value={value}>
                      {description.split(":")[0]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={recommend}
              aria-disabled={busy || !background.trim()}
              className={primary}
            >
              Recommend talks for me
            </button>
          </section>

          <form
            onSubmit={search}
            role="search"
            aria-label="Search sessions"
            className="space-y-4 rounded-xl border border-slate-700 p-5"
          >
            <div>
              <label htmlFor="query" className="block font-medium">
                Search sessions
              </label>
              <input
                id="query"
                type="search"
                value={query}
                maxLength={200}
                placeholder="Try: how do I debug slow services?"
                onChange={(event) => setQuery(event.target.value)}
                className={field}
              />
              <p className="mt-1 text-sm text-slate-300">
                Leave empty to browse every session.
              </p>
            </div>
            <fieldset>
              <legend className="font-medium">Search mode</legend>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5">
                {MODES.map((option) => (
                  <label key={option.value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="mode"
                      value={option.value}
                      checked={mode === option.value}
                      onChange={() => setMode(option.value)}
                      className="h-4 w-4 accent-teal-300"
                    />
                    <span>
                      {option.label}{" "}
                      <span className="text-sm text-slate-300">— {option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              {FILTERS.map(({ name, label, facet }) => (
                <div key={name}>
                  <label htmlFor={`filter-${name}`} className="block font-medium">
                    {label}
                  </label>
                  <select
                    id={`filter-${name}`}
                    value={filters[name]}
                    onChange={(event) =>
                      setFilters({ ...filters, [name]: event.target.value })
                    }
                    className={field}
                  >
                    <option value="">Any</option>
                    {facets[facet].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button type="submit" aria-disabled={busy} className={primary}>
              Search
            </button>
          </form>

          <p aria-live="polite" className="min-h-6 text-teal-200">
            {status}
          </p>
          {error && (
            <p
              ref={errorAlert}
              role="alert"
              tabIndex={-1}
              className="rounded-lg bg-red-950 p-4 text-red-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
            >
              {error}
            </p>
          )}

          {resultsLabel && (
            <section aria-labelledby="results-heading" className="space-y-3">
              <h2
                id="results-heading"
                ref={resultsHeading}
                tabIndex={-1}
                className="text-xl font-semibold focus:outline-none"
              >
                {resultsLabel}
              </h2>
              {sessions.length === 0 && (
                <p>No sessions found. Try different words or switch to semantic search.</p>
              )}
              <ul className="space-y-3">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      aria-disabled={busy}
                      aria-pressed={selected?.id === session.id}
                      onClick={() => {
                        if (busy) return;
                        setSelected(session);
                        setGuide(null);
                      }}
                      className={
                        "w-full rounded-xl border p-5 text-left aria-disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 " +
                        (selected?.id === session.id
                          ? "border-teal-300 bg-slate-800"
                          : "border-slate-700 bg-slate-900 hover:border-slate-500")
                      }
                    >
                      <span className="block text-lg font-semibold">{session.title}</span>
                      <span className="mt-1 block text-sm text-slate-300">
                        {[session.speakers.join(", "), session.track, session.level, session.day]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {!session.sourceUrl && (
                        <span className="mt-2 inline-block rounded bg-amber-900 px-2 py-0.5 text-xs font-semibold text-amber-100">
                          Fictional demo session
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {selected && (
            <section
              aria-labelledby="selected-heading"
              className="space-y-4 rounded-xl bg-slate-900 p-6"
            >
              <h2 id="selected-heading" className="text-xl font-semibold">
                {selected.title}
              </h2>
              <div>
                <h3 className="font-semibold text-teal-300">Original abstract</h3>
                <p className="mt-2 whitespace-pre-wrap text-slate-200">
                  {selected.abstract || "No abstract published."}
                </p>
              </div>
              {selected.sourceUrl.startsWith("https://") ? (
                <a
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-teal-200 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
                >
                  Official session page
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <p className="text-sm text-amber-200">
                  Fictional demo session, not part of the real schedule.
                </p>
              )}
              <div>
                <button
                  type="button"
                  onClick={prepare}
                  aria-disabled={busy || !background.trim()}
                  className={primary}
                >
                  Prepare me
                </button>
                <p className="mt-2 text-sm text-slate-300">
                  Guide in {LANGUAGES[language as keyof typeof LANGUAGES]},{" "}
                  {READING_LEVELS[readingLevel as keyof typeof READING_LEVELS]
                    .split(":")[0]
                    .toLowerCase()}{" "}
                  level. Change these under “About you”.
                </p>
              </div>
            </section>
          )}

          {guide && (
            <section
              aria-labelledby="guide-heading"
              className="rounded-xl border border-teal-700 p-6"
            >
              <h2
                id="guide-heading"
                ref={guideHeading}
                tabIndex={-1}
                className="text-2xl font-semibold focus:outline-none"
              >
                Your preparation guide
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                AI-generated from the published abstract, not a transcript of the talk.
              </p>
              <div lang={guide.language} className="mt-5 whitespace-pre-wrap leading-8">
                {guide.guide}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

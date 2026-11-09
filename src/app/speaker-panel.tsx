"use client";

// Owner: Hemanth (A). Speakers of the selected talk: the profile they published on the
// official schedule (instant), plus an AI web-research summary with sources (loads after).
import { useEffect, useState } from "react";
import {
  LINK_LABELS,
  type SpeakerInsights,
  type SpeakerProfile,
  type SpeakersResponse,
} from "@/lib/speakers";

type InsightState =
  | { status: "loading" }
  | { status: "ready"; data: SpeakerInsights }
  | { status: "error"; message: string };

const external =
  "text-teal-200 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300";

export function SpeakerPanel({ sessionId }: { sessionId: string }) {
  const [speakers, setSpeakers] = useState<SpeakerProfile[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [insights, setInsights] = useState<Record<string, InsightState>>({});

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    // State starts empty because the parent remounts this panel per talk (key={sessionId}).

    (async () => {
      try {
        const response = await fetch(
          "/api/speakers?sessionId=" + encodeURIComponent(sessionId),
          { signal }
        );
        if (!response.ok) throw new Error("unavailable");
        const data = (await response.json()) as SpeakersResponse;
        if (signal.aborted) return;
        setSpeakers(data.speakers);

        // Research each speaker in parallel; each card fills in when its result arrives.
        for (const speaker of data.speakers) {
          setInsights((prev) => ({ ...prev, [speaker.id]: { status: "loading" } }));
          fetch("/api/speakers/insights?id=" + encodeURIComponent(speaker.id), { signal })
            .then(async (r) => {
              const body = await r.json().catch(() => null);
              if (!r.ok) throw new Error(body?.error || "Could not research this speaker.");
              return body as SpeakerInsights;
            })
            .then((result) =>
              setInsights((prev) => ({ ...prev, [speaker.id]: { status: "ready", data: result } }))
            )
            .catch((err: unknown) => {
              if (signal.aborted) return;
              setInsights((prev) => ({
                ...prev,
                [speaker.id]: {
                  status: "error",
                  message: err instanceof Error ? err.message : "Could not research this speaker.",
                },
              }));
            });
        }
      } catch {
        if (!signal.aborted) setUnavailable(true);
      }
    })();

    return () => controller.abort();
  }, [sessionId]);

  if (unavailable) {
    return <p className="text-sm text-slate-300">Speaker profiles aren’t available right now.</p>;
  }
  if (speakers === null) {
    return (
      <p aria-live="polite" className="text-sm text-slate-300">
        Loading speakers…
      </p>
    );
  }
  if (speakers.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-teal-300">
        {speakers.length === 1 ? "Speaker" : `Speakers (${speakers.length})`}
      </h3>
      <ul className="space-y-4">
        {speakers.map((speaker) => (
          <li key={speaker.id}>
            <SpeakerCard speaker={speaker} insight={insights[speaker.id]} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpeakerCard({ speaker, insight }: { speaker: SpeakerProfile; insight?: InsightState }) {
  const role = [speaker.title, speaker.company].filter(Boolean).join(", ");
  const headingId = `speaker-${speaker.id}`;
  return (
    <article aria-labelledby={headingId} className="rounded-lg border border-slate-700 p-4">
      <div className="flex gap-4">
        {speaker.photoUrl && (
          // Sessionize CDN image; plain <img> keeps next.config (Rahul's file) unchanged.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={speaker.photoUrl}
            alt={`Photo of ${speaker.fullName}`}
            width={64}
            height={64}
            loading="lazy"
            className="h-16 w-16 flex-none rounded-full object-cover"
          />
        )}
        <div className="min-w-0">
          <h4 id={headingId} className="text-lg font-semibold">
            {speaker.fullName}
          </h4>
          {(speaker.tagLine || role) && (
            <p className="text-sm text-slate-300">{speaker.tagLine || role}</p>
          )}
          {speaker.links.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {speaker.links.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className={external}>
                    {LINK_LABELS[link.type] ?? "Website"}
                    <span className="sr-only">
                      {" "}
                      for {speaker.fullName} (opens in a new tab)
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {speaker.bio && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
            Bio (from the official schedule)
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{speaker.bio}</p>
        </details>
      )}

      <section aria-label={`Public web research about ${speaker.fullName}`} className="mt-3">
        <p className="text-sm font-medium text-slate-200">
          From the public web{" "}
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">
            AI-generated · may be inaccurate
          </span>
        </p>
        <div aria-live="polite">
          {(!insight || insight.status === "loading") && (
            <p className="mt-1 text-sm text-slate-300">Researching public sources… (about 10 seconds)</p>
          )}
          {insight?.status === "error" && (
            <p className="mt-1 text-sm text-red-200">{insight.message}</p>
          )}
          {insight?.status === "ready" && <Insights data={insight.data} />}
        </div>
      </section>
    </article>
  );
}

function Insights({ data }: { data: SpeakerInsights }) {
  return (
    <div className="mt-1 space-y-2 text-sm">
      {data.confidence === "low" && (
        <p className="text-amber-200">
          Low confidence: little public information was found, or it may describe someone else
          with the same name.
        </p>
      )}
      <p className="whitespace-pre-wrap text-slate-200">{data.summary}</p>
      {data.highlights.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-slate-200">
          {data.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      )}
      {data.sources.length > 0 && (
        <div>
          <p className="text-slate-300">Sources:</p>
          <ul className="space-y-0.5">
            {data.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className={external}>
                  {source.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

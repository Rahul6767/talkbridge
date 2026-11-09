# TalkBridge — two-engineer parallel plan

**Team:** Engineer 1 is **Hemanth** (track A, App & Search). Engineer 2 is **Rahul** (track B, Platform & Observability). Task IDs (`A3`, `B8`) and branch prefixes (`a/`, `b/`) keep the A/B letters.

Source of truth for code: the Notion build guide (https://app.notion.com/p/cc653c004823826ab0268135a7b4d1a9). This file splits it so two engineers work in parallel without blocking or conflicting. Project rules live in [../CLAUDE.md](../CLAUDE.md).

**Deadline: submissions close at 5:30 PM MT.** Feature freeze is at 4:30.

## Roles

| | Hemanth (A) — App & Search | Rahul (B) — Platform & Observability |
| --- | --- | --- |
| Tracks led | Elasticsearch “Find the Right Talk”, Merge Forward (accessibility) | Gitar “Never Merge Broken”, Dash0 “Stop Flying Blind”, Radar “AI SRE” |
| Notion phases | 4, 6, 7, 11 | 2, 3, 5, 8, 9, 10 |
| Shared | 0, 12, 13, 14 | 0, 12, 13, 14 |
| Accounts to own | Elastic Serverless, OpenAI (project key + budget) | GitHub repo, Gitar, Dash0, Radar |
| Coding-agent connections | Elastic Agent Skills | Radar MCP, Dash0 MCP |

Each engineer runs their own Claude Code session. Tell Claude “I am Hemanth (A)” or “I am Rahul (B)” at the start of a session.

## File ownership (prevents merge conflicts)

| Owner | Files |
| --- | --- |
| Hemanth (A) | `src/app/api/search`, `facets`, `recommend`, `prepare` routes; `src/app/page.tsx`; `scripts/seed.mjs`; `data/sessions.json` |
| Rahul (B) | `src/app/api/health`; `src/instrumentation.ts`; `src/instrumentation.node.ts`; `src/app/rum.tsx`; `src/app/layout.tsx`; `next.config.ts`; `package.json` / `package-lock.json`; `.github/`; `.gitar/`; `Dockerfile`; `.dockerignore`; `k8s/` |
| Shared contract (both approve changes) | `src/lib/types.ts`, `options.ts`, `telemetry.ts`, `rate-limit.ts`, `elastic.ts`; `.env.example`; `CLAUDE.md`; this file |
| Both (Rahul drafts, Hemanth fills) | `README.md` |

Rules: no edits to the other engineer's files; if you need a change, ask in chat or open a small PR and tag them. Need a new npm package? Ask Rahul, who adds it in one PR so the lockfile only changes in one place.

## API contract (Hemanth implements, Rahul relies on it for probes, dashboards and SLOs)

| Method | Path | Request | 200 response | Errors | Span name |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/search` | `q` (≤200), `mode` keyword\|semantic\|hybrid, `track`, `level`, `day` | `SearchResponse` | 400, 429, 500 | `talkbridge.search` |
| GET | `/api/facets` | — | `Facets` | 500 | `talkbridge.facets` |
| POST | `/api/recommend` | `{ background ≤1000, goal? ≤300 }` | `RecommendResponse` | 400, 429, 500 | `talkbridge.recommend` |
| POST | `/api/prepare` | `{ sessionId, background, language, readingLevel }` | `PrepareResponse` | 400, 404, 422, 429, 500 | `talkbridge.session.lookup`, `talkbridge.guide.generate` |
| GET | `/api/health` | — | `{ status: "ok" }` | — | (auto HTTP span) |

Metrics both rely on (from `src/lib/telemetry.ts`): `talkbridge.operation.duration` (ms, attrs `talkbridge.operation`, `outcome`), `talkbridge.operation.errors`, `talkbridge.ai.tokens` (attrs `talkbridge.ai.model`, `talkbridge.ai.direction`), `talkbridge.search.results` (attr `talkbridge.search.mode`). Service names: `talkbridge` (server), `talkbridge-web` (RUM).

## Timeline (Mountain Time)

| Time | Hemanth (A) | Rahul (B) | Sync |
| --- | --- | --- | --- |
| 12:15–12:35 | A0: Elastic project, keys, OpenAI budget | B1–B2: repo, PR #1 (this base), Gitar, rules, secret scanning | **S0 12:15** (10 min): read this file, split accounts |
| 12:35–1:30 | A1–A3: data, seed, search API | B3–B5: Dash0 tokens, OTel SDK, verify signals | |
| 1:30 | | | **S1 1:30** (10 min): A’s search PR merged; B’s telemetry PR merged; A sees spans in Dash0 |
| 1:30–2:45 | A4–A6: facets, recommend, prepare (lunch 2:00–2:20) | B6–B8: Dockerfile, RUM, cluster join, starter repo, Secret (lunch 2:20–2:40) | Stagger lunch so one person is always building |
| 2:45 | | | **S2 2:45** (10 min): first deploy of `main` to the cluster; both open the cluster URL |
| 2:45–3:45 | A7–A8: accessible UI, languages, reading levels | B9–B10: Radar MCP use, dashboard, SLOs, alerts | |
| 3:45–4:30 | A9: load the app hard, find real issues, fix app-level bugs from Agent0/Radar PRs | B11: drive the incident loop (Radar AI investigation / Agent0 → PR → Gitar → Argo CD) | **S3 3:45**: agree which real issue becomes the demo incident |
| 4:30 | | | **Feature freeze.** Only fixes after this |
| 4:30–5:00 | A10: functional + answer-quality checks; README features, data sources | B12: README setup, deploy, AI disclosure, gitleaks on history | |
| 5:00–5:15 | Both: rehearse the 3-minute demo; each person explains the half they did not build | | **S4 5:00** |
| 5:15–5:30 | Submit (repo URL, tracks, README) | | **Submit by 5:25** |

## Hemanth (A) tasks

| ID | Task | Notion | Done when |
| --- | --- | --- | --- |
| A0 | Elastic Serverless project (Elasticsearch type); `GET _inference`; create **seed** and **app** API keys (2-day expiry); OpenAI project key with budget limit. Values go only into `.env.local` | 1, 2, 4 | Both keys work; budget set |
| A1 | Build `data/sessions.json`: 40–100 real public sessions with `sourceUrl`, abstracts unchanged; fictional ones labeled with empty `sourceUrl`; record the source for the README | 4 | File validates; source noted |
| A2 | `scripts/seed.mjs` with the `semantic_text` mapping and bulk ingest; run with `--reset` | 4 | `Indexed N/N, failed 0`; `_count` matches |
| A3 | `/api/search`: keyword, semantic, hybrid RRF, filters, rate limit, `observe()` span | 6 | The three curl checks in Phase 6 show different, sensible rankings |
| A4 | `/api/facets` (call `await connection()` first) | 6 | Real tracks, levels and days returned |
| A5 | `/api/recommend` (semantic query on background + goal) | 6 | Two backgrounds give different lists |
| A6 | `/api/prepare`: id lookup, 404/422, OpenAI with timeout + 1 retry, languages, reading levels, token metrics, dev-only fault flag | 6 | Guide returned; invalid input 400; 11 calls/min 429 |
| A7 | `src/app/page.tsx`: About-you panel, search form, mode radios, filters, results, selected talk, guide | 7 | Recommend → select → Prepare works end to end |
| A8 | Accessibility pass: keyboard only, VoiceOver, focus to guide, `lang` on guide, Lighthouse ≥ 95 | 7 | Checklist in Phase 7 passes |
| A9 | Stress the deployed app (all modes, all languages, repeated recommends) and fix app-level issues surfaced by Dash0/Radar | 10 | At least one real issue reproduced and fixed by PR |
| A10 | Functional table + answer-quality review (3 backgrounds × 2 languages); README “What it does” and “Data sources” | 11, 12 | Results recorded in the PR or README |

PR order for A: `a/A2-seed` → `a/A3-search-api` → `a/A4-A6-apis` → `a/A7-ui` → `a/A8-a11y` → fixes.

## Rahul (B) tasks

| ID | Task | Notion | Done when |
| --- | --- | --- | --- |
| B1 | ✅ Repo https://github.com/talkbridge-team/talkbridge (moved from Rahul6767 into the talkbridge-team org; repo is public); base scaffold pushed to `main` (commits `82972f5`, `fb249ff`, CI green); Hemanth is an admin. Done. | 3 | Repo public |
| B2 | Install Gitar on the repo, auto-apply on, confirm `.gitar/review/talkbridge.md` is picked up (adjust folder format to Gitar docs if needed); ruleset on `main` (PR required, `ci / check` required, no force push); secret scanning + push protection | 2, 3 | First feature PR reviewed by Gitar, CI green; direct pushes to `main` blocked |
| B3 | Dash0: OTLP HTTP endpoint for the region; backend **Ingesting-only** token; dataset name. Values only in `.env.local`; share with A through a password manager, never chat | 2, 8 | Token works |
| B4 | `src/instrumentation.ts` + `src/instrumentation.node.ts` (NodeSDK with `metricReaders` plural, `logRecordProcessors`, auto-instrumentations minus fs/net/dns) | 5 | `npm run build` passes; app still runs without OTEL vars |
| B5 | Verify all three signals in Dash0 (use A’s first route or `/api/health`); check that no user text appears in any span, including Elasticsearch client spans | 8 | Traces, logs, metrics visible; privacy check passes |
| B6 | `Dockerfile` (node:24-alpine, standalone, numeric `USER 1001`, RUM values as build args only); local `docker run --env-file .env.k8s` | 9 | Container serves the app |
| B7 | RUM: second Ingesting-only token; add the Dash0 web SDK (confirm package name in the Dash0 website-monitoring guide); `src/app/rum.tsx`; render in `layout.tsx` | 8 | RUM sessions for `talkbridge-web` |
| B8 | Join `join.cnh.radarhq.io` (code at kickoff/Radar table) or connect own cluster; merge the `skyhook-io/cnh-starter` layout; Deployment/Service in `k8s/` with probes on `/api/health`, resources, `runAsNonRoot`; create `talkbridge-secrets` from `.env.k8s` via `kubectl` (no seed key, no fault flag, no quotes) | 9 | Pod Ready; app reachable; traces with `deployment.environment.name=hackathon` |
| B9 | Use Radar UI + Radar MCP for every rollout; run a Radar AI investigation on the first real problem; screenshot it | 9 | Investigation captured |
| B10 | Dash0 dashboard (route rate/errors, p50/p95 per operation, tokens, empty-result rate by mode, error logs, RUM vitals); SLOs: 99% `/api/prepare` success, 95% `/api/search` < 800 ms; alert on `talkbridge.operation.errors` | 10 | Dashboard saved; SLOs/alerts exist |
| B11 | Incident loop on a real issue: Agent0 or Dash0 MCP diagnosis → fix PR → Gitar review → CI → merge → Argo CD → recovery visible in Dash0 + Radar; screenshot each step | 10 | Merged fix PR with diagnosis linked |
| B12 | README: architecture, sponsor-track table, setup, deploy, security, **AI assistance disclosure**, team/license; final `gitleaks git -v` on full history | 12 | README merged; scan clean |

PR order for B: `b/B1-base` → `b/B4-otel` → `b/B6-docker` → `b/B7-rum` → `b/B8-k8s` → `b/B11-fix-…` → `b/B12-readme`.

## Hand-offs and dependencies

| Needs | From | By | What |
| --- | --- | --- | --- |
| Hemanth | Rahul | 12:35 | Repo exists, Hemanth has write access (done), CI + Gitar active (B1–B2) |
| Hemanth | Rahul | 1:30 | OTEL values for Hemanth’s `.env.local` (via password manager) so spans from Hemanth’s routes show up in Dash0 |
| Rahul | Hemanth | 1:30 | One working API route on `main` to generate real telemetry |
| Rahul | Hemanth | 2:45 | Prepare + search on `main` for the first cluster deploy |
| Rahul | Hemanth | 2:45 | Read-only Elasticsearch app key and OpenAI key for `talkbridge-secrets` (via password manager) |
| Both | Both | 3:45 | Agree the demo incident (S3) |

Secrets are exchanged only through a password manager’s secure share (or typed directly on the other laptop) — never chat, Notion, Slack, Discord, email or the repo.

## Cut lines

- **2:30:** if search + prepare are not on `main`, A drops facets (A4) and recommend (A5); B keeps going.
- **3:15:** if the cluster deploy is not working, B stops Radar work (B8–B9) and moves to Dash0 depth (B10–B11) against the local app; Radar track is skipped.
- **4:00:** if no real issue has appeared, use the labeled dev-only fault flag for the Dash0 story and say plainly it is fault injection.
- **Never cut:** public repo, README with setup steps, AI disclosure, secret hygiene.

## Definition of done (every PR)

- Branch named `a/…` or `b/…`; small and focused; only your own files.
- `npx eslint . && npx next typegen && npx tsc --noEmit && npm run build` pass locally; `gitleaks git -v` clean.
- Gitar review addressed; CI green; PR description explains the change in your own words.
- No secrets, no user text in telemetry, no `runtime`/`dynamic` exports in routes.

## Demo split (3 minutes)

| Time | Presenter | Content |
| --- | --- | --- |
| 0:00–1:20 | Hemanth | Problem, recommend + hybrid vs keyword, Spanish plain-language guide, keyboard-only |
| 1:20–2:30 | Rahul | Dash0 dashboard/trace/logs/RUM/SLO, then the real incident: Radar / Agent0 → PR → Gitar → Argo CD → recovery |
| 2:30–3:00 | Both | Architecture, what each built, Q&A readiness (each can answer about the other’s half) |

## After 5:30 (both)

Revoke the OpenAI key, both Elasticsearch keys, both Dash0 tokens; delete `talkbridge-secrets` and the workload as organizers instruct; delete `.env.local` / `.env.k8s` from any shared machine (Notion Phase 14).

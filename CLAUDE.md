@AGENTS.md

# TalkBridge — project instructions for Claude

TalkBridge helps conference attendees find the right talk (Elasticsearch hybrid search + recommendations) and get a grounded preparation guide in their language and reading level (OpenAI). Built today at the WeMakeDevs Cloud Native Hackathon (Salt Lake City, 2026-11-09). **Submission deadline: 5:30 PM MT.**

- Full build guide (source of truth for code): https://app.notion.com/p/cc653c004823826ab0268135a7b4d1a9 — phases 0–14.
- Who does what, when: [docs/PLAN.md](docs/PLAN.md). Before starting work, ask which engineer you are working for (A = App & Search, B = Platform & Observability) and stay inside that engineer's owned files.

## Hard rules

1. **Secrets.** Never read, print, echo or paste the contents of `.env`, `.env.local` or `.env.k8s` (reads are blocked in `.claude/settings.json`). Never write real keys into code, commits, PR text, Notion, manifests, Dockerfiles or telemetry. Only `.env.example` (placeholders) is committed. If a secret is ever exposed, stop and tell the engineer to revoke it first.
2. **Telemetry privacy.** Spans, logs and metrics carry lengths, counts, ids and modes only — never attendee background, goal, prompt text or generated guide text.
3. **Every change is a pull request** reviewed by Gitar with CI green (eslint, tsc, build, gitleaks). Never push to `main`. Branch names: `a/<task-id>-<slug>` or `b/<task-id>-<slug>` (for example `a/A3-search-api`).
4. **Stay in your lane.** Only edit files owned by your engineer (table in docs/PLAN.md). Shared contract files need both engineers' agreement in the PR.
5. **Hackathon rules.** The team must understand and be able to explain every line — explain non-obvious code in the PR description. AI assistance is disclosed in the README. Use only public data with source links; no private data.
6. Commit or push only when the engineer asks.

## Plan deviations (installed versions differ from the Notion guide — follow these)

- **Next.js 16.4 with `cacheComponents: true`.** Route handlers must **not** export `runtime` or `dynamic` (build error). GET handlers that do not read the request (facets, health) call `await connection()` from `next/server` first so they are not prerendered at build time. Read the bundled docs in `node_modules/next/dist/docs/` before using any other Next API.
- **OpenTelemetry logs API lives in `@opentelemetry/api`** (`logs`, `SeverityNumber`). `@opentelemetry/api-logs` is not installed — do not add it.
- **NodeSDK options:** `metricReaders: [new PeriodicExportingMetricReader(...)]` (plural array), `logRecordProcessors: [...]`, `traceExporter`. `resourceFromAttributes` from `@opentelemetry/resources`.
- **Node 24** locally and in CI; use `node:24-alpine` in the Dockerfile.
- `next dev` re-adds a block to AGENTS.md; commit it rather than fighting it.
- All npm dependencies are already installed. Ask before adding new ones (Engineer B owns `package.json` to avoid lockfile conflicts); the Dash0 web SDK is the one expected addition (B, task B7).

## Layout

```
src/lib/types.ts, options.ts, telemetry.ts, rate-limit.ts, elastic.ts   shared contracts (frozen after PR #1)
src/app/api/{search,facets,recommend,prepare}/route.ts                  Engineer A (stubs return 501)
src/app/page.tsx                                                         Engineer A (UI, accessibility)
scripts/seed.mjs, data/sessions.json                                     Engineer A
src/app/api/health/route.ts, src/instrumentation*.ts, src/app/rum.tsx    Engineer B
src/app/layout.tsx, next.config.ts, package.json                         Engineer B
.github/, .gitar/, Dockerfile, .dockerignore, k8s/                       Engineer B
README.md, docs/                                                         both (B drafts README)
```

## Commands

```bash
npm run dev                                         # local app on :3000
node --env-file=.env.local scripts/seed.mjs --reset # (re)load sessions into Elasticsearch
npx eslint . && npx tsc --noEmit && npm run build   # same checks as CI
gitleaks git -v                                     # before every push
```

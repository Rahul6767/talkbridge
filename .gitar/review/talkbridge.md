# TalkBridge review rules

## Security
- Never commit secrets, tokens, endpoints with credentials, or .env files other than .env.example.
- Server secrets are read only in files that import "server-only". Never prefix a secret with NEXT_PUBLIC_.
- Spans, logs and metrics must not contain the attendee background, goal, prompt text or generated guide. Record lengths, counts, ids and modes only.
- Every API route validates input size and type, applies rateLimit(), and returns JSON errors without stack traces.
- Kubernetes manifests must not contain Secret values; they reference the talkbridge-secrets Secret.

## Next.js 16 (cacheComponents enabled)
- Route handlers must not export `runtime` or `dynamic`. GET handlers that do not read the request call `await connection()` first.

## Elasticsearch
- All session reads go through getElasticClient() and SESSION_INDEX from src/lib/elastic.ts.
- Search responses exclude the semantic_text field "content" from _source (SOURCE_EXCLUDES).
- The app uses the read-only API key; only scripts/seed.mjs uses the seed key.

## AI output
- The abstract is the only evidence about a talk. Prompts must label general background separately and must not invent speaker claims.
- OpenAI calls set a timeout and a small retry count.

## Observability
- Wrap each business operation with observe() from src/lib/telemetry.ts and use talkbridge.* span names.

## Accessibility
- Every input has a visible label; interactive elements are keyboard reachable with visible focus; dynamic status uses aria-live.

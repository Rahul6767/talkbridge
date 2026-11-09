# TalkBridge

Find the right conference talk and arrive prepared — in your language and at your level.
Built at the WeMakeDevs Cloud Native Hackathon, Salt Lake City, November 9, 2026.

> Work in progress. Sections marked TODO are completed in Notion Phase 12 (owner: Engineer B drafts, Engineer A fills features and data sources).

## What it does
TODO (A)

## Architecture
TODO (B)

## Sponsor tracks
TODO (B): Elasticsearch, Dash0, Gitar, Radar, Merge Forward

## Run locally
Prerequisites: Node 24+, an Elasticsearch Serverless project, an OpenAI API key, optionally a Dash0 account.

```bash
npm ci
cp .env.example .env.local   # fill in your own keys; never commit .env.local
node --env-file=.env.local scripts/seed.mjs --reset
npm run dev
```

## Deploy
TODO (B)

## Data sources
TODO (A)

## Security
No secrets in this repo. Keys are least-privilege and short-lived. Telemetry excludes user input and AI output.

## AI assistance disclosure
TODO (both): list the AI tools used and what for. All code is reviewed, tested and understood by the team.

## Team and license
TODO (both)

# Owner: Rahul (B) — task B6. Spec: Notion guide, Phase 9 "Dockerfile".
# Three stages: install deps, build the Next.js standalone server, then copy only
# what the server needs into a small runtime image. No secrets are baked in:
# they come from the talkbridge-secrets Kubernetes Secret at runtime.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
# The GitHub Action passes the short commit SHA; telemetry reports it as service.version.
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=$APP_VERSION
# Numeric non-root user so Kubernetes can enforce runAsNonRoot.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=build --chown=1001:1001 /app/.next/standalone ./
COPY --from=build --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=build --chown=1001:1001 /app/public ./public
# The talkbridge-sync CronJob runs scripts/sync-sessions.mjs from this same image;
# its dependencies are already in the standalone node_modules.
COPY --from=build --chown=1001:1001 /app/scripts ./scripts
USER 1001
EXPOSE 8080
CMD ["node", "server.js"]

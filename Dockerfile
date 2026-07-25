# Long-running hub — the deployment shape Switchboard actually wants.
#
# One process, in-memory state (§12), a real WebSocket, and a real sweep timer.
# No Redis, no locks, no SSE reconnect dance: none of the serverless compensation
# is needed because none of the serverless constraints apply.
#
# Works as-is on Render, Railway, Fly.io, or any container host.
FROM node:20-alpine

# jq is not needed by the hub itself (only by the client hooks), but curl makes
# container healthchecks trivial.
RUN apk add --no-cache curl

WORKDIR /app

# Dependencies first so a source edit doesn't reinstall the world.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --cache /tmp/.npm && npm cache clean --force

# tsx runs TypeScript directly. Keeping it in production is a deliberate
# hackathon trade: one less build step to break at 1:50.
RUN npm install tsx@4 --no-save --cache /tmp/.npm

COPY src ./src
COPY tsconfig.json ./

# Hosts inject PORT; config.ts reads it. HOST stays 0.0.0.0 — binding localhost
# inside a container makes the service unreachable and looks like a crash.
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["npx", "tsx", "src/server.ts"]

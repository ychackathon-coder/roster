# Long-running hub — the deployment shape Switchboard actually wants.
#
# One process, in-memory state (§12), a real WebSocket, and a real sweep timer.
# No Redis, no locks, no SSE reconnect dance: none of the serverless compensation
# applies because none of the serverless constraints do.
#
# Works as-is on Fly.io, Render, Railway, or any container host.
FROM node:20-alpine

# curl for the container healthcheck. jq is not needed here — only the client
# hooks use it, and those run on each teammate's laptop.
RUN apk add --no-cache curl

WORKDIR /app

# Dependencies first so editing src/ doesn't reinstall the world.
# Full install including dev deps: tsx runs the TypeScript directly, so it is a
# genuine runtime requirement here rather than a build-time one.
COPY package.json package-lock.json ./
RUN npm ci --cache /tmp/.npm && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

# 0.0.0.0, not localhost. Binding localhost inside a container makes the service
# unreachable from outside it and presents exactly like a crashed process.
ENV HOST=0.0.0.0
ENV PORT=8787

# A deployed hub cannot see the demo repo, so scanning cwd would derive contracts
# from Switchboard's OWN source — noise on the board, and drift notices about
# files nobody in the room is editing. Push the real registry instead:
#   npm run derive-contracts -- /path/to/demo-repo <hub-url>
ENV SB_SKIP_DERIVE=1

EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["npx", "tsx", "src/server.ts"]

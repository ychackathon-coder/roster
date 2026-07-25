#!/bin/bash
# Expose a local hub on a public HTTPS URL.
#
#   npm start          # in one terminal
#   ./tunnel.sh        # in another
#
# WHY THIS IS THE RECOMMENDED SETUP: the hub keeps in-memory state (§12), a real
# WebSocket, a real sweep timer, and the ~8ms fast path — while being reachable
# from anywhere. It removes §15's highest-likelihood risk (cross-machine
# networking) without taking on any of the serverless compromises.
#
# It also keeps contract derivation working, because the hub can still read the
# demo repo on your filesystem. A deployed hub cannot.
set -uo pipefail

PORT="${PORT:-8787}"

if ! curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "No hub responding on 127.0.0.1:$PORT — run 'npm start' first." >&2
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed:" >&2
  echo "  brew install cloudflared" >&2
  exit 1
fi

# A named tunnel is used when one is already configured — it is stable across
# restarts and not rate-limited. The anonymous quick tunnel is convenient but
# Cloudflare throttles it per-IP (HTTP 429 / error 1015), which tends to happen at
# exactly the wrong moment.
if [ -n "${SB_TUNNEL_NAME:-}" ]; then
  echo "Using named tunnel: $SB_TUNNEL_NAME"
  exec cloudflared tunnel run --url "http://127.0.0.1:$PORT" "$SB_TUNNEL_NAME"
fi

echo "Starting an anonymous quick tunnel."
echo "If this fails with 429 / error 1015, Cloudflare is throttling anonymous"
echo "tunnels from this IP. Set up a free named tunnel once and it stops:"
echo ""
echo "  cloudflared tunnel login"
echo "  cloudflared tunnel create switchboard"
echo "  export SB_TUNNEL_NAME=switchboard"
echo ""

log="$(mktemp)"
cloudflared tunnel --url "http://127.0.0.1:$PORT" > "$log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null; rm -f "$log"' EXIT

url=""
for _ in $(seq 1 30); do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1)
  [ -n "$url" ] && break
  if ! kill -0 $pid 2>/dev/null; then break; fi
  sleep 1
done

if [ -z "$url" ]; then
  echo "Tunnel did not come up. Last lines:" >&2
  tail -6 "$log" >&2
  exit 1
fi

echo ""
echo "  Hub is public at: $url"
echo ""
echo "  Every teammate runs:"
echo "    export SB_HUB_URL=$url"
echo "    export SB_HUMAN=TheirName"
echo ""
echo "  Then reinstall the client so the hook URLs point here:"
echo "    ./client/install.sh /path/to/demo-repo"
echo ""
echo "  Verify from another laptop:  curl $url/health"
echo ""
echo "  NOTE: this URL is public and the hub has no auth (§12). Anyone with the"
echo "  link can read the board — including everyone's prompts — and mutate state."
echo ""
echo "  Ctrl-C to stop."

wait $pid

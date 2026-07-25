#!/bin/bash
# Start both apps and print the URL to share with the room.
#
#   ./start.sh          # start
#   ./start.sh --stop   # stop
#
# WHY THIS EXISTS: a stale dev server holding a port is the failure that broke
# access from other computers, and it is invisible from the host machine. An old
# process bound to localhost keeps working at localhost:3001 while the new
# all-interfaces server silently fails to start with EADDRINUSE — so it works for
# you and nobody else. This kills port holders first, every time.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ROSTER_PORT=3456
UI_PORT=3001

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "  freeing port $port (killing: $pids)"
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}

stop() {
  echo "Stopping..."
  free_port "$ROSTER_PORT"
  free_port "$UI_PORT"
  echo "Stopped."
}

if [ "${1:-}" = "--stop" ]; then
  stop
  exit 0
fi

echo "Freeing ports..."
free_port "$ROSTER_PORT"
free_port "$UI_PORT"

lan_ip() {
  for iface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [ -n "$ip" ] && { echo "$ip"; return; }
  done
  echo ""
}

echo ""
echo "Starting roster (API + onboarding) on port ${ROSTER_PORT}..."
# </dev/null and disown so the children do not hold this script's stdout open —
# otherwise `./start.sh | tail` never returns, because next dev's workers inherit
# the pipe and it never sees EOF.
( cd "$ROOT/roster" && nohup npm run dev > /tmp/roster-dev.log 2>&1 < /dev/null & echo $! > /tmp/roster-dev.pid; disown ) 2>/dev/null

echo "Starting dashboard on port ${UI_PORT}..."
( cd "$ROOT/hackathon-ui" && nohup npm run dev > /tmp/dashboard-dev.log 2>&1 < /dev/null & echo $! > /tmp/dashboard-dev.pid; disown ) 2>/dev/null

printf "\nWaiting for both to come up"
up_roster=0; up_ui=0
for _ in $(seq 1 40); do
  printf "."
  curl -fsS --max-time 2 "http://127.0.0.1:$ROSTER_PORT/api/events" >/dev/null 2>&1 && up_roster=1
  curl -fsS --max-time 2 "http://127.0.0.1:$UI_PORT/" >/dev/null 2>&1 && up_ui=1
  [ "$up_roster" = 1 ] && [ "$up_ui" = 1 ] && break
  sleep 1
done
echo ""

fail=0
if [ "$up_roster" = 1 ]; then echo "  ✔ roster    :$ROSTER_PORT"; else
  echo "  ✖ roster failed — see /tmp/roster-dev.log"; tail -5 /tmp/roster-dev.log; fail=1; fi
if [ "$up_ui" = 1 ]; then echo "  ✔ dashboard :$UI_PORT"; else
  echo "  ✖ dashboard failed — see /tmp/dashboard-dev.log"; tail -5 /tmp/dashboard-dev.log; fail=1; fi
[ "$fail" = 1 ] && exit 1

# Confirm the proxy hop works. If this fails the dashboard loads but shows sample
# data forever, which is the confusing case worth catching here.
if curl -fsS --max-time 8 "http://127.0.0.1:$UI_PORT/api/profile" >/dev/null 2>&1; then
  echo "  ✔ dashboard → roster proxy"
else
  echo "  ✖ proxy broken — dashboard will show sample data only"
fi

IP="$(lan_ip)"
echo ""
echo "─────────────────────────────────────────────────────────"
echo " YOU (set up the company):"
echo "   http://localhost:$ROSTER_PORT      index a GitHub repo"
echo "   http://localhost:$UI_PORT          the dashboard"
echo ""
if [ -n "$IP" ]; then
  echo " EVERYONE ELSE (same wifi, nothing to install):"
  echo "   http://$IP:$UI_PORT"
  echo ""
  echo " Verify from their laptop first:"
  echo "   curl http://$IP:$UI_PORT/api/profile"
else
  echo " No LAN address found — not on wifi? Others can't connect yet."
fi
echo "─────────────────────────────────────────────────────────"
echo ""
echo " Logs:  tail -f /tmp/roster-dev.log  /tmp/dashboard-dev.log"
echo " Stop:  ./start.sh --stop"
echo ""

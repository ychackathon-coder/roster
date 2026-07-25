#!/bin/bash
# Phase 0 connectivity check — run this ON EACH TEAMMATE'S LAPTOP.
#
#   SB_HUB=Anshs-MacBook-Air.local ./lan-check.sh
#   SB_HUB_URL=https://hub.example.com ./lan-check.sh
#
# This is the §13 Phase 0 gate, and it is the single highest-value 30 seconds in
# the whole build. Hooks fail OPEN: if this laptop cannot reach the hub, edits
# proceed with no enforcement, no error, and nothing on the board — which looks
# exactly like a product that doesn't work.
#
# Run it before Phase 1, and once more right before the demo.
set -uo pipefail

pass=0; fail=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✖\033[0m %s\n     %s\n' "$1" "${2:-}"; fail=$((fail+1)); }

if [ -n "${SB_HUB_URL:-}" ]; then
  base="${SB_HUB_URL%/}"
else
  : "${SB_HUB:=}"
  if [ -z "$SB_HUB" ]; then
    echo "Set SB_HUB (hostname or LAN IP) or SB_HUB_URL first. For example:" >&2
    echo "  export SB_HUB=Anshs-MacBook-Air.local" >&2
    exit 1
  fi
  base="http://$SB_HUB:${SB_PORT:-8787}"
fi

printf '\n\033[1mChecking %s\033[0m\n' "$base"

# 1. jq — every client hook needs it, and without it they exit silently.
if command -v jq >/dev/null 2>&1; then
  ok "jq installed ($(jq --version))"
else
  bad "jq is MISSING" "brew install jq — without it every hook exits silently"
fi

# 2. Name resolution, checked separately from connectivity so a DNS failure
#    doesn't look like a down hub.
host="${base#*://}"; host="${host%%:*}"; host="${host%%/*}"
if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  ok "hub address is a literal IP ($host) — no resolution needed"
  printf '     \033[2mnote: a LAN IP changes when the hub rejoins wifi. A .local\033[0m\n'
  printf '     \033[2mhostname does not, and is the more reliable choice.\033[0m\n'
elif ping -c 1 -t 2 "$host" >/dev/null 2>&1; then
  ok "$host resolves and answers ping"
else
  # mDNS names can resolve without answering ping, so this is not fatal on its own.
  printf '  \033[33m•\033[0m %s\n' "$host did not answer ping — continuing, the HTTP check decides"
fi

# 3. The check that actually matters.
health=$(curl -sS --max-time 5 "$base/health" 2>&1)
if grep -q '"ok":true' <<<"$health"; then
  ok "hub reachable"
  printf '     %s\n' "$health"
else
  bad "CANNOT REACH THE HUB" "$health"
  printf '
     Most likely causes, in order:
       1. The hub is not running. On the host: npm start
       2. This venue wifi isolates clients from each other. Very common, and
          the symptom is identical to a down hub. Test by pinging the host
          laptop directly. Fix: a phone hotspot, or Tailscale (free, and it
          relays around isolation).
       3. The hub bound localhost instead of 0.0.0.0. Check its startup log.
       4. macOS firewall is blocking node on the host machine.
'
fi

# 4. Websocket reachability for whoever runs the board.
#
# A successful upgrade returns "101 Switching Protocols" and then the hub
# immediately streams a full state frame, so curl sits there until --max-time and
# exits 28. That timeout is the SUCCESS case: read the status line, not the exit
# code. (Checking %{http_code} instead reports a false failure here.)
if grep -q '"ok":true' <<<"$health"; then
  status=$(curl -sS --max-time 2 -o /dev/null -D - \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    "$base/board" 2>/dev/null | head -1)
  if grep -q '101' <<<"$status"; then
    ok "board websocket upgrades (${status%$'\r'})"
  else
    printf '  \033[33m•\033[0m %s\n' "board websocket did not upgrade: ${status:-no response} — only matters for whoever runs the board"
    printf '     \033[2m(expected on a deployed hub: serverless cannot hold a socket. Poll /state.)\033[0m\n'
  fi
fi

# 5. Environment the hooks depend on.
if [ -n "${SB_HUMAN:-}" ]; then
  ok "SB_HUMAN is set ($SB_HUMAN)"
else
  bad "SB_HUMAN is not set" "export SB_HUMAN=YourName — otherwise the board shows \$USER"
fi

printf '\n\033[1mRESULT\033[0m\n  %d passed, %d failed\n' "$pass" "$fail"
if [ "$fail" -eq 0 ]; then
  printf '\n  This laptop is ready. Add to the shell profile so it survives a restart:\n'
  if [ -n "${SB_HUB_URL:-}" ]; then
    printf '    echo "export SB_HUB_URL=%s" >> ~/.zshrc\n' "$base"
  else
    printf '    echo "export SB_HUB=%s" >> ~/.zshrc\n' "$SB_HUB"
  fi
  printf '    echo "export SB_HUMAN=%s" >> ~/.zshrc\n\n' "${SB_HUMAN:-YourName}"
fi
[ "$fail" -eq 0 ]

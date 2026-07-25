#!/bin/bash
# L1 degraded-mode verification — §5, and the §18 line
# "Hub killed -> L1 cache still denies a known-held path."
#
#   npm start &
#   ./l1-verify.sh
#
# Note fallback-check.sh never touches the network: it reads only the local
# cache. So "the hub is down" needs no hub to be killed here — an unreachable hub
# means the L0 HTTP hook goes silent, and this script tests what's left.
#
# §13 Phase 4 assigns this test to B. Run it before the demo, not during.
set -uo pipefail
HUB="${SB_HUB:-127.0.0.1}:8787"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

HOOKS="$(cd "$(dirname "$0")" && pwd)/client/.claude/hooks"
export CLAUDE_PROJECT_DIR="$WORK"
mkdir -p "$WORK/.claude"
cache="$WORK/.claude/.switchboard-cache.json"

pass=0; fail=0
check() { # check <label> <actual> <expected|EMPTY>
  if [ "$3" = "EMPTY" ]; then
    if [ -z "$2" ]; then printf '  \033[32m✔\033[0m %s\n' "$1"; pass=$((pass+1));
    else printf '  \033[31m✖\033[0m %s\n     expected no output, got: %s\n' "$1" "$2"; fail=$((fail+1)); fi
  else
    if grep -q "$3" <<<"$2"; then printf '  \033[32m✔\033[0m %s\n' "$1"; pass=$((pass+1));
    else printf '  \033[31m✖\033[0m %s\n     expected: %s\n     got: %s\n' "$1" "$3" "$2"; fail=$((fail+1)); fi
  fi
}
probe() { # probe <session> <abs-path>
  echo "{\"session_id\":\"$1\",\"cwd\":\"/Users/other/sb\",\"tool_input\":{\"file_path\":\"$2\"}}" \
    | "$HOOKS/fallback-check.sh"
}

printf '\n\033[1mSetup: put one lease in the cache\033[0m\n'
curl -sS --max-time 5 -X POST "http://$HUB/admin/reset" -d '{}' -H 'Content-Type: application/json' >/dev/null 2>&1 \
  || { echo "  hub unreachable at $HUB — start it first"; exit 1; }
curl -sS --max-time 5 -X POST "http://$HUB/hooks/session-start" -H 'Content-Type: application/json' \
  -d '{"session_id":"s-holder","machine":"holder-mbp","human":"Maya","cwd":"/Users/maya/demo"}' >/dev/null
curl -sS --max-time 5 -X POST "http://$HUB/hooks/pre-edit" -H 'Content-Type: application/json' \
  -d '{"session_id":"s-holder","cwd":"/Users/maya/demo","tool_input":{"file_path":"/Users/maya/demo/web/src/components/Cart/CartItem.tsx"}}' >/dev/null

SB_HUB="${HUB%%:*}" "$HOOKS/refresh-cache.sh"
[ -f "$cache" ] || { echo "  cache was not written — refresh-cache.sh failed"; exit 1; }
held=$(jq -r '.leases[0].paths[0] // "none"' "$cache")
echo "  cached lease: $held (held by $(jq -r '.leases[0].humanName // "?"' "$cache"))"

printf '\n\033[1mL1 behavior with the hub unreachable\033[0m\n'

out=$(probe s-other /Users/other/sb/web/src/components/Cart/CartItem.tsx)
check "denies a different session on a cached-held path" "$out" '"permissionDecision": *"deny"'
check "says plainly that it is running on cached state" "$out" 'running on cached state'
check "names the holder" "$out" 'leased by Maya'

out=$(probe s-holder /Users/other/sb/web/src/components/Cart/CartItem.tsx)
check "stays silent for the lease holder itself" "$out" EMPTY

out=$(probe s-other /Users/other/sb/api/routes/cart.ts)
check "stays silent on an unrelated path" "$out" EMPTY

out=$(probe s-other '')
check "stays silent when there is no file path" "$out" EMPTY

printf '\n\033[1mBounded fail-open\033[0m\n'
jq '.fetchedAt = (.fetchedAt - 120)' "$cache" > "$cache.tmp" && mv "$cache.tmp" "$cache"
out=$(probe s-other /Users/other/sb/web/src/components/Cart/CartItem.tsx)
check "distrusts a cache older than 90s" "$out" EMPTY

mv "$cache" "$cache.away"
out=$(probe s-other /Users/other/sb/web/src/components/Cart/CartItem.tsx)
check "stays silent when no cache exists at all" "$out" EMPTY
mv "$cache.away" "$cache"

echo '{ this is not json' > "$cache"
out=$(probe s-other /Users/other/sb/web/src/components/Cart/CartItem.tsx)
check "survives a corrupt cache without denying" "$out" EMPTY

printf '\n\033[1mRESULT\033[0m\n  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

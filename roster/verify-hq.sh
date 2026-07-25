#!/bin/bash
# End-to-end verification of the HQ endpoint.
#
#   npm run dev        # terminal 1
#   npm run verify:hq  # terminal 2
#
# Checks the contract Person D handed over AND the hard requirement: every HQ
# response must cite a concrete detail from the profile's traits. Runs with or
# without an API key — without one the deterministic floor answers, and it must
# still pass every check.
#
# Uses jq throughout. The traits in the fixture contain quoted commit messages,
# and composing that JSON with shell string interpolation mangles the escapes.
set -uo pipefail

BASE="${ROSTER_URL:-http://127.0.0.1:3456}"
pass=0; fail=0
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

hr()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()  { printf '  \033[32m✔\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  \033[31m✖\033[0m %s\n     %s\n' "$1" "${2:-}"; fail=$((fail+1)); }

command -v jq >/dev/null 2>&1 || { echo "jq required: brew install jq" >&2; exit 1; }

# A profile shaped like a real derived one: traits quote real commit messages and
# name real files, so "did it cite something real?" is actually checkable.
cat > "$work/profile.json" <<'JSON'
{
  "archetype": "Evidence-Led Maintainer",
  "summary": "The chalk/chalk team ships small TypeScript changes with terse commit messages.",
  "traits": [
    "Recent commits include \"Add support for WezTerm true-color detection\" and \"Fix Ghostty 24-bit check\".",
    "Primary language is TypeScript; the public surface is a single index.d.ts with no runtime dependencies.",
    "README leads with a usage example before install instructions."
  ],
  "directive": "Reuse an existing agent for small scoped asks; spawn only for surfaces absent from recent commits.",
  "source_repo": "chalk/chalk"
}
JSON

hq() { # hq <request> <team>  -> response json on stdout
  jq -n --slurpfile p "$work/profile.json" --arg req "$1" --arg team "$2" \
    '{request:$req, team:$team, user:"verify", profile:$p[0]}' \
  | curl -sS --max-time 45 -X POST "$BASE/api/hq" \
      -H 'Content-Type: application/json' --data-binary @-
}

get() { jq -r "$1 // empty" <<<"$2" 2>/dev/null; }
# jq's // treats `false` as empty, so booleans need a plain read or `false`
# prints as blank — which would make "model used: false" look like a bug.
getraw() { jq -r "$1" <<<"$2" 2>/dev/null; }

hr "0. server reachable"
if curl -fsS --max-time 5 "$BASE/api/events" >/dev/null 2>&1; then
  ok "roster app is up at $BASE"
else
  bad "cannot reach $BASE" "run: npm run dev   (or set ROSTER_URL)"
  printf '\n  aborting\n\n'; exit 1
fi

# Reseed so this script is idempotent.
#
# WITHOUT THIS the run's own events land in the stream, and the next run's
# memory lookup matches THOSE instead of the seeded history — the checks below
# then fail on the second run for a reason that has nothing to do with the code.
#
# The same trap applies to rehearsing the demo: every practice run writes events,
# so by showtime the memory callback may cite a rehearsal rather than the seeded
# event. Reseed before the real run.
#
# Must go through `npm run seed`, which passes --env-file=.env.local. Calling tsx
# directly skips the env and reseeds the LOCAL JSON file while Supabase keeps
# every accumulated event — so the reseed appears to work and the memory checks
# below still fail against stale rows.
if [ "${SKIP_RESEED:-0}" != "1" ]; then
  if npm run --silent seed >/dev/null 2>&1; then
    ok "events reseeded to the 2 historical rows"
  else
    printf '  \033[33m•\033[0m %s\n' "could not reseed — results may be affected by earlier runs"
  fi
fi

hr "1. a request with no prior history"
out=$(hq "rotate the TLS certificate on the staging load balancer" "Ops")
if ! jq -e . >/dev/null 2>&1 <<<"$out"; then
  bad "response was not JSON" "$out"; printf '\n  aborting\n\n'; exit 1
fi
dec=$(get .decision "$out")
[[ "$dec" =~ ^(route_existing|spawn_new|handle_direct)$ ]] \
  && ok "decision is a valid enum value ($dec)" || bad "decision invalid" "$out"
[ -n "$(get .sub_agent "$out")" ] \
  && ok "sub_agent present ($(get .sub_agent "$out"))" || bad "sub_agent missing" "$out"
[ -n "$(get .terminal_line "$out")" ] && ok "terminal_line present" || bad "terminal_line missing" "$out"
[ "$(get .meta.specificity.ok "$out")" = "true" ] \
  && ok "SPECIFICITY GATE PASSED" \
  || bad "specificity gate FAILED — the demo's proof point" "$(get .meta.specificity "$out")"
[ "$(jq -r '.meta.memory_match == null' <<<"$out")" = "true" ] \
  && ok "correctly reports no memory match" \
  || bad "claimed a memory match for an unrelated request" "$(get .meta.memory_match "$out")"
printf '\n  \033[2mterminal_line:\033[0m\n    %s\n' "$(get .terminal_line "$out")"

hr "2. the memory beat — must match the seeded one-pager event"
out=$(hq "Can we refresh the sales one-pager for the enterprise demo?" "Sales")
if [ "$(jq -r '.meta.memory_match != null' <<<"$out")" = "true" ]; then
  ok "memory match found (score $(get .meta.memory_match.score "$out"))"
  mid=$(get .meta.memory_match.id "$out")
  [ "$mid" = "evt-seed-sales-onepager" ] \
    && ok "matched the seeded one-pager event" || bad "matched the wrong event" "$mid"
  ok "shared terms: $(jq -rc '.meta.memory_match.shared' <<<"$out")"
  grep -qi "one-pager\|prior\|seen\|previous" <<<"$(get .reasoning "$out")" \
    && ok "reasoning references the prior event" \
    || bad "reasoning ignores the match" "$(get .reasoning "$out")"
else
  bad "NO memory match — the 'we've seen this before' beat is broken" \
      "Is the events table seeded? Run: npm run seed"
fi
[ "$(get .meta.specificity.ok "$out")" = "true" ] \
  && ok "SPECIFICITY GATE PASSED" \
  || bad "specificity gate FAILED" "$(get .meta.specificity "$out")"
printf '\n  \033[2mterminal_line:\033[0m\n    %s\n' "$(get .terminal_line "$out")"
printf '  \033[2mreasoning:\033[0m\n    %s\n' "$(get .reasoning "$out")"

hr "3. cites a REAL detail — checked independently of the app's own gate"
line="$(get .terminal_line "$out") $(get .reasoning "$out")"
hits=0
for anchor in "chalk/chalk" "WezTerm" "Ghostty" "TypeScript" "index.d.ts" "README"; do
  if grep -qi -- "$anchor" <<<"$line"; then
    printf '  \033[32m✔\033[0m cites %s\n' "$anchor"; hits=$((hits+1))
  fi
done
if [ "$hits" -gt 0 ]; then pass=$((pass+1)); else
  bad "cites NOTHING concrete from traits" "$line"
fi

hr "4. the event reached the stream the dashboard reads"
eid=$(get .event.id "$out")
if [ -n "$eid" ]; then
  ok "event id returned ($eid)"
  sleep 1
  curl -sS --max-time 10 "$BASE/api/events" | grep -q "$eid" \
    && ok "event readable from /api/events" || bad "event not in /api/events"
else
  bad "no event returned" "$out"
fi

hr "5. bad input is rejected, not 500'd"
code=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/hq" \
  -H 'Content-Type: application/json' -d '{"team":"Sales"}')
[ "$code" = "400" ] && ok "missing request returns 400" || bad "expected 400, got $code"

hr "6. runtime configuration"
printf '  events backend:  %s\n' "$(get .meta.events_backend "$out")"
printf '  profile backend: %s\n' "$(get .meta.profile_backend "$out")"
printf '  decision source: %s\n' "$(get .meta.source "$out")"
printf '  model used:      %s\n' "$(getraw .meta.model_used "$out")"
if [ "$(getraw .meta.model_used "$out")" = "false" ]; then
  printf '\n  \033[2mNo model key set, so this exercised the deterministic floor only.\033[0m\n'
  printf '  \033[2mSet NVIDIA_API_KEY (or HQ_API_KEY) in .env.local and re-run to\033[0m\n'
  printf '  \033[2mexercise the model path and its specificity retry.\033[0m\n'
fi

hr "RESULT"
printf '  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

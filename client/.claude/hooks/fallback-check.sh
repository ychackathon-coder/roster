#!/bin/bash
# .claude/hooks/fallback-check.sh — L1 degraded-mode enforcement. §5.1
#
# ONLY EVER DENIES. Silence means "no opinion", not "approved" — L1 must never
# grant, because granting on stale data is how two agents end up editing the same
# file believing they both hold it.
#
# Runs in PARALLEL with the L0 HTTP hook. Precedence is deny > ask > allow, so
# either one can block and no extra wiring is needed.
input=$(cat)
path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
sid=$(jq -r '.session_id' <<<"$input")
cache="$CLAUDE_PROJECT_DIR/.claude/.switchboard-cache.json"

[ -z "$path" ] && exit 0
[ ! -f "$cache" ] && exit 0

# Stale cache is untrustworthy — bounded fail-open after 90 seconds. Availability
# beats enforcement in the write path (§5), and a 10-minute-old snapshot is worse
# than no opinion at all.
fetched=$(jq -r '.fetchedAt // 0' "$cache" 2>/dev/null || echo 0)
age=$(( $(date +%s) - fetched ))
[ "$age" -gt 90 ] && exit 0

# Suffix match so an absolute hook path resolves against a repo-relative lease
# path, the same reconciliation the hub does.
#
# NOTE the `. as $q` binding. Writing `($p | endswith("/" + .))` looks right and
# is silently wrong: the pipe rebinds `.` to $p, so it tests whether the path
# ends with itself and never matches. L1 then stops denying — with no error, and
# no way to notice until the hub is down and the fallback is all you have.
holder=$(jq -r --arg p "$path" --arg s "$sid" '
  .leases[]
  | select(.status=="held")
  | select(.sessionId != $s)
  | select(any(.paths[]; . as $q | $p == $q or ($p | endswith("/" + $q))))
  | .humanName' "$cache" 2>/dev/null | head -1)

if [ -n "$holder" ]; then
  jq -nc --arg h "$holder" --arg p "$path" --arg a "$age" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("Switchboard is offline and running on cached state. "
        + $p + " was leased by " + $h + " as of the last successful sync. "
        + "Cached data may be up to 90 seconds old.")
    }
  }'
fi
exit 0

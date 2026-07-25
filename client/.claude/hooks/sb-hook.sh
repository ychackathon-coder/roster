#!/bin/bash
# .claude/hooks/sb-hook.sh <endpoint> — the version-portable hook transport.
#
#   command: ${CLAUDE_PROJECT_DIR}/.claude/hooks/sb-hook.sh pre-edit
#
# WHY THIS EXISTS: `type: "http"` hooks are not available on every Claude Code
# version. On a version without them the L0 hook never fires and that session has
# no enforcement at all — silently. A command hook plus curl works everywhere
# hooks work, so this is the path that lets four people run four different
# versions.
#
# HOW IT BLOCKS, portably:
#   - exit 2 with the reason on stderr. Understood by every hook-era version,
#     and stderr is fed back to the agent rather than shown to the human.
#   - JSON on stdout for versions that read it. Emitted only for the non-blocking
#     context case, so the two mechanisms never contradict each other.
#
# Never exits non-zero for any reason OTHER than a genuine deny. A crash here
# must not look like a refusal.
set -uo pipefail

endpoint="${1:-}"
[ -z "$endpoint" ] && exit 0

: "${SB_HUB:=127.0.0.1}"
: "${SB_PORT:=8787}"

# SB_HUB_URL wins when set, so the same script works against a deployed hub
# (https://switchboard.vercel.app) or a laptop on the LAN.
if [ -n "${SB_HUB_URL:-}" ]; then
  base="${SB_HUB_URL%/}"
else
  base="http://$SB_HUB:$SB_PORT"
fi

input=$(cat)

# --max-time is the client-side mirror of §4's timeout discipline: a wedged hub
# must never hold an edit open.
resp=$(printf '%s' "$input" \
  | curl -sS --max-time 3 -X POST "$base/hooks/$endpoint" \
      -H 'Content-Type: application/json' \
      --data-binary @- 2>/dev/null) || exit 0

[ -z "$resp" ] && exit 0

# jq is required (§12, Phase 0 check). Without it, stay out of the way rather
# than guessing at the response.
command -v jq >/dev/null 2>&1 || exit 0

decision=$(jq -r '.hookSpecificOutput.permissionDecision // .decision // empty' <<<"$resp" 2>/dev/null)
reason=$(jq -r '.hookSpecificOutput.permissionDecisionReason // .reason // empty' <<<"$resp" 2>/dev/null)
ctx=$(jq -r '.hookSpecificOutput.additionalContext // .additionalContext // empty' <<<"$resp" 2>/dev/null)

case "$decision" in
  deny|block)
    # The reason goes to stderr, where the agent reads it. Exit 2 is the portable
    # block. Any queued notices ride along so nothing is lost on the refusal.
    if [ -n "$ctx" ]; then
      printf '%s\n\n%s\n' "$reason" "$ctx" >&2
    else
      printf '%s\n' "$reason" >&2
    fi
    exit 2
    ;;
esac

# Not a denial. Pass context through for versions that read hook stdout as JSON;
# inert on versions that don't.
if [ -n "$ctx" ]; then
  event=$(jq -r '.hook_event_name // "PreToolUse"' <<<"$input" 2>/dev/null)
  jq -nc --arg e "$event" --arg c "$ctx" \
    '{hookSpecificOutput:{hookEventName:$e, additionalContext:$c}, additionalContext:$c}'
fi
exit 0

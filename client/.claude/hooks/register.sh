#!/bin/bash
# .claude/hooks/register.sh — SessionStart. §4.1
#
# SessionStart does NOT accept type:"http", and mcp_tool is unreliable here
# because MCP servers typically haven't finished connecting when SessionStart
# fires. So registration is a curl script.
#
# stdout on SessionStart is added to the agent's context, which means the hub can
# seed a session with the board state at open — a free win.
#
# Never exits non-zero: a registration failure must not stop a session starting.
input=$(cat)
sid=$(jq -r '.session_id' <<<"$input")
cwd=$(jq -r '.cwd' <<<"$input")

: "${SB_HUB:=127.0.0.1}"

resp=$(curl -sS --max-time 4 -X POST "http://$SB_HUB:8787/hooks/session-start" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$sid" --arg host "$(hostname -s)" \
        --arg human "${SB_HUMAN:-$USER}" --arg cwd "$cwd" \
        '{session_id:$sid, machine:$host, human:$human, cwd:$cwd}')" 2>/dev/null) || true

# Seed the local cache so the L1 fallback hook has something to work with from
# the very first edit rather than only after the first successful post-edit.
curl -sS --max-time 4 "http://$SB_HUB:8787/leases/snapshot" \
  -o "$CLAUDE_PROJECT_DIR/.claude/.switchboard-cache.json" 2>/dev/null || true

ctx=$(jq -r '.additionalContext // empty' <<<"$resp" 2>/dev/null)
if [ -n "$ctx" ]; then
  jq -nc --arg c "$ctx" \
    '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$c}}'
fi
exit 0

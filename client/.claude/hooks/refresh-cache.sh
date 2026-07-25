#!/bin/bash
# .claude/hooks/refresh-cache.sh — keeps the L1 cache warm. §5
#
# Wired "async": true in http mode so it never blocks an edit. In command mode it
# runs inline but is bounded by --max-time.
#
# Writes atomically via a temp file: a half-written cache makes
# fallback-check.sh's jq fail, and a failing L1 check silently stops denying.
set -uo pipefail

: "${SB_HUB:=127.0.0.1}"
: "${SB_PORT:=8787}"
if [ -n "${SB_HUB_URL:-}" ]; then
  base="${SB_HUB_URL%/}"
else
  base="http://$SB_HUB:$SB_PORT"
fi

cache="$CLAUDE_PROJECT_DIR/.claude/.switchboard-cache.json"
tmp="$cache.tmp.$$"

if curl -sS --max-time 4 "$base/leases/snapshot" -o "$tmp" 2>/dev/null; then
  if jq -e . "$tmp" >/dev/null 2>&1; then
    mv "$tmp" "$cache"
  else
    rm -f "$tmp"
  fi
else
  rm -f "$tmp"
fi
exit 0

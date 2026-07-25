#!/bin/bash
# .claude/hooks/refresh-cache.sh — keeps the L1 cache warm. §5
#
# Wired with "async": true so it never blocks an edit. Writes atomically via a
# temp file: a half-written cache would make fallback-check.sh's jq fail, and a
# failing L1 check silently stops denying.
: "${SB_HUB:=127.0.0.1}"
cache="$CLAUDE_PROJECT_DIR/.claude/.switchboard-cache.json"
tmp="$cache.tmp.$$"

if curl -sS --max-time 4 "http://$SB_HUB:8787/leases/snapshot" -o "$tmp" 2>/dev/null; then
  if jq -e . "$tmp" >/dev/null 2>&1; then
    mv "$tmp" "$cache"
  else
    rm -f "$tmp"
  fi
else
  rm -f "$tmp"
fi
exit 0

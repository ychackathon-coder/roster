#!/bin/bash
# Install the Switchboard client into a target repo.
#
#   ./client/install.sh /path/to/demo-repo [--mode http|command|auto]
#
# MODES
#   auto     (default) picks command mode when this laptop's Claude Code may not
#            support type:"http" hooks, otherwise http mode
#   http     HTTP hooks — lowest overhead, needs a version with http hook support
#   command  curl via command hooks — works on EVERY hook-era version, and is the
#            right choice when the room is on mixed versions
#
# HUB ADDRESS — set one of:
#   export SB_HUB=192.168.12.30              # a laptop on the LAN
#   export SB_HUB_URL=https://x.vercel.app   # a deployed hub (wins if both set)
#
# Re-run after the hub moves.
set -euo pipefail

target="${1:-}"
mode="auto"
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) mode="${2:-auto}"; shift 2 ;;
    --mode=*) mode="${1#*=}"; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$target" ] || [ ! -d "$target" ]; then
  echo "usage: $0 /path/to/demo-repo [--mode http|command|auto]" >&2
  exit 1
fi

if [ -n "${SB_HUB_URL:-}" ]; then
  base="${SB_HUB_URL%/}"
  hub_desc="$base"
elif [ -n "${SB_HUB:-}" ]; then
  base="http://$SB_HUB:${SB_PORT:-8787}"
  hub_desc="$base"
else
  echo "error: set SB_HUB (LAN IP) or SB_HUB_URL (deployed hub) first." >&2
  echo "  export SB_HUB=192.168.12.30" >&2
  echo "  export SB_HUB_URL=https://switchboard.vercel.app" >&2
  exit 1
fi

here="$(cd "$(dirname "$0")" && pwd)"

# --- mode resolution -------------------------------------------------------
# http hooks are a newer feature. When we can't prove this laptop has them,
# command mode is the safe answer: it costs one process spawn per event and works
# on every version. Guessing wrong the other way means NO enforcement at all,
# silently, which is far worse.
detected="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo '')"
if [ "$mode" = "auto" ]; then
  if [ -z "$detected" ]; then
    mode="command"
    reason="could not detect a Claude Code version"
  else
    major=${detected%%.*}
    rest=${detected#*.}
    minor=${rest%%.*}
    patch=${rest#*.}
    # http hooks land in the 2.1.19x line; below that, use command mode.
    if [ "$major" -gt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -gt 1 ]; } \
      || { [ "$major" -eq 2 ] && [ "$minor" -eq 1 ] && [ "$patch" -ge 190 ]; }; then
      mode="http"
      reason="detected $detected"
    else
      mode="command"
      reason="detected $detected, which predates http hooks"
    fi
  fi
else
  reason="explicitly requested"
fi

case "$mode" in
  http) src="$here/.claude/settings.http.json" ;;
  command) src="$here/.claude/settings.command.json" ;;
  *) echo "error: --mode must be http, command, or auto" >&2; exit 1 ;;
esac

# --- install ---------------------------------------------------------------
mkdir -p "$target/.claude/hooks"
cp "$here/.claude/hooks/"*.sh "$target/.claude/hooks/"
chmod +x "$target/.claude/hooks/"*.sh

# The url field is not shell-expanded, so the base is substituted at install time.
# The shell scripts read SB_HUB / SB_HUB_URL at runtime and need no substitution.
sed "s|__BASE__|$base|g" "$src" > "$target/.claude/settings.json"

if ! grep -qs 'switchboard-cache' "$target/.gitignore" 2>/dev/null; then
  printf '\n# Switchboard L1 cache — per-machine runtime state\n.claude/.switchboard-cache.json\n' >> "$target/.gitignore"
fi

echo "Installed Switchboard client into $target"
echo "  mode:  $mode  ($reason)"
echo "  hub:   $hub_desc"
echo ""
echo "Each person needs these in their shell profile:"
if [ -n "${SB_HUB_URL:-}" ]; then
  echo "  export SB_HUB_URL=$base"
else
  echo "  export SB_HUB=${SB_HUB}"
fi
echo "  export SB_HUMAN=TheirName"
echo ""
echo "Then verify from EACH laptop:"
echo "  jq --version"
echo "  curl $base/health"
echo ""
echo "Claude Code versions may differ across the room — the hub records each"
echo "session's version and shows a badge when they diverge. Nothing is blocked."

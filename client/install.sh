#!/bin/bash
# Install the Switchboard client into a target repo.
#
#   ./client/install.sh /path/to/demo-repo
#
# Substitutes $SB_HUB into the hook URLs, because §4's settings.json needs a
# literal host and every laptop needs the same one. Run it again after the hub
# moves machines.
set -euo pipefail

target="${1:-}"
if [ -z "$target" ]; then
  echo "usage: $0 /path/to/demo-repo" >&2
  exit 1
fi
if [ ! -d "$target" ]; then
  echo "error: $target is not a directory" >&2
  exit 1
fi

if [ -z "${SB_HUB:-}" ]; then
  echo "error: SB_HUB is not set. Export the hub host's LAN IP first:" >&2
  echo "  export SB_HUB=192.168.1.42" >&2
  exit 1
fi

here="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$target/.claude/hooks"

# Hooks are copied verbatim; they read SB_HUB at runtime.
cp "$here/.claude/hooks/register.sh" "$target/.claude/hooks/"
cp "$here/.claude/hooks/fallback-check.sh" "$target/.claude/hooks/"
cp "$here/.claude/hooks/refresh-cache.sh" "$target/.claude/hooks/"
chmod +x "$target/.claude/hooks/"*.sh

# settings.json needs the literal host substituted — the url field is not
# shell-expanded.
sed "s/__HUB__/$SB_HUB/g" "$here/.claude/settings.json" > "$target/.claude/settings.json"

# The cache is per-machine runtime state, never committed.
if ! grep -qs 'switchboard-cache' "$target/.gitignore" 2>/dev/null; then
  printf '\n# Switchboard L1 cache — per-machine runtime state\n.claude/.switchboard-cache.json\n' >> "$target/.gitignore"
fi

echo "Installed Switchboard client into $target"
echo "  hub:      http://$SB_HUB:8787"
echo "  hooks:    $target/.claude/hooks/"
echo ""
echo "Checks before Phase 1:"
echo "  jq --version                              # required by every hook"
echo "  claude --version                          # must match on all four laptops"
echo "  curl http://$SB_HUB:8787/health           # from EACH laptop, not just the host"
echo ""
echo "Also confirm SB_HUB and SB_HUMAN are exported in each person's shell profile:"
echo "  echo \"export SB_HUB=$SB_HUB\" >> ~/.zshrc"
echo "  echo 'export SB_HUMAN=YourName' >> ~/.zshrc"

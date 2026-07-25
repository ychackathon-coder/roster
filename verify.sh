#!/bin/bash
# End-to-end verification against a running hub. Simulates the exact payloads
# Claude Code sends, so this can be run before any real session exists.
#
#   npm start &   # or npm run dev
#   ./verify.sh
#
# Reproduces the §14 demo collision and checks the §18 definition-of-done items
# that don't require a second physical machine.
HUB="${SB_HUB:-127.0.0.1}:8787"
FILE="web/src/components/Cart/CartItem.tsx"
ABS="/Users/maya/demo/$FILE"
pass=0; fail=0

hr() { printf '\n\033[1m%s\033[0m\n' "$1"; }
check() { # check <label> <condition-output> <expected-substring>
  if grep -q "$3" <<<"$2"; then printf '  \033[32m✔\033[0m %s\n' "$1"; pass=$((pass+1));
  else printf '  \033[31m✖\033[0m %s\n     expected to find: %s\n     got: %s\n' "$1" "$3" "$2"; fail=$((fail+1)); fi
}

post() { curl -sS --max-time 5 -X POST "http://$HUB$1" -H 'Content-Type: application/json' -d "$2"; }
get() { curl -sS --max-time 5 "http://$HUB$1"; }

mcp() { # mcp <tool> <args-json>
  curl -sS --max-time 10 -X POST "http://$HUB/mcp" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}"
}

preedit() { # preedit <session> <abs-path> <cwd>
  # Each session sends its OWN cwd — that's what makes two different absolute
  # paths reconcile to one repo-relative path. Faking a shared cwd here would
  # hide the exact bug this reproduces.
  post /hooks/pre-edit "{\"session_id\":\"$1\",\"cwd\":\"$3\",\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$2\"}}"
}

hr "0. health"
out=$(get /health)
check "hub is up" "$out" '"ok":true'

# Idempotent: clear sessions, leases, and notices and reopen every task, so this
# script gives the same answer on the fifth run as on the first. §15 risk 11's
# reseed path, exercised every time.
post /admin/reset '{}' >/dev/null
out=$(get /health)
check "reset returns all five tasks to the board" "$out" '"openTasks":5'

hr "1. two sessions register (§4.1 register.sh payload)"
out=$(post /hooks/session-start '{"session_id":"s-maya","machine":"maya-mbp","human":"Maya","cwd":"/Users/maya/demo"}')
check "Maya joined and got seeded context" "$out" 'registered as Maya on maya-mbp'
out=$(post /hooks/session-start '{"session_id":"s-sam","machine":"sam-air","human":"Sam","cwd":"/Users/sam/demo"}')
check "Sam joined" "$out" 'registered as Sam on sam-air'
check "Sam is told Maya is present" "$out" 'Maya on maya-mbp'

hr "2. intent capture (UserPromptSubmit)"
post /hooks/prompt '{"session_id":"s-maya","hook_event_name":"UserPromptSubmit","prompt":"add quantity stepper and wire optimistic update"}' >/dev/null
post /hooks/prompt '{"session_id":"s-sam","hook_event_name":"UserPromptSubmit","prompt":"render the selected variant in the cart row"}' >/dev/null
out=$(get /state)
check "Maya's intent recorded" "$out" 'add quantity stepper'

hr "3. task claims over MCP (§9)"
out=$(mcp hub_claim_task '{"session_id":"s-maya","task_id":"T-04"}')
check "Maya claimed T-04" "$out" 'T-04'
out=$(mcp hub_claim_task '{"session_id":"s-sam","task_id":"T-03"}')
check "Sam claimed T-03" "$out" 'T-03'

hr "4. §14 collision — the 0:35 demo beat"
out=$(preedit s-maya "$ABS" "/Users/maya/demo")
check "Maya's edit is allowed and takes a lease" "$out" '"permissionDecision":"allow"'
out=$(get /leases/snapshot)
check "lease visible in the L1 snapshot" "$out" 'CartItem.tsx'
check "snapshot carries fetchedAt for staleness" "$out" 'fetchedAt'

out=$(preedit s-sam "/Users/sam/work/sb/$FILE" "/Users/sam/work/sb")
check "Sam is DENIED on the same file" "$out" '"permissionDecision":"deny"'
check "denial names the holder and machine" "$out" "leased by Maya's session on maya-mbp"
check "denial carries the recorded intent" "$out" 'add quantity stepper'
check "denial offers somewhere else to go" "$out" 'Unassigned open tasks'
printf '\n  \033[2mdenial string as the agent receives it:\033[0m\n'
python3 -c "import json,sys; d=json.load(sys.stdin); print('  ' + d['hookSpecificOutput']['permissionDecisionReason'])" <<<"$out" 2>/dev/null

hr "5. same session re-editing refreshes, not duplicates (§3 step 4)"
preedit s-maya "$ABS" "/Users/maya/demo" >/dev/null
out=$(get /health)
check "still exactly one held lease" "$out" '"heldLeases":1'

hr "6. build status from PostToolUse on Bash"
post /hooks/post-bash '{"session_id":"s-maya","tool_name":"Bash","tool_input":{"command":"npm run build"},"tool_response":{"exit_code":1}}' >/dev/null
out=$(get /health)
check "failing build reflected on the board" "$out" '"buildStatus":"failing"'
post /hooks/post-bash '{"session_id":"s-maya","tool_name":"Bash","tool_input":{"command":"npm run build"},"tool_response":{"exit_code":0}}' >/dev/null
out=$(get /health)
check "passing build reflected" "$out" '"buildStatus":"passing"'

hr "7. MCP board and notices (§9)"
out=$(mcp hub_get_board '{}')
check "board lists both machines" "$out" 'maya-mbp'
check "board lists held scopes" "$out" 'CartItem'
out=$(mcp hub_get_notices '{"session_id":"s-sam"}')
check "notices endpoint answers" "$out" 'Switchboard'

hr "8. contract lookup (§9, derived not seeded)"
out=$(mcp hub_get_contract '{"name":"ScopeLease"}')
check "a derived contract resolves" "$out" 'ScopeLease'

hr "9. session end frees the lease and returns the task (§18)"
post /hooks/session-end '{"session_id":"s-maya","hook_event_name":"SessionEnd"}' >/dev/null
out=$(get /health)
check "Maya's lease freed" "$out" '"heldLeases":0'
out=$(preedit s-sam "/Users/sam/work/sb/$FILE" "/Users/sam/work/sb")
check "Sam can now take the file" "$out" '"permissionDecision":"allow"'

hr "RESULT"
printf '  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

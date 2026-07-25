/**
 * Cross-version response compatibility.
 *
 * These exist because the failure mode is invisible: a version that can't parse
 * our response fails OPEN and grants the edit. Nothing errors, nothing logs, and
 * the product silently stops working for that one teammate.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preToolUseResponse, contextResponse, parseVersion, formatVersion, versionsDiverge } from './compat.js'

test('a denial is expressed in both the modern and legacy envelopes', () => {
  const r = preToolUseResponse({ decision: 'deny', reason: 'Switchboard: held by Maya.' })
  const hso = r.hookSpecificOutput as Record<string, unknown>

  assert.equal(hso.permissionDecision, 'deny')
  assert.equal(hso.permissionDecisionReason, 'Switchboard: held by Maya.')
  // Older builds read these two.
  assert.equal(r.decision, 'block')
  assert.equal(r.reason, 'Switchboard: held by Maya.')
})

test('an allow does NOT emit a legacy approval', () => {
  // Critical: emitting "approve" would override a parallel hook's deny and
  // defeat the §5 L1 fallback, which runs alongside L0 and relies on
  // deny-wins precedence.
  const r = preToolUseResponse({ decision: 'allow' })
  assert.equal((r.hookSpecificOutput as Record<string, unknown>).permissionDecision, 'allow')
  assert.equal(r.decision, undefined)
  assert.equal(r.reason, undefined)
})

test('a denial always carries a reason even if none was supplied', () => {
  // An empty reason on an old build means the agent is blocked with no
  // explanation and cannot re-plan.
  const r = preToolUseResponse({ decision: 'deny' })
  assert.ok(typeof r.reason === 'string' && (r.reason as string).length > 0)
})

test('additionalContext rides along on both shapes', () => {
  const r = preToolUseResponse({ decision: 'allow', additionalContext: 'notice text' })
  assert.equal((r.hookSpecificOutput as Record<string, unknown>).additionalContext, 'notice text')
})

test('contextResponse is empty when there is nothing to say', () => {
  assert.deepEqual(contextResponse('Stop', undefined), {})
  assert.deepEqual(contextResponse('Stop', ''), {})
})

test('contextResponse emits both nested and top-level fields', () => {
  const r = contextResponse('UserPromptSubmit', 'hello')
  assert.equal((r.hookSpecificOutput as Record<string, unknown>).additionalContext, 'hello')
  assert.equal(r.additionalContext, 'hello')
})

test('version parsing tolerates the real --version output', () => {
  assert.deepEqual(parseVersion('2.1.220 (Claude Code)'), [2, 1, 220])
  assert.deepEqual(parseVersion('  2.1.191  '), [2, 1, 191])
  assert.equal(parseVersion('unknown'), null)
  assert.equal(parseVersion(undefined), null)
  assert.equal(formatVersion('2.1.220 (Claude Code)'), '2.1.220')
  assert.equal(formatVersion(undefined), 'unknown')
})

test('divergence is detected across versions but not within one', () => {
  assert.equal(versionsDiverge(['2.1.220', '2.1.220']), false)
  assert.equal(versionsDiverge(['2.1.220', '2.1.191']), true)
  // A single session, or unparseable input, is never "divergent".
  assert.equal(versionsDiverge(['2.1.220']), false)
  assert.equal(versionsDiverge(['unknown', 'unknown']), false)
  assert.equal(versionsDiverge([]), false)
})

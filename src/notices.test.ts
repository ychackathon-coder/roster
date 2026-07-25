/**
 * §6.2 — the notice budget. All four mechanisms.
 *
 * §15 risk 6: "Notice overflow silently swallows a blocking notice." These tests
 * are the mitigation, because the failure is invisible at runtime.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { queueNotice, drainForSession, pendingFor, needsCompaction, applyCompaction } from './notices.js'
import { makeState } from './testkit.js'

const fill = (n: number) => 'x'.repeat(n)

test('mechanism 2: a blocking notice is delivered first', () => {
  const s = makeState()
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: 'INFO one' })
  queueNotice(s, { toSessionId: 's1', kind: 'sequencing', severity: 'warn', message: 'SEQ one' })
  queueNotice(s, { toSessionId: 's1', kind: 'overlap_denied', severity: 'block', message: 'BLOCK one' })

  const { context } = drainForSession(s, 's1')
  assert.ok(context.startsWith('BLOCK one'), `blocking notice must lead, got: ${context.slice(0, 40)}`)
})

test('mechanism 2: kind ordering holds among non-blocking notices', () => {
  const s = makeState()
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: 'INFO' })
  queueNotice(s, { toSessionId: 's1', kind: 'sequencing', severity: 'warn', message: 'SEQ' })
  queueNotice(s, { toSessionId: 's1', kind: 'contract_changed', severity: 'warn', message: 'CONTRACT' })
  queueNotice(s, { toSessionId: 's1', kind: 'semantic_conflict', severity: 'warn', message: 'SEMANTIC' })

  const { context } = drainForSession(s, 's1')
  const order = ['SEMANTIC', 'CONTRACT', 'SEQ', 'INFO'].map((k) => context.indexOf(k))
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `wrong priority order: ${context}`)
})

test('mechanism 3: the same contract warning never goes out twice', () => {
  const s = makeState()
  queueNotice(s, {
    toSessionId: 's1', kind: 'contract_changed', severity: 'warn',
    message: 'OLD shape', relatedSessionId: 's2', contractName: 'POST /api/cart/items',
  })
  queueNotice(s, {
    toSessionId: 's1', kind: 'contract_changed', severity: 'warn',
    message: 'NEW shape', relatedSessionId: 's2', contractName: 'POST /api/cart/items',
  })

  const pending = pendingFor(s, 's1')
  assert.equal(pending.length, 1, 'duplicate should have been dropped, not queued')
  assert.equal(pending[0]!.message, 'NEW shape', 'newest wins')
})

test('mechanism 3: different contracts are not deduped together', () => {
  const s = makeState()
  queueNotice(s, {
    toSessionId: 's1', kind: 'contract_changed', severity: 'warn',
    message: 'A', relatedSessionId: 's2', contractName: 'POST /api/cart/items',
  })
  queueNotice(s, {
    toSessionId: 's1', kind: 'contract_changed', severity: 'warn',
    message: 'B', relatedSessionId: 's2', contractName: 'CartItem.variantId',
  })
  assert.equal(pendingFor(s, 's1').length, 2)
})

test('mechanism 1: the budget is never exceeded', () => {
  const s = makeState()
  for (let i = 0; i < 20; i += 1) {
    queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: `${i}:${fill(500)}` })
  }
  const { context } = drainForSession(s, 's1')
  assert.ok(context.length <= 4000, `built ${context.length} chars against a 4000 budget`)
})

test('mechanism 1: over-budget notices are dropped, not truncated mid-sentence', () => {
  const s = makeState()
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: `A${fill(2000)}` })
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: `B${fill(2000)}` })
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: `C${fill(2000)}` })

  const { context, overflow } = drainForSession(s, 's1')
  assert.ok(overflow > 0, 'expected overflow')
  // Whatever made it in is whole: no partial 2000-char body.
  for (const label of ['A', 'B', 'C']) {
    const idx = context.indexOf(label + 'x')
    if (idx !== -1) {
      const body = context.slice(idx).split('\n\n')[0]!
      assert.equal(body.length, 2001, `${label} was truncated to ${body.length}`)
    }
  }
})

test('mechanism 4: overflow collapses to one MCP pointer line', () => {
  const s = makeState()
  for (let i = 0; i < 10; i += 1) {
    queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: `${i}:${fill(600)}` })
  }
  const { context, overflow, delivered } = drainForSession(s, 's1')

  assert.ok(overflow > 0)
  assert.match(context, /hub_get_notices returns full detail/)
  assert.match(context, new RegExp(`${overflow} additional notice`))
  // Overflowed notices stay queued so the MCP pull is honest.
  assert.equal(pendingFor(s, 's1').length, 10 - delivered.length)
})

test('a blocking notice larger than the whole budget is still delivered', () => {
  // Pathological, but §6.2 says a blocking notice always gets through.
  const s = makeState()
  const huge = `${'This is a sentence. '.repeat(400)}`
  queueNotice(s, { toSessionId: 's1', kind: 'overlap_denied', severity: 'block', message: huge })

  const { context, delivered } = drainForSession(s, 's1')
  assert.equal(delivered.length, 1, 'the block must not be dropped')
  assert.ok(context.length <= 4000)
  assert.ok(context.trimEnd().endsWith('.'), 'trim must land on a sentence boundary')
})

test('delivered notices are not re-sent on the next drain', () => {
  const s = makeState()
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: 'once' })

  const first = drainForSession(s, 's1')
  assert.equal(first.context, 'once')
  const second = drainForSession(s, 's1')
  assert.equal(second.context, '', 'already-delivered notice was re-sent')
})

test('notices are scoped to one session — never broadcast', () => {
  // §6.2: "Never put board state in additionalContext. Push only deltas
  // relevant to THIS session."
  const s = makeState()
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: 'for s1' })
  queueNotice(s, { toSessionId: 's2', kind: 'info', severity: 'info', message: 'for s2' })

  assert.equal(drainForSession(s, 's1').context, 'for s1')
  assert.equal(drainForSession(s, 's2').context, 'for s2')
})

test('an empty queue produces no context at all', () => {
  const s = makeState()
  const { context, delivered, overflow } = drainForSession(s, 's1')
  assert.equal(context, '')
  assert.equal(delivered.length, 0)
  assert.equal(overflow, 0)
})

test('compaction threshold trips above four pending', () => {
  const s = makeState()
  for (let i = 0; i < 4; i += 1) {
    queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: `n${i}`, contractName: `c${i}` })
  }
  assert.equal(needsCompaction(s, 's1'), false)
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: 'n5', contractName: 'c5' })
  assert.equal(needsCompaction(s, 's1'), true)
})

test('compaction replaces the queue and keeps the worst severity', () => {
  const s = makeState()
  queueNotice(s, { toSessionId: 's1', kind: 'info', severity: 'info', message: 'a', contractName: 'c1' })
  queueNotice(s, { toSessionId: 's1', kind: 'overlap_denied', severity: 'block', message: 'b', contractName: 'c2' })

  applyCompaction(s, 's1', 'One paragraph covering both.')
  const pending = pendingFor(s, 's1')

  assert.equal(pending.length, 1)
  assert.equal(pending[0]!.message, 'One paragraph covering both.')
  assert.equal(pending[0]!.severity, 'block', 'a block must not be downgraded by compaction')
})

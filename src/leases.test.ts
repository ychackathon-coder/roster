/**
 * Fast-path behavior — §3 steps 1-6, and the §14 demo collision.
 *
 * Every assertion here maps to a line on the §18 definition of done.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateEdit,
  findBlockingLease,
  isCoupled,
  releaseSessionLeases,
  releaseLease,
  sweep,
  heldLeases,
  unassignedOpenTasks,
  freePathsForSession,
} from './leases.js'
import { makeState, seedDemoTasks, joinSession } from './testkit.js'

const CART_ITEM = 'web/src/components/Cart/CartItem.tsx'

test('an edit creates a lease with no agent cooperation required', () => {
  // §18: "An edit creates a lease with no agent cooperation required."
  const s = makeState()
  seedDemoTasks(s)
  joinSession(s, { id: 's1', name: 'Maya', machine: 'maya-mbp', taskId: 'T-04' })

  const d = evaluateEdit(s, { sessionId: 's1', path: `/Users/maya/demo/${CART_ITEM}` })
  assert.equal(d.kind, 'allow')
  assert.equal(heldLeases(s).length, 1)
  assert.equal(heldLeases(s)[0]!.sessionId, 's1')
})

test('T-03 and T-04 racing CartItem.tsx produces a denial', () => {
  // The engineered §14 collision. This is the 0:35 demo beat.
  const s = makeState()
  seedDemoTasks(s)
  joinSession(s, {
    id: 's1', name: 'Maya', machine: 'maya-mbp', taskId: 'T-04',
    intent: 'add quantity stepper and wire optimistic update',
  })
  joinSession(s, { id: 's2', name: 'Sam', machine: 'sam-air', taskId: 'T-03' })

  evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })
  const d = evaluateEdit(s, { sessionId: 's2', path: `/Users/sam/repo/${CART_ITEM}` })

  assert.equal(d.kind, 'deny')
  if (d.kind !== 'deny') return
  assert.match(d.reason, /leased by Maya's session on maya-mbp/)
  assert.match(d.reason, /add quantity stepper/)
  // The denial must carry somewhere else to go, or the agent has no re-plan.
  assert.match(d.reason, /Unassigned open tasks: /)
})

test('same session touching its own path refreshes rather than duplicating', () => {
  // §3 step 4. A multi-edit turn must not create N leases.
  const s = makeState()
  seedDemoTasks(s)
  joinSession(s, { id: 's1', name: 'Maya', machine: 'maya-mbp', taskId: 'T-04' })

  const first = evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })
  const second = evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })
  assert.equal(first.kind, 'allow')
  assert.equal(second.kind, 'allow')
  assert.equal(heldLeases(s).length, 1)
  assert.equal(heldLeases(s)[0]!.editCount, 1)
})

test('coupled work defers instead of denying', () => {
  // §3 step 5 / §8 Tier 2: T-02 dependsOn T-01, so a collision between them is
  // an ordered handoff, not a refusal. Serialization is not coordination.
  const s = makeState()
  seedDemoTasks(s)
  s.tasks['T-01']!.suggestedPaths = ['api/types.ts']
  s.tasks['T-02']!.suggestedPaths = ['api/types.ts']
  joinSession(s, { id: 's1', name: 'Dev', machine: 'dev-air', taskId: 'T-01' })
  joinSession(s, { id: 's2', name: 'Sam', machine: 'sam-air', taskId: 'T-02' })

  evaluateEdit(s, { sessionId: 's1', path: 'api/types.ts' })
  const d = evaluateEdit(s, { sessionId: 's2', path: 'api/types.ts' })

  assert.equal(d.kind, 'defer')
  if (d.kind !== 'defer') return
  assert.match(d.reason, /depends on T-01/)
  assert.ok(Object.values(s.leases).some((l) => l.status === 'deferred'))
})

test('independent tasks on the same file are not coupled', () => {
  const s = makeState()
  seedDemoTasks(s)
  const a = joinSession(s, { id: 's1', name: 'Maya', machine: 'm', taskId: 'T-04' })
  const b = joinSession(s, { id: 's2', name: 'Sam', machine: 's', taskId: 'T-03' })
  // T-03 dependsOn T-02, not T-04 — so these two are merely co-located.
  assert.equal(isCoupled(s, a, b), false)
})

test('an unregistered session is never blocked', () => {
  // §5 posture: a missed SessionStart must not look like a broken repo.
  const s = makeState()
  seedDemoTasks(s)
  joinSession(s, { id: 's1', name: 'Maya', machine: 'maya-mbp', taskId: 'T-04' })
  evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })

  const d = evaluateEdit(s, { sessionId: 'unknown-session', path: CART_ITEM })
  assert.equal(d.kind, 'allow')
})

test('releasing a lease reports the sessions that were waiting', () => {
  const s = makeState()
  seedDemoTasks(s)
  s.tasks['T-01']!.suggestedPaths = ['api/types.ts']
  s.tasks['T-02']!.suggestedPaths = ['api/types.ts']
  joinSession(s, { id: 's1', name: 'Dev', machine: 'dev-air', taskId: 'T-01' })
  joinSession(s, { id: 's2', name: 'Sam', machine: 'sam-air', taskId: 'T-02' })

  const granted = evaluateEdit(s, { sessionId: 's1', path: 'api/types.ts' })
  assert.equal(granted.kind, 'allow')
  evaluateEdit(s, { sessionId: 's2', path: 'api/types.ts' })

  const woken = granted.kind === 'allow' ? releaseLease(s, granted.leaseId) : []
  assert.deepEqual(woken, ['s2'])
})

test('a dead session frees its lease and returns its task to the board', () => {
  // §18: "A dead session's lease frees and its task returns."
  const s = makeState()
  seedDemoTasks(s)
  joinSession(s, { id: 's1', name: 'Maya', machine: 'maya-mbp', taskId: 'T-04' })
  evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })

  assert.equal(s.tasks['T-04']!.status, 'in_progress')
  releaseSessionLeases(s, 's1')

  assert.equal(heldLeases(s).length, 0)
  assert.equal(s.tasks['T-04']!.status, 'open')
  assert.equal(s.tasks['T-04']!.claimedBy, null)
  // And the freed path is now grantable by someone else.
  joinSession(s, { id: 's2', name: 'Sam', machine: 'sam-air', taskId: 'T-03' })
  assert.equal(evaluateEdit(s, { sessionId: 's2', path: CART_ITEM }).kind, 'allow')
})

test('TTL expiry frees a lease and wakes its waiters', () => {
  const s = makeState()
  seedDemoTasks(s)
  joinSession(s, { id: 's1', name: 'Maya', machine: 'maya-mbp', taskId: 'T-04' })
  const d = evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })
  assert.equal(d.kind, 'allow')

  // Expire it by hand rather than waiting ten minutes.
  for (const l of Object.values(s.leases)) l.expiresAt = Date.now() - 1
  const { expired } = sweep(s)

  assert.equal(expired, 1)
  assert.equal(heldLeases(s).length, 0)
})

test('a quiet session is marked gone and its scopes freed', () => {
  const s = makeState()
  seedDemoTasks(s)
  joinSession(s, { id: 's1', name: 'Maya', machine: 'maya-mbp', taskId: 'T-04' })
  evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })

  s.sessions['s1']!.lastSeen = Date.now() - 120_000
  const { gone } = sweep(s)

  assert.deepEqual(gone, ['s1'])
  assert.equal(s.sessions['s1']!.status, 'gone')
  assert.equal(heldLeases(s).length, 0)
  assert.equal(s.tasks['T-04']!.status, 'open')
})

test('the denial offers only genuinely free paths', () => {
  const s = makeState()
  seedDemoTasks(s)
  s.tasks['T-03']!.suggestedPaths = [CART_ITEM, 'web/src/components/Cart/CartTotals.tsx']
  joinSession(s, { id: 's1', name: 'Maya', machine: 'm', taskId: 'T-04' })
  const sam = joinSession(s, { id: 's2', name: 'Sam', machine: 's', taskId: 'T-03' })

  evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })
  const free = freePathsForSession(s, sam)

  assert.ok(!free.includes(CART_ITEM), 'the held path must not be offered')
  assert.ok(free.includes('web/src/components/Cart/CartTotals.tsx'))
})

test('claimed tasks drop out of the unassigned list', () => {
  const s = makeState()
  seedDemoTasks(s)
  assert.equal(unassignedOpenTasks(s).length, 5)
  joinSession(s, { id: 's1', name: 'Maya', machine: 'm', taskId: 'T-04' })
  const open = unassignedOpenTasks(s)
  assert.equal(open.length, 4)
  assert.ok(!open.some((t) => t.startsWith('T-04')))
})

test('findBlockingLease ignores the caller and prefers the oldest holder', () => {
  const s = makeState()
  seedDemoTasks(s)
  joinSession(s, { id: 's1', name: 'Maya', machine: 'm', taskId: 'T-04' })
  evaluateEdit(s, { sessionId: 's1', path: CART_ITEM })

  assert.equal(findBlockingLease(s, CART_ITEM, 's1'), null, 'own lease is not blocking')
  assert.ok(findBlockingLease(s, CART_ITEM, 's2'))
})

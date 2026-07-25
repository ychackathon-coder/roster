/**
 * §13 Phase 1 requires exactly three tests: identical, nested, disjoint.
 * The absolute-vs-relative block is added because that mismatch is the failure
 * that would make the hub grant every lease and deny nothing — silently.
 *
 * Run: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathsOverlap, anyPathOverlaps, pathSetsOverlap, normalize, relativize } from './overlap.js'

test('relativize reconciles absolute hook paths across machines', () => {
  // THE BUG THIS EXISTS TO PREVENT: without relativize, Maya's and Sam's
  // absolute paths for the same file share nothing textually, no lease ever
  // collides, and the hub silently grants everything.
  const maya = relativize('/Users/maya/demo/web/src/App.tsx', '/Users/maya/demo')
  const sam = relativize('/Users/sam/work/switchboard/web/src/App.tsx', '/Users/sam/work/switchboard')
  assert.equal(maya, 'web/src/App.tsx')
  assert.equal(sam, 'web/src/App.tsx')
  assert.equal(pathsOverlap(maya, sam), true, 'same file on two machines must collide')
})

test('relativize is a no-op when cwd is unknown or unrelated', () => {
  assert.equal(relativize('/Users/maya/demo/web/App.tsx'), '/Users/maya/demo/web/App.tsx')
  assert.equal(
    relativize('/Users/maya/demo/web/App.tsx', '/somewhere/else'),
    '/Users/maya/demo/web/App.tsx',
  )
  // Trailing slash on cwd must not leave a leading slash behind.
  assert.equal(relativize('/Users/maya/demo/web/App.tsx', '/Users/maya/demo/'), 'web/App.tsx')
})

test('relativize leaves already-relative paths alone', () => {
  assert.equal(relativize('web/src/App.tsx', '/Users/maya/demo'), 'web/src/App.tsx')
})

test('identical paths overlap', () => {
  assert.equal(pathsOverlap('api/routes/cart.ts', 'api/routes/cart.ts'), true)
  assert.equal(pathsOverlap('./api/routes/cart.ts', 'api/routes/cart.ts'), true)
  assert.equal(pathsOverlap('api//routes/cart.ts', 'api/routes/cart.ts'), true)
})

test('nested paths overlap in both directions', () => {
  assert.equal(pathsOverlap('web/src/components', 'web/src/components/Cart/CartItem.tsx'), true)
  assert.equal(pathsOverlap('web/src/components/Cart/CartItem.tsx', 'web/src/components'), true)
  assert.equal(pathsOverlap('web', 'web/src/index.tsx'), true)
})

test('disjoint paths do not overlap', () => {
  assert.equal(pathsOverlap('api/routes/cart.ts', 'web/src/components/Cart/CartItem.tsx'), false)
  assert.equal(pathsOverlap('api/types.ts', 'web/types.ts'), false)
  // Segment-aware: a shared string prefix is not containment.
  assert.equal(pathsOverlap('api/routes', 'api/routes-v2/cart.ts'), false)
})

test('absolute hook path matches relative lease path', () => {
  // The actual shape at runtime: PreToolUse gives an absolute file_path, the
  // §14 seed gives repo-relative paths.
  assert.equal(
    pathsOverlap('/Users/maya/demo/api/routes/cart.ts', 'api/routes/cart.ts'),
    true,
  )
  assert.equal(
    pathsOverlap('api/routes/cart.ts', '/Users/maya/demo/api/routes/cart.ts'),
    true,
  )
})

test('same relative tail resolves across different checkouts', () => {
  // §16: the mechanism must behave identically when four people have the repo
  // at four different absolute paths.
  assert.equal(
    pathsOverlap('/Users/maya/demo/api/routes/cart.ts', '/Users/dev/work/api/routes/cart.ts'),
    false, // two absolutes are compared strictly — reconciliation is the lease's job
  )
  assert.equal(anyPathOverlaps(['api/routes/cart.ts'], '/Users/dev/work/api/routes/cart.ts'), true)
})

test('single-segment relative paths do not produce phantom matches', () => {
  // "types.ts" must NOT match api/types.ts, or two agents in different files
  // would collide for no reason. §14 ships both api/types.ts and web/ types.
  assert.equal(pathsOverlap('types.ts', '/Users/maya/demo/api/types.ts'), false)
})

test('relative directory contains an absolute file beneath it', () => {
  assert.equal(
    pathsOverlap('web/src/components', '/Users/maya/demo/web/src/components/Cart/CartItem.tsx'),
    true,
  )
})

test('empty and whitespace paths never overlap', () => {
  assert.equal(pathsOverlap('', 'api/routes/cart.ts'), false)
  assert.equal(pathsOverlap('   ', 'api/routes/cart.ts'), false)
})

test('anyPathOverlaps scans a lease path set', () => {
  const held = ['api/routes/cart.ts', 'api/types.ts']
  assert.equal(anyPathOverlaps(held, '/Users/maya/demo/api/types.ts'), true)
  assert.equal(anyPathOverlaps(held, '/Users/maya/demo/web/src/App.tsx'), false)
})

test('pathSetsOverlap finds cross-set collisions', () => {
  // T-03 and T-04 from §14 — the engineered demo collision.
  const t03 = ['web/src/components/Cart/CartItem.tsx']
  const t04 = ['web/src/components/Cart/CartItem.tsx']
  const t01 = ['api/routes/cart.ts', 'api/types.ts']
  assert.equal(pathSetsOverlap(t03, t04), true)
  assert.equal(pathSetsOverlap(t01, t03), false)
})

test('normalize strips trailing slashes but preserves root', () => {
  assert.equal(normalize('api/routes/'), 'api/routes')
  assert.equal(normalize('/'), '/')
  assert.equal(normalize('web\\src\\App.tsx'), 'web/src/App.tsx')
})

/**
 * Redis store behavior, against a stubbed fetch.
 *
 * The important property is not that it stores things — it's that EVERY failure
 * path degrades instead of throwing. A store error inside the request path would
 * surface as a hook error, and a hook error fails open and grants the edit. So a
 * broken store must never be able to break enforcement more than it already has.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRedisStore, memoryStore } from './store.js'
import { makeState } from './testkit.js'

const cfg = { url: 'https://fake.upstash.io', token: 'tok' }

type FetchStub = {
  calls: unknown[][]
  restore: () => void
}

const stubFetch = (handler: (commands: (string | number)[][]) => unknown): FetchStub => {
  const original = globalThis.fetch
  const calls: unknown[][] = []
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    const commands = JSON.parse(init?.body ?? '[]') as (string | number)[][]
    calls.push(commands)
    const result = handler(commands)
    if (result instanceof Error) throw result
    return {
      ok: true,
      status: 200,
      json: async () => result,
      text: async () => JSON.stringify(result),
    }
  }) as typeof globalThis.fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}

test('memory store is inert and always grants the lock', async () => {
  assert.equal(memoryStore.kind, 'memory')
  assert.equal(await memoryStore.load(), null)
  const unlock = await memoryStore.lock(1000)
  assert.ok(unlock, 'memory mode must never fail to lock — it is one process')
  await unlock()
})

test('save then load round-trips the state', async () => {
  let stored = ''
  const f = stubFetch((cmds) => {
    const [cmd] = cmds
    if (cmd?.[0] === 'SET') {
      stored = String(cmd[2])
      return [{ result: 'OK' }]
    }
    return [{ result: stored }]
  })
  try {
    const store = createRedisStore(cfg)
    const s = makeState()
    s.rev = 42
    s.buildStatus = 'failing'
    await store.save(s)

    const loaded = await store.load()
    assert.equal(loaded?.rev, 42)
    assert.equal(loaded?.buildStatus, 'failing')
  } finally {
    f.restore()
  }
})

test('save sets an expiry so yesterday state cannot resurface', async () => {
  const f = stubFetch(() => [{ result: 'OK' }])
  try {
    await createRedisStore(cfg).save(makeState())
    const cmd = f.calls[0]![0] as string[]
    assert.equal(cmd[0], 'SET')
    assert.ok(cmd.includes('EX'), 'expected an EX expiry on the state key')
  } finally {
    f.restore()
  }
})

test('load returns null on a network failure instead of throwing', async () => {
  const f = stubFetch(() => new Error('ECONNRESET'))
  try {
    assert.equal(await createRedisStore(cfg).load(), null)
  } finally {
    f.restore()
  }
})

test('load returns null on malformed JSON instead of throwing', async () => {
  const f = stubFetch(() => [{ result: '{ not json' }])
  try {
    assert.equal(await createRedisStore(cfg).load(), null)
  } finally {
    f.restore()
  }
})

test('save swallows failures — a store outage must not deny an edit', async () => {
  const f = stubFetch(() => new Error('rate limited'))
  try {
    await createRedisStore(cfg).save(makeState())
  } finally {
    f.restore()
  }
})

test('lock returns null when already held, so the caller can decide', async () => {
  const f = stubFetch(() => [{ result: null }])
  try {
    assert.equal(await createRedisStore(cfg).lock(1000), null)
  } finally {
    f.restore()
  }
})

test('lock uses NX and PX so a crashed instance cannot wedge the room', async () => {
  const f = stubFetch(() => [{ result: 'OK' }])
  try {
    const unlock = await createRedisStore(cfg).lock(2500)
    assert.ok(unlock)
    const cmd = f.calls[0]![0] as (string | number)[]
    assert.ok(cmd.includes('NX'), 'lock must be conditional')
    assert.ok(cmd.includes('PX'), 'lock must self-expire')
    assert.ok(cmd.includes(2500))
  } finally {
    f.restore()
  }
})

test('lock fails OPEN on a transport error', async () => {
  // §5 posture applied to our own infrastructure: a store outage must degrade to
  // "proceed unlocked", never to "hang the edit".
  const f = stubFetch(() => new Error('timeout'))
  try {
    const unlock = await createRedisStore(cfg).lock(1000)
    assert.ok(unlock, 'a lock error must not block the request')
    await unlock()
  } finally {
    f.restore()
  }
})

test('releasing a lock deletes the key', async () => {
  const f = stubFetch((cmds) => (cmds[0]?.[0] === 'SET' ? [{ result: 'OK' }] : [{ result: 1 }]))
  try {
    const unlock = await createRedisStore(cfg).lock(1000)
    await unlock!()
    const last = f.calls[f.calls.length - 1]![0] as string[]
    assert.equal(last[0], 'DEL')
  } finally {
    f.restore()
  }
})

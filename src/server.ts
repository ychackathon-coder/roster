/**
 * One Node process: hook endpoints, MCP endpoint, and the board websocket (§12).
 *
 * Bound to 0.0.0.0. §12 calls cross-machine networking the #1 failure mode, and
 * the specific way it fails is a hub bound to localhost — which works perfectly
 * for whoever is hosting and is invisible to everyone else in the room. The LAN
 * addresses are printed on boot so Phase 0 has nothing to look up.
 */
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import express from 'express'
import { attachBoard } from './board.js'
import { config, hasModel } from './config.js'
import { loadContracts } from './contracts.js'
import { hooksRouter } from './hooks.js'
import { sweep } from './leases.js'
import { handleMcpRequest, rejectMcpMethod } from './mcp.js'
import { resetRuntime, seedTasks } from './seed.js'
import { notifyWaiters, parseProfile, scheduleSlow } from './slow.js'
import { mutate, read } from './state.js'

const app = express()

// Hook payloads are small; the generous limit is for tool_response bodies on
// PostToolUse, which can carry a lot of stdout.
app.use(express.json({ limit: '2mb' }))

// No auth (§12). Permissive CORS so the board can be served from Vite on
// another port, or another machine, without a proxy.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, mcp-protocol-version')
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.use(hooksRouter())

/* ---------------------------------- MCP ----------------------------------- */

app.post('/mcp', (req, res) => void handleMcpRequest(req, res))
app.get('/mcp', rejectMcpMethod)
app.delete('/mcp', rejectMcpMethod)

/* ------------------------------- onboarding -------------------------------- */

/**
 * §10 context pack. Deliberately a separate route with a separate owner, and the
 * acceptance test is that deleting it leaves the demo working — every profile
 * lookup falls back to a default.
 */
app.post('/onboard', (req, res) => {
  const { humanId, rawContext } = req.body as { humanId?: string; rawContext?: string }
  if (!humanId || !rawContext) {
    res.status(400).json({ error: 'humanId and rawContext are required' })
    return
  }
  // Parsing is a model call, so it must not block the response.
  scheduleSlow('profile', () => parseProfile(humanId, rawContext))
  res.status(202).json({ accepted: true, humanId })
})

app.post('/repo-context', (req, res) => {
  const { text } = req.body as { text?: string }
  mutate('repo-context', (s) => {
    s.repoContext = (text ?? '').slice(0, 8000)
  })
  res.status(200).json({ ok: true })
})

/* --------------------------------- board ---------------------------------- */

/** Board bootstrap for a fresh page load, before the websocket attaches. */
app.get('/state', (_req, res) => {
  res.status(200).json(read())
})

/** §15 risk 11: a 20-second reseed after a hub restart. */
app.post('/admin/reset', (_req, res) => {
  resetRuntime()
  seedTasks()
  res.status(200).json({ ok: true, rev: read().rev })
})

/* --------------------------------- boot ----------------------------------- */

const server = createServer(app)
attachBoard(server)

seedTasks()

const repoRoot = process.env.SB_REPO_ROOT ?? process.cwd()
try {
  // Inside mutate() so rev bumps once and the board receives the contracts.
  const count = mutate('contracts-loaded', (s) => loadContracts(s, repoRoot))
  console.log(`[hub] derived ${count} contracts from ${repoRoot}`)
} catch (err) {
  console.warn('[hub] contract derivation failed, continuing without:', (err as Error).message)
}

/** TTL expiry and stale-session detection. Never in the write path. */
setInterval(() => {
  const { woken, expired, gone } = mutate('sweep', (s) => sweep(s))
  if (expired || gone.length) {
    console.log(`[sweep] expired=${expired} gone=${gone.length}`)
  }
  if (woken.length) notifyWaiters(woken, ['a previously held path'])
}, config.sweepIntervalMs).unref()

const lanAddresses = (): string[] => {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address)
    }
  }
  return out
}

server.listen(config.port, config.host, () => {
  const addrs = lanAddresses()
  console.log('')
  console.log(`  Switchboard hub listening on ${config.host}:${config.port}`)
  console.log(`  model: ${hasModel() ? config.model : 'ABSENT — deterministic mode (fast path + contract drift only)'}`)
  console.log('')
  if (addrs.length) {
    console.log('  Share this with the room (§13 Phase 0):')
    for (const a of addrs) console.log(`    export SB_HUB=${a}`)
    console.log('')
    console.log(`  Verify from another laptop:  curl http://${addrs[0]}:${config.port}/health`)
  } else {
    console.log('  No LAN address found — on a hotspot? Check the network before Phase 1.')
  }
  console.log(`  Board websocket:  ws://${addrs[0] ?? 'localhost'}:${config.port}/board`)
  console.log(`  MCP endpoint:     http://${addrs[0] ?? 'localhost'}:${config.port}/mcp`)
  console.log('')
})

const shutdown = (signal: string): void => {
  console.log(`\n[hub] ${signal} — shutting down`)
  server.close(() => process.exit(0))
  // Don't hang on an open websocket.
  setTimeout(() => process.exit(0), 1000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

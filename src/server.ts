/**
 * Local hub entry point — one long-running Node process serving hooks, MCP, and
 * the board WebSocket (§12).
 *
 * This is the preferred way to run Switchboard: in-memory state, zero store
 * latency, a real WebSocket, and the §3 fast path comfortably inside its 50ms
 * budget. Use the Vercel deployment (api/index.ts) when a publicly reachable hub
 * matters more than latency.
 *
 * Bound to 0.0.0.0. §12 calls cross-machine networking the #1 failure mode, and
 * the specific way it fails is a hub bound to localhost — which works perfectly
 * for whoever is hosting and is invisible to everyone else in the room.
 */
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { createApp, bootstrap, maybeSweep } from './app.js'
import { attachBoard } from './board.js'
import { config, hasModel } from './config.js'
import { store } from './store.js'

const app = createApp()
const server = createServer(app)
attachBoard(server)
bootstrap()

/**
 * A real timer, since this process actually persists. The lazy per-request sweep
 * in app.ts still runs; this just means leases expire on schedule even when the
 * room goes quiet, which matters for the §13 Phase 4 TTL demonstration.
 */
setInterval(maybeSweep, config.sweepIntervalMs).unref()

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
  const host = addrs[0] ?? 'localhost'
  console.log('')
  console.log(`  Switchboard hub listening on ${config.host}:${config.port}`)
  console.log(`  store: ${store.kind}`)
  console.log(
    `  model: ${hasModel() ? config.model : 'ABSENT — deterministic mode (fast path + contract drift only)'}`,
  )
  console.log('')
  if (addrs.length) {
    console.log('  Share this with the room (§13 Phase 0):')
    for (const a of addrs) console.log(`    export SB_HUB=${a}`)
    console.log('')
    console.log(`  Verify from another laptop:  curl http://${addrs[0]}:${config.port}/health`)
  } else {
    console.log('  No LAN address found — on a hotspot? Check the network before Phase 1.')
  }
  console.log(`  Board websocket:  ws://${host}:${config.port}/board`)
  console.log(`  Board SSE:        http://${host}:${config.port}/board/sse`)
  console.log(`  MCP endpoint:     http://${host}:${config.port}/mcp`)
  console.log('')
})

const shutdown = (signal: string): void => {
  console.log(`\n[hub] ${signal} — shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

/**
 * Vercel serverless entry point.
 *
 * Every route is handled by this one function (see vercel.json), so the Express
 * app is reused verbatim and there is exactly one implementation of the hub.
 *
 * WHAT WORKS HERE: all hook endpoints, MCP, the notice budget, leases, TTL via
 * the lazy sweep, and L1 — provided a Redis store is configured. Without one,
 * leases cannot survive between invocations and store.ts logs a loud error.
 *
 * WHAT DOES NOT WORK HERE:
 *   - The board WebSocket. There is no process to hold a socket open. Use
 *     GET /state polling, or GET /board/sse and let EventSource reconnect.
 *   - Contract derivation from the demo repo. The hub cannot see anyone's
 *     filesystem, so POST the derived registry instead:
 *       npm run derive-contracts -- /path/to/demo-repo https://your-hub.vercel.app
 */
import { createApp, bootstrap } from '../src/app.js'

bootstrap()

export default createApp()

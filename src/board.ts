/**
 * Board websocket — the projector feed.
 *
 * Full-state broadcast on every rev change (§12). No deltas, no diffing: the
 * whole state object is small, the board is one useState, and a full replace
 * cannot drift out of sync at 1:55 with judges watching.
 *
 * The board OWNS presentation. This file sends state and nothing else — no
 * formatting decisions, so the UI workstream can change everything without
 * touching the hub.
 */
import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { read, subscribe } from './state.js'
import type { HubState } from './types.js'

const PATH = '/board'

/**
 * Coalesce bursts into one frame per tick. A single agent turn can produce a
 * dozen mutations; sending a dozen frames makes the board flicker and wastes the
 * projector's refresh on identical content.
 */
export const attachBoard = (server: Server): WebSocketServer => {
  const wss = new WebSocketServer({ server, path: PATH })
  const clients = new Set<WebSocket>()

  const send = (ws: WebSocket, state: Readonly<HubState>): void => {
    if (ws.readyState !== ws.OPEN) return
    try {
      ws.send(JSON.stringify({ type: 'state', state }))
    } catch (err) {
      console.warn('[board] send failed:', (err as Error).message)
    }
  }

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(`[board] client connected (${clients.size} total)`)
    send(ws, read())

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[board] client disconnected (${clients.size} remaining)`)
    })
    ws.on('error', (err) => {
      console.warn('[board] client error:', err.message)
      clients.delete(ws)
    })
  })

  let queued = false
  subscribe(() => {
    if (queued) return
    queued = true
    setImmediate(() => {
      queued = false
      const state = read()
      for (const ws of clients) send(ws, state)
    })
  })

  return wss
}

/**
 * The Express app, shared by both entry points:
 *   src/server.ts  — long-running local hub (adds the WebSocket board + listen)
 *   api/index.ts   — Vercel serverless function
 *
 * Everything serverless-specific lives here so neither entry point has to care.
 */
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import { config, hasModel } from './config.js'
import { loadContracts } from './contracts.js'
import { hooksRouter } from './hooks.js'
import { sweep } from './leases.js'
import { handleMcpRequest, rejectMcpMethod } from './mcp.js'
import { resetRuntime, seedTasks } from './seed.js'
import { notifyWaiters, parseProfile, scheduleSlow } from './slow.js'
import { mutate, read, replaceState, snapshot, subscribe } from './state.js'
import { store } from './store.js'

/* ------------------------------- lazy sweep -------------------------------- */

let lastSweep = 0

/**
 * TTL expiry and stale-session detection, driven by traffic rather than by a
 * timer.
 *
 * The original used setInterval, which does not exist between serverless
 * invocations — leases would never expire on Vercel. Sweeping on request keeps
 * one implementation working in both worlds. Throttled, because four agents in a
 * fast turn can produce a burst of requests and the sweep walks every lease.
 *
 * Consequence worth knowing: with zero traffic nothing expires. That is fine —
 * an expired lease only matters when somebody asks about a path, and asking is
 * traffic.
 */
export const maybeSweep = (): void => {
  const now = Date.now()
  if (now - lastSweep < config.sweepIntervalMs) return
  lastSweep = now
  const { woken, expired, gone } = mutate('sweep', (s) => sweep(s))
  if (expired || gone.length) console.log(`[sweep] expired=${expired} gone=${gone.length}`)
  if (woken.length) notifyWaiters(woken, ['a previously held path'])
}

/* ----------------------------- store middleware ---------------------------- */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Load-modify-save around each request when a shared store is configured.
 *
 * No-ops entirely in memory mode, so the local hub keeps §12's zero-latency
 * behavior and none of this code runs.
 *
 * THE res.json PATCH: persistence has to finish BEFORE the response is sent. A
 * serverless instance can be frozen the moment it responds, so saving in an
 * res.on('finish') handler loses writes non-deterministically — the worst
 * possible failure, because it works in testing and drops leases under load.
 * Intercepting res.json means the save is on the response's critical path, which
 * costs latency and is the correct trade.
 */
const storeMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (store.kind === 'memory') {
    maybeSweep()
    next()
    return
  }

  const mutating = MUTATING.has(req.method)
  // Short lock: long enough to cover a load-modify-save, short enough that a
  // crashed instance can't wedge the room. Fails open by design (see store.ts).
  const unlock = mutating ? await store.lock(2_500) : null

  try {
    const loaded = await store.load()
    if (loaded) replaceState(loaded)
  } catch (err) {
    console.warn('[app] hydrate failed, using local state:', (err as Error).message)
  }

  maybeSweep()

  const revBefore = read().rev
  const originalJson = res.json.bind(res)
  let settled = false

  const finish = async (body: unknown): Promise<void> => {
    if (settled) return
    settled = true
    try {
      if (read().rev !== revBefore) await store.save(snapshot())
    } catch (err) {
      console.warn('[app] persist failed:', (err as Error).message)
    } finally {
      if (unlock) await unlock()
    }
    originalJson(body)
  }

  res.json = ((body: unknown) => {
    void finish(body)
    return res
  }) as typeof res.json

  // Anything that ends the response without res.json (MCP streams its own
  // output, SSE never ends) still has to release the lock.
  res.on('close', () => {
    if (!settled) {
      settled = true
      void (async () => {
        try {
          if (read().rev !== revBefore) await store.save(snapshot())
        } catch {
          /* already logged */
        } finally {
          if (unlock) await unlock()
        }
      })()
    }
  })

  next()
}

/* --------------------------------- the app --------------------------------- */

export const createApp = (): Express => {
  const app = express()

  app.use(express.json({ limit: '2mb' }))

  // No auth (§12). Permissive CORS so a board served from anywhere can read.
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

  app.use((req, res, next) => void storeMiddleware(req, res, next))

  app.use(hooksRouter())

  app.post('/mcp', (req, res) => void handleMcpRequest(req, res))
  app.get('/mcp', rejectMcpMethod)
  app.delete('/mcp', rejectMcpMethod)

  /* ------------------------------ onboarding ------------------------------ */

  app.post('/onboard', (req, res) => {
    const { humanId, rawContext } = req.body as { humanId?: string; rawContext?: string }
    if (!humanId || !rawContext) {
      res.status(400).json({ error: 'humanId and rawContext are required' })
      return
    }
    scheduleSlow('profile', () => parseProfile(humanId, rawContext))
    res.status(202).json({ accepted: true, humanId })
  })

  /**
   * Accept a contract registry derived elsewhere.
   *
   * On a laptop hub, contracts are derived by scanning the demo repo at boot
   * (§8: derive, don't seed). A deployed hub has no access to anyone's
   * filesystem, so the derivation runs locally and is POSTed here:
   *
   *   npm run derive-contracts -- /path/to/demo-repo https://your-hub.vercel.app
   *
   * Without this, contract drift — §8 calls it "the most defensible thing you
   * build" — would simply never fire on a deployed hub.
   */
  app.post('/contracts', (req, res) => {
    const { contracts } = req.body as { contracts?: unknown }
    if (!Array.isArray(contracts)) {
      res.status(400).json({ error: 'expected { contracts: Contract[] }' })
      return
    }
    const accepted = mutate('contracts-posted', (s) => {
      let n = 0
      for (const raw of contracts) {
        const c = raw as { id?: string; name?: string; definedIn?: string; consumedBy?: unknown }
        if (!c?.id || !c.name || !c.definedIn) continue
        const existing = s.contracts[c.id]
        s.contracts[c.id] = {
          id: c.id,
          kind: (raw as { kind?: never }).kind ?? 'type',
          name: c.name,
          definedIn: c.definedIn,
          consumedBy: Array.isArray(c.consumedBy) ? (c.consumedBy as string[]) : [],
          // Preserve drift history across re-derivation.
          version: existing?.version ?? 1,
          lastChangedBy: existing?.lastChangedBy ?? null,
        }
        n += 1
      }
      return n
    })
    res.status(200).json({ ok: true, accepted })
  })

  app.post('/repo-context', (req, res) => {
    const { text } = req.body as { text?: string }
    mutate('repo-context', (s) => {
      s.repoContext = (text ?? '').slice(0, 8000)
    })
    res.status(200).json({ ok: true })
  })

  /* --------------------------------- board -------------------------------- */

  /** Board bootstrap, and the reliable feed on serverless. Poll this. */
  app.get('/state', (_req, res) => {
    res.status(200).json(read())
  })

  /**
   * Server-Sent Events board feed.
   *
   * Exists because WebSocket cannot work on serverless — there is no process to
   * hold the socket open. SSE is plain HTTP streaming and does work, but a
   * serverless function has a hard duration cap, so the stream WILL be cut and
   * the client must reconnect. EventSource does that automatically.
   *
   * On the local hub, prefer ws://…/board: it has none of these caveats.
   */
  app.get('/board/sse', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const send = (): void => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'state', state: read() })}\n\n`)
      } catch {
        /* client gone; cleanup runs on close */
      }
    }
    send()

    // In memory mode we get real change notifications. On a shared store there is
    // nothing to subscribe to across instances, so poll the store instead.
    const unsubscribe =
      store.kind === 'memory'
        ? subscribe(() => send())
        : (() => {
            const timer = setInterval(() => {
              void (async () => {
                const loaded = await store.load()
                if (loaded) replaceState(loaded)
                send()
              })()
            }, 1_000)
            return () => clearInterval(timer)
          })()

    // Comment frames keep proxies from closing an idle stream.
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        /* ignore */
      }
    }, 15_000)

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      res.end()
    })
  })

  /** §15 risk 11: a 20-second reseed after a restart. */
  app.post('/admin/reset', (_req, res) => {
    resetRuntime()
    seedTasks()
    res.status(200).json({ ok: true, rev: read().rev })
  })

  return app
}

/* ---------------------------------- boot ---------------------------------- */

let booted = false

/**
 * Idempotent one-time setup. On serverless this runs per cold start, which is why
 * seeding must be safe to repeat: seedTasks() overwrites task definitions but
 * hydration happens first, so live claim state from the store wins.
 */
export const bootstrap = (): void => {
  if (booted) return
  booted = true

  seedTasks()

  /**
   * Contract derivation needs filesystem access to the DEMO repo.
   *
   * On a deployed hub, cwd is the bundled function — scanning it would derive
   * contracts from Switchboard's own source, which is noise on the board and can
   * produce drift notices about files nobody in the room is editing. So it is
   * skipped unless SB_REPO_ROOT is set explicitly, and the registry arrives via
   * POST /contracts instead:
   *
   *   npm run derive-contracts -- /path/to/demo-repo https://your-hub.vercel.app
   */
  const explicitRoot = process.env.SB_REPO_ROOT
  const onVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true'
  const skipRequested = /^(1|true)$/i.test(process.env.SB_SKIP_DERIVE ?? '')
  if (!explicitRoot && (onVercel || skipRequested)) {
    console.log(
      '[hub] skipping contract derivation on a deployed hub — push the registry with:\n' +
        '      npm run derive-contracts -- /path/to/demo-repo <hub-url>',
    )
  } else {
    const repoRoot = explicitRoot ?? process.cwd()
    try {
      const count = mutate('contracts-loaded', (s) => loadContracts(s, repoRoot))
      console.log(`[hub] derived ${count} contracts from ${repoRoot}`)
    } catch (err) {
      console.warn('[hub] contract derivation failed, continuing without:', (err as Error).message)
    }
  }

  console.log(`[hub] store=${store.kind} model=${hasModel() ? config.model : 'absent'}`)
}

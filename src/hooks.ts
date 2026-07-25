/**
 * Hook endpoints — §4. Every agent event in the room arrives here.
 *
 * THREE PLATFORM FACTS THAT SHAPE THIS FILE:
 *
 * 1. HTTP hooks cannot block via status code. A denial requires 200 with the
 *    decision in the JSON body. Non-2xx, timeout, and connection failure are all
 *    non-blocking and the edit proceeds. So: every handler returns 200, always,
 *    even on internal error. A 500 here is a silently-granted lease.
 *
 * 2. The fast path has a 50ms budget (§3). No model call, no disk, no awaits.
 *    Judgment is scheduled onto the slow path and delivered on the NEXT hook.
 *
 * 3. SessionStart does not accept type:"http" — registration arrives from
 *    register.sh as a plain POST (§4.1).
 */
import { Router, type Request, type Response } from 'express'
import { contextResponse, formatVersion, preToolUseResponse, versionsDiverge } from './compat.js'
import { config } from './config.js'
import {
  evaluateEdit,
  findOwnLease,
  releaseSessionLeases,
  releaseLease,
  heldLeases,
  unassignedOpenTasks,
} from './leases.js'
import { drainForSession, needsCompaction, queueNotice } from './notices.js'
import { relativize } from './overlap.js'
import {
  notifyWaiters,
  runAdjudication,
  runCompaction,
  runContractDrift,
  runSemanticConflictPass,
  scheduleSlow,
} from './slow.js'
import { logActivity, mutate, read } from './state.js'
import { sessionStartContext } from './strings.js'
import type { Session } from './types.js'

/**
 * §3 step 5 returns "defer" for coupled work. NOTE: Claude Code's
 * permissionDecision enum accepts "allow" | "deny" | "ask" — "defer" is not a
 * platform value, so emitting it literally risks an unparseable hook response,
 * which fails OPEN and grants the edit.
 *
 * We express defer as a "deny" carrying a sequencing reason instead. The product
 * behavior §8 asks for is preserved exactly: the edit is refused now, the
 * dependency is recorded as a 'deferred' lease, and a notice carrying the new
 * shape is pushed when the blocker releases. Only the wire value differs.
 *
 * "ask" was the other candidate and is worse here: agents run with
 * --dangerously-skip-permissions for demo speed, so "ask" resolves
 * unpredictably, and a prompt to a human mid-demo is exactly what §6.1 is
 * trying to prevent.
 */
const DEFER_WIRE_DECISION = 'deny' as const

const PALETTE = ['#4ea1ff', '#ff7a59', '#39d98a', '#c084fc', '#ffd166', '#00d1d1'] as const

const pickColor = (taken: readonly string[]): string =>
  PALETTE.find((c) => !taken.includes(c)) ?? PALETTE[taken.length % PALETTE.length]!

/** Body fields Claude Code sends. Everything optional — never trust the shape. */
type HookBody = {
  session_id?: string
  cwd?: string
  hook_event_name?: string
  tool_name?: string
  tool_input?: { file_path?: string; command?: string; [k: string]: unknown }
  tool_response?: { stdout?: string; stderr?: string; exit_code?: number; [k: string]: unknown }
  prompt?: string
  // From register.sh, which POSTs these directly.
  machine?: string
  human?: string
  claude_version?: string
}

const sessionIdOf = (b: HookBody): string => (typeof b.session_id === 'string' ? b.session_id : '')
const filePathOf = (b: HookBody): string =>
  typeof b.tool_input?.file_path === 'string' ? b.tool_input.file_path : ''

/**
 * The session's project root. Every hook payload carries it, and it is what
 * turns a machine-specific absolute path into a repo-relative one — without it,
 * two people on different laptops never collide. See relativize() in overlap.ts.
 */
const cwdOf = (b: HookBody): string | undefined =>
  typeof b.cwd === 'string' && b.cwd ? b.cwd : undefined

/**
 * Attach pending notices within the §6.2 budget. Returns undefined when there is
 * nothing to say, so we never ship an empty additionalContext field.
 */
const contextFor = (sessionId: string): string | undefined => {
  if (!sessionId) return undefined
  const { context } = mutate('drain-notices', (s) => drainForSession(s, sessionId))
  return context || undefined
}

/** Schedule compaction if this session's queue has grown past the threshold. */
const maybeCompact = (sessionId: string): void => {
  if (sessionId && needsCompaction(read(), sessionId)) {
    scheduleSlow('compaction', () => runCompaction(sessionId))
  }
}

export const hooksRouter = (): Router => {
  const router = Router()

  /* ------------------------------ registration ---------------------------- */

  /**
   * From register.sh (§4.1). Returns additionalContext, which SessionStart adds
   * to the agent's context — so a session opens already knowing the board.
   */
  router.post('/hooks/session-start', (req: Request, res: Response) => {
    const body = req.body as HookBody
    const sid = sessionIdOf(body)
    if (!sid) {
      res.status(200).json({})
      return
    }

    const humanName = (body.human || 'unknown').trim()
    const machine = (body.machine || 'unknown').trim()

    const ctx = mutate('session-start', (s) => {
      const existing = s.sessions[sid]
      const session: Session = existing ?? {
        id: sid,
        humanId: humanName.toLowerCase(),
        humanName,
        machine,
        agentKind: 'claude-code',
        status: 'active',
        lastSeen: Date.now(),
        lastPrompt: '',
        currentTaskId: null,
        color: pickColor(Object.values(s.sessions).map((x) => x.color)),
      }
      session.status = 'active'
      session.lastSeen = Date.now()
      session.machine = machine
      session.humanName = humanName
      session.claudeVersion = formatVersion(body.claude_version)
      s.sessions[sid] = session

      // Mixed versions are allowed. Surfaced as an observation on the board
      // rather than the Phase 0 gate §4 asked for, so nobody is blocked for
      // being a build behind.
      const versions = Object.values(s.sessions)
        .filter((x) => x.status !== 'gone' && x.claudeVersion)
        .map((x) => x.claudeVersion!)
      s.hubHealth.versionSpread = versionsDiverge(versions)
        ? [...new Set(versions)].sort().join(', ')
        : undefined

      if (!existing) {
        logActivity(
          s,
          `${humanName} joined from ${machine} (claude ${session.claudeVersion})`,
          'info',
          sid,
        )
      }

      return sessionStartContext({
        humanName,
        machine,
        openTasks: Object.values(s.tasks)
          .filter((t) => t.status === 'open' && !t.claimedBy)
          .map((t) => ({ id: t.id, title: t.title })),
        activeSessions: Object.values(s.sessions)
          .filter((x) => x.id !== sid && x.status !== 'gone')
          .map((x) => ({ humanName: x.humanName, machine: x.machine, intent: x.lastPrompt })),
      })
    })

    res.status(200).json({ additionalContext: ctx })
  })

  /* ------------------------------- fast path ------------------------------ */

  /**
   * PreToolUse on Edit|Write|MultiEdit|NotebookEdit. The whole product, in one
   * handler, under 50ms.
   */
  router.post('/hooks/pre-edit', (req: Request, res: Response) => {
    const started = process.hrtime.bigint()
    const body = req.body as HookBody
    const sid = sessionIdOf(body)
    const path = filePathOf(body)

    try {
      // No path to reason about (some tools carry none) — stay out of the way.
      if (!sid || !path) {
        res.status(200).json({})
        return
      }

      const decision = mutate('pre-edit', (s) =>
        evaluateEdit(s, { sessionId: sid, path, cwd: cwdOf(body) }),
      )
      const additionalContext = contextFor(sid)

      if (decision.kind === 'allow') {
        res.status(200).json(
          preToolUseResponse({
            decision: 'allow',
            ...(additionalContext ? { additionalContext } : {}),
          }),
        )

        // Slow path: a newly created lease may have changed a contract.
        if (decision.created && decision.leaseId) {
          scheduleSlow('contract-drift', async () => runContractDrift(decision.leaseId))
        }
        maybeCompact(sid)
        return
      }

      const wire = decision.kind === 'defer' ? DEFER_WIRE_DECISION : 'deny'
      res.status(200).json(
        preToolUseResponse({
          decision: wire,
          reason: decision.reason,
          ...(additionalContext ? { additionalContext } : {}),
        }),
      )

      // Record the refusal for the board's flash zone, then adjudicate async.
      mutate('queue-denial-notice', (s) => {
        queueNotice(s, {
          toSessionId: sid,
          kind: decision.kind === 'defer' ? 'sequencing' : 'overlap_denied',
          severity: 'block',
          message: decision.reason,
          relatedSessionId: decision.blockingLease.sessionId,
        })
        // Delivered inline in this very response — don't re-send it next hook.
        const last = s.notices[s.notices.length - 1]
        if (last) last.delivered = true
      })

      if (decision.kind === 'deny') {
        scheduleSlow('adjudication', () =>
          runAdjudication({
            deniedSessionId: sid,
            blockingLease: decision.blockingLease,
            path,
          }),
        )
      }
    } catch (err) {
      // A crash here must not deny an edit, and must not 500 — a 500 fails open
      // anyway, so we'd lose the error AND the enforcement.
      console.error('[pre-edit] failed open:', err)
      res.status(200).json({})
    } finally {
      const ms = Number(process.hrtime.bigint() - started) / 1e6
      if (ms > 50) {
        console.warn(`[pre-edit] ${ms.toFixed(1)}ms — over the 50ms fast-path budget`)
      }
    }
  })

  /* ------------------------------- post-edit ------------------------------ */

  router.post('/hooks/post-edit', (req: Request, res: Response) => {
    const body = req.body as HookBody
    const sid = sessionIdOf(body)
    const path = filePathOf(body)
    try {
      if (sid && path) {
        mutate('post-edit', (s) => {
          const session = s.sessions[sid]
          if (session) {
            session.lastSeen = Date.now()
            session.status = 'active'
          }
          const own = findOwnLease(s, relativize(path, cwdOf(body)), sid)
          if (own) own.editCount += 1
        })
      }
      res.status(200).json(contextResponse('PostToolUse', contextFor(sid)))
      maybeCompact(sid)
    } catch (err) {
      console.error('[post-edit] failed open:', err)
      res.status(200).json({})
    }
  })

  /* ------------------------------- post-bash ------------------------------ */

  /**
   * §3 slow path, integration signal: build and test exit codes correlate to
   * recently active leases. Drives the board's build status.
   */
  router.post('/hooks/post-bash', (req: Request, res: Response) => {
    const body = req.body as HookBody
    const sid = sessionIdOf(body)
    try {
      const command = typeof body.tool_input?.command === 'string' ? body.tool_input.command : ''
      const exit = typeof body.tool_response?.exit_code === 'number' ? body.tool_response.exit_code : null
      const isBuildish = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|test|typecheck|tsc|vitest|jest)\b|\btsc\b/.test(command)

      if (isBuildish && exit !== null) {
        mutate('post-bash', (s) => {
          s.buildStatus = exit === 0 ? 'passing' : 'failing'
          const who = s.sessions[sid]?.humanName ?? 'a session'
          logActivity(
            s,
            `${exit === 0 ? 'build passing' : `build FAILING (exit ${exit})`} — after ${who}'s changes`,
            exit === 0 ? 'info' : 'block',
            sid,
          )
          if (exit !== 0) {
            // Correlate the failure to whoever holds leases right now. Factual
            // only — no accusation, no instruction.
            const holders = heldLeases(s)
              .filter((l) => l.sessionId !== sid)
              .map((l) => s.sessions[l.sessionId]?.humanName)
              .filter((n): n is string => Boolean(n))
            if (holders.length) {
              queueNotice(s, {
                toSessionId: sid,
                kind: 'info',
                severity: 'info',
                message: `Switchboard: the last build exited ${exit}. Sessions holding scopes at that moment: ${[...new Set(holders)].join(', ')}.`,
              })
            }
          }
        })
      }
      res.status(200).json(contextResponse('PostToolUse', contextFor(sid)))
    } catch (err) {
      console.error('[post-bash] failed open:', err)
      res.status(200).json({})
    }
  })

  /* --------------------------------- prompt ------------------------------- */

  /**
   * UserPromptSubmit — where intent comes from. §7's ScopeLease.intent is
   * populated from here, and the semantic-conflict pass is only as good as this
   * field.
   */
  router.post('/hooks/prompt', (req: Request, res: Response) => {
    const body = req.body as HookBody
    const sid = sessionIdOf(body)
    try {
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      if (sid && prompt) {
        mutate('prompt', (s) => {
          const session = s.sessions[sid]
          if (!session) return
          session.lastPrompt = prompt.slice(0, 500)
          session.lastSeen = Date.now()
          session.status = 'active'
          // Backfill intent on leases this session already holds, so the board
          // and any denial string show what they're actually doing.
          for (const lease of heldLeases(s)) {
            if (lease.sessionId === sid && !lease.intent) lease.intent = session.lastPrompt
          }
          logActivity(s, `${session.humanName}: "${session.lastPrompt.slice(0, 80)}"`, 'info', sid)
        })
      }
      res.status(200).json(contextResponse('UserPromptSubmit', contextFor(sid)))
      maybeCompact(sid)
    } catch (err) {
      console.error('[prompt] failed open:', err)
      res.status(200).json({})
    }
  })

  /* -------------------------------- turn end ------------------------------ */

  /** Stop — triggers the §8 Tier 3 semantic pass. Cached by intent hash. */
  router.post('/hooks/turn-end', (req: Request, res: Response) => {
    const body = req.body as HookBody
    const sid = sessionIdOf(body)
    try {
      if (sid) {
        mutate('turn-end', (s) => {
          const session = s.sessions[sid]
          if (session) {
            session.lastSeen = Date.now()
            session.status = 'idle'
          }
        })
      }
      res.status(200).json(contextResponse('Stop', contextFor(sid)))
      scheduleSlow('semantic', runSemanticConflictPass)
    } catch (err) {
      console.error('[turn-end] failed open:', err)
      res.status(200).json({})
    }
  })

  /* ------------------------------ session end ----------------------------- */

  router.post('/hooks/session-end', (req: Request, res: Response) => {
    const body = req.body as HookBody
    const sid = sessionIdOf(body)
    try {
      if (sid) {
        const { woken, paths } = mutate('session-end', (s) => {
          const session = s.sessions[sid]
          const releasedPaths = heldLeases(s)
            .filter((l) => l.sessionId === sid)
            .flatMap((l) => l.paths)
          const wokenIds = releaseSessionLeases(s, sid)
          if (session) {
            session.status = 'gone'
            logActivity(s, `${session.humanName}'s session ended — scopes freed`, 'warn', sid)
          }
          return { woken: wokenIds, paths: releasedPaths }
        })
        if (woken.length) notifyWaiters(woken, paths)
      }
      res.status(200).json({})
    } catch (err) {
      console.error('[session-end] failed open:', err)
      res.status(200).json({})
    }
  })

  /* ------------------------- L1 cache + release API ----------------------- */

  /**
   * §5 L1: fallback-check.sh and refresh-cache.sh read this. fetchedAt is what
   * lets the shell hook decide the cache is too stale to trust.
   */
  router.get('/leases/snapshot', (_req: Request, res: Response) => {
    const s = read()
    res.status(200).json({
      fetchedAt: Math.floor(Date.now() / 1000),
      rev: s.rev,
      leases: heldLeases(s).map((l) => ({
        sessionId: l.sessionId,
        humanName: s.sessions[l.sessionId]?.humanName ?? 'another session',
        paths: l.paths,
        status: l.status,
        expiresAt: l.expiresAt,
      })),
    })
  })

  /** Explicit early release — backs hub_release_scope over MCP. */
  router.post('/leases/:id/release', (req: Request, res: Response) => {
    // Express 5 types a route param as string | string[]; normalize before use.
    const raw = req.params.id
    const id = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
    const { woken, paths } = mutate('release', (s) => {
      const lease = s.leases[id]
      const releasedPaths = lease ? [...lease.paths] : []
      return { woken: releaseLease(s, id), paths: releasedPaths }
    })
    if (woken.length) notifyWaiters(woken, paths)
    res.status(200).json({ released: true, woken })
  })

  /* --------------------------------- health ------------------------------- */

  router.get('/health', (_req: Request, res: Response) => {
    const s = read()
    res.status(200).json({
      ok: true,
      rev: s.rev,
      sessions: Object.values(s.sessions).filter((x) => x.status !== 'gone').length,
      heldLeases: heldLeases(s).length,
      openTasks: unassignedOpenTasks(s).length,
      buildStatus: s.buildStatus,
      model: config.anthropicApiKey ? 'available' : 'absent (deterministic mode)',
    })
  })

  return router
}

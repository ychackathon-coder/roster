/**
 * MCP surface — §9.
 *
 * Remote MCP over Streamable HTTP, because stdio cannot reach another machine
 * and every session in this room is on a different laptop.
 *
 * TWO JOBS:
 *   1. Voluntary agent queries — the pull channel.
 *   2. The notice overflow channel for §6.2 — hub_get_notices is the only
 *      load-bearing tool here, because it's the pressure valve for the platform's
 *      10,000-character cap on pushed context.
 *
 * Hooks push and are budget-constrained; MCP pulls and is not. Pushing a pointer
 * and letting the agent pull detail is how the two surfaces are meant to divide
 * labor — not a workaround.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { heldLeases, releaseLease, unassignedOpenTasks } from './leases.js'
import { pendingFor, queueNotice } from './notices.js'
import { notifyWaiters } from './slow.js'
import { logActivity, mutate, read } from './state.js'
import { noLeaseMessage } from './strings.js'

const ok = (text: string, structured: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text }],
  structuredContent: structured,
})

const buildServer = (): McpServer => {
  const server = new McpServer({ name: 'switchboard', version: '0.1.0' })

  /* ------------------------- the load-bearing one ------------------------- */

  server.registerTool(
    'hub_get_notices',
    {
      title: 'Get pending Switchboard notices',
      description:
        'Full detail for coordination notices that did not fit in the pushed context budget. Call this when a hook mentions additional notices pending.',
      inputSchema: { session_id: z.string().describe('This session\'s id') },
      outputSchema: {
        count: z.number(),
        notices: z.array(
          z.object({
            kind: z.string(),
            severity: z.string(),
            message: z.string(),
            at: z.number(),
          }),
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ session_id }) => {
      // Reading marks delivered — an agent that pulled the detail has it.
      const notices = mutate('mcp-get-notices', (s) => {
        const pending = pendingFor(s, session_id)
        for (const n of pending) n.delivered = true
        return pending.map((n) => ({
          kind: n.kind,
          severity: n.severity,
          message: n.message,
          at: n.at,
        }))
      })
      const text = notices.length
        ? notices.map((n) => n.message).join('\n\n')
        : 'Switchboard: no pending notices for this session.'
      return ok(text, { count: notices.length, notices })
    },
  )

  /* ------------------------------ board state ----------------------------- */

  server.registerTool(
    'hub_get_board',
    {
      title: 'Get the Switchboard board',
      description:
        'Open tasks, active sessions with machine and recorded intent, and currently held scopes.',
      inputSchema: {},
      outputSchema: {
        buildStatus: z.string(),
        openTasks: z.array(z.object({ id: z.string(), title: z.string(), area: z.string() })),
        sessions: z.array(
          z.object({
            humanName: z.string(),
            machine: z.string(),
            intent: z.string(),
            status: z.string(),
          }),
        ),
        heldScopes: z.array(z.object({ humanName: z.string(), paths: z.array(z.string()) })),
      },
      annotations: { readOnlyHint: true },
    },
    async () => {
      const s = read()
      const openTasks = Object.values(s.tasks)
        .filter((t) => t.status === 'open' && !t.claimedBy)
        .map((t) => ({ id: t.id, title: t.title, area: t.area }))
      const sessions = Object.values(s.sessions)
        .filter((x) => x.status !== 'gone')
        .map((x) => ({
          humanName: x.humanName,
          machine: x.machine,
          intent: x.lastPrompt,
          status: x.status,
        }))
      const heldScopes = heldLeases(s).map((l) => ({
        humanName: s.sessions[l.sessionId]?.humanName ?? 'another session',
        paths: l.paths,
      }))

      const lines = [
        `Build status: ${s.buildStatus}.`,
        sessions.length
          ? `Active sessions: ${sessions.map((x) => `${x.humanName} on ${x.machine}${x.intent ? ` ("${x.intent}")` : ''}`).join('; ')}.`
          : 'No active sessions.',
        heldScopes.length
          ? `Held scopes: ${heldScopes.map((h) => `${h.humanName} holds ${h.paths.join(', ')}`).join('; ')}.`
          : 'No scopes are held.',
        openTasks.length
          ? `Open tasks: ${openTasks.map((t) => `${t.id} ${t.title}`).join('; ')}.`
          : 'No open tasks.',
      ]
      return ok(lines.join('\n'), { buildStatus: s.buildStatus, openTasks, sessions, heldScopes })
    },
  )

  /* ------------------------------ claim a task ---------------------------- */

  server.registerTool(
    'hub_claim_task',
    {
      title: 'Claim a task',
      description: 'Take an open task and receive its suggested paths.',
      inputSchema: {
        session_id: z.string(),
        task_id: z.string().describe('e.g. T-07'),
      },
      outputSchema: {
        claimed: z.boolean(),
        suggestedPaths: z.array(z.string()),
        blockedBy: z.array(z.string()),
        message: z.string(),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, task_id }) => {
      const result = mutate('mcp-claim-task', (s) => {
        const task = s.tasks[task_id]
        const session = s.sessions[session_id]
        if (!task) {
          return { claimed: false, suggestedPaths: [], blockedBy: [], message: `Switchboard: no task ${task_id} exists.` }
        }
        if (task.claimedBy && task.claimedBy !== session_id) {
          const holder = s.sessions[task.claimedBy]?.humanName ?? 'another session'
          return {
            claimed: false,
            suggestedPaths: [],
            blockedBy: [],
            message: `Switchboard: ${task_id} is claimed by ${holder}.`,
          }
        }

        // Unmet dependencies are reported as fact, not refused outright — §8's
        // sequencing story is about ordering, not gatekeeping.
        const blockedBy = task.dependsOn.filter((dep) => s.tasks[dep]?.status !== 'done')

        task.claimedBy = session_id
        task.status = 'in_progress'
        if (session) session.currentTaskId = task.id
        logActivity(s, `${session?.humanName ?? 'a session'} claimed ${task.id} ${task.title}`, 'info', session_id)

        const parts = [`Switchboard: ${task_id} "${task.title}" is now claimed by this session.`]
        if (task.suggestedPaths.length) parts.push(`Suggested paths: ${task.suggestedPaths.join(', ')}.`)
        if (blockedBy.length) {
          parts.push(
            `${blockedBy.join(', ')} ${blockedBy.length === 1 ? 'is' : 'are'} not done yet and ${task_id} depends on ${blockedBy.length === 1 ? 'it' : 'them'}.`,
          )
        }
        return {
          claimed: true,
          suggestedPaths: task.suggestedPaths,
          blockedBy,
          message: parts.join(' '),
        }
      })
      return ok(result.message, result)
    },
  )

  /* ------------------------------- contracts ------------------------------ */

  server.registerTool(
    'hub_get_contract',
    {
      title: 'Get a contract',
      description:
        'Current shape, version, and consumers of a derived contract — an HTTP route, exported type, component prop, or env var.',
      inputSchema: { name: z.string().describe('e.g. "POST /api/cart/items" or "CartItem"') },
      outputSchema: {
        found: z.boolean(),
        name: z.string(),
        kind: z.string(),
        definedIn: z.string(),
        consumedBy: z.array(z.string()),
        version: z.number(),
        message: z.string(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      const s = read()
      const needle = name.trim().toLowerCase()
      const contract =
        Object.values(s.contracts).find((c) => c.name.toLowerCase() === needle) ??
        Object.values(s.contracts).find((c) => c.name.toLowerCase().includes(needle))

      if (!contract) {
        const msg = `Switchboard: no contract named ${name} is registered.`
        return ok(msg, {
          found: false, name, kind: '', definedIn: '', consumedBy: [], version: 0, message: msg,
        })
      }
      const changedBy = contract.lastChangedBy ? s.sessions[contract.lastChangedBy]?.humanName : null
      const msg = [
        `Switchboard: ${contract.name} is defined in ${contract.definedIn} at version ${contract.version}.`,
        contract.consumedBy.length ? `Consumed by ${contract.consumedBy.join(', ')}.` : 'No consumers are registered.',
        changedBy ? `Last changed by ${changedBy}'s session.` : '',
      ]
        .filter(Boolean)
        .join(' ')
      return ok(msg, {
        found: true,
        name: contract.name,
        kind: contract.kind,
        definedIn: contract.definedIn,
        consumedBy: contract.consumedBy,
        version: contract.version,
        message: msg,
      })
    },
  )

  /* ------------------------------- send note ------------------------------ */

  server.registerTool(
    'hub_send_note',
    {
      title: 'Send a note',
      description:
        'Send a factual note to another teammate\'s session, or to every active session when no target is given.',
      inputSchema: {
        session_id: z.string().describe('The sending session'),
        message: z.string(),
        to_human: z.string().optional().describe('Target teammate name; omit to reach the room'),
      },
      outputSchema: { sent: z.number(), message: z.string() },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, message, to_human }) => {
      const sent = mutate('mcp-send-note', (s) => {
        const from = s.sessions[session_id]?.humanName ?? 'another session'
        const targets = Object.values(s.sessions).filter(
          (x) =>
            x.id !== session_id &&
            x.status !== 'gone' &&
            (!to_human || x.humanName.toLowerCase() === to_human.toLowerCase()),
        )
        for (const t of targets) {
          queueNotice(s, {
            toSessionId: t.id,
            kind: 'info',
            severity: 'info',
            message: `Switchboard: ${from}'s session sent a note. "${message}"`,
            relatedSessionId: session_id,
          })
        }
        if (targets.length) logActivity(s, `${from} noted: "${message.slice(0, 60)}"`, 'info', session_id)
        return targets.length
      })
      const text = sent
        ? `Switchboard: the note reached ${sent} session${sent === 1 ? '' : 's'}.`
        : 'Switchboard: no matching active session received the note.'
      return ok(text, { sent, message: text })
    },
  )

  /* ----------------------------- release scope ---------------------------- */

  server.registerTool(
    'hub_release_scope',
    {
      title: 'Release a held scope',
      description:
        'Release this session\'s lease on a path early rather than waiting for the TTL to expire.',
      inputSchema: { session_id: z.string(), path: z.string() },
      outputSchema: { released: z.boolean(), message: z.string() },
      annotations: { readOnlyHint: false },
    },
    async ({ session_id, path }) => {
      const result = mutate('mcp-release', (s) => {
        const lease = heldLeases(s).find(
          (l) => l.sessionId === session_id && l.paths.some((p) => p === path || path.endsWith(`/${p}`) || p.endsWith(path)),
        )
        if (!lease) return { released: false, woken: [] as string[], paths: [] as string[] }
        const paths = [...lease.paths]
        const woken = releaseLease(s, lease.id)
        logActivity(s, `${s.sessions[session_id]?.humanName ?? 'a session'} released ${paths.join(', ')}`, 'info', session_id)
        return { released: true, woken, paths }
      })

      if (result.released && result.woken.length) notifyWaiters(result.woken, result.paths)
      const text = result.released
        ? `Switchboard: the lease on ${result.paths.join(', ')} is released.`
        : noLeaseMessage(path)
      return ok(text, { released: result.released, message: text })
    },
  )

  return server
}

/**
 * Stateless request handling: a fresh server and transport per request, so there
 * is no session state to lose when a laptop sleeps or a hub restarts. §12 keeps
 * everything in memory anyway.
 */
export const handleMcpRequest = async (req: Request, res: Response): Promise<void> => {
  const server = buildServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  res.on('close', () => {
    void transport.close()
    void server.close()
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    console.error('[mcp] request failed:', err)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: null,
      })
    }
  }
}

/** GET and DELETE on /mcp are not supported in stateless mode. */
export const rejectMcpMethod = (_req: Request, res: Response): void => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Switchboard MCP is stateless; use POST.' },
    id: null,
  })
}

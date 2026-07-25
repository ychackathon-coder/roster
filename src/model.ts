/**
 * The one model call, wrapped.
 *
 * Everything here runs on the SLOW PATH only — §3 is explicit that a model call
 * inside a blocking hook costs 2-5 seconds per edit across four agents and makes
 * the demo unwatchable. Nothing in this file may be awaited from the fast path.
 *
 * Degradation is the design, not a fallback: with no API key, every function
 * returns null and callers fall back to deterministic behavior. §10's acceptance
 * test generalizes — the demo runs with no key at all.
 */
import Anthropic from '@anthropic-ai/sdk'
import { config, hasModel } from './config.js'

let client: Anthropic | null = null
const clientOrNull = (): Anthropic | null => {
  if (!hasModel()) return null
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey! })
  return client
}

/** Cache keyed by caller-supplied hash — §8 Tier 3 caches by intent-set hash. */
const cache = new Map<string, string>()

export type AskOptions = {
  /** Cache key. Identical keys skip the call entirely. */
  cacheKey?: string
  system?: string
  maxTokens?: number
  /** Hard ceiling; the slow path is async but must not hang forever. */
  timeoutMs?: number
}

/**
 * Returns model text, or null on any failure — no key, timeout, rate limit,
 * malformed response. Callers MUST treat null as "no judgment available" and
 * proceed deterministically.
 */
export const ask = async (prompt: string, opts: AskOptions = {}): Promise<string | null> => {
  const key = opts.cacheKey
  if (key && cache.has(key)) return cache.get(key)!

  const c = clientOrNull()
  if (!c) return null

  const started = Date.now()
  try {
    const res = await c.messages.create(
      {
        model: config.model,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: opts.timeoutMs ?? 20_000 },
    )
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    if (!text) return null
    if (key) cache.set(key, text)
    return text
  } catch (err) {
    console.warn(`[model] call failed after ${Date.now() - started}ms, degrading:`, (err as Error).message)
    return null
  }
}

/**
 * Ask for JSON and parse it. Returns null rather than throwing, and tolerates
 * the model wrapping output in a fenced block.
 */
export const askJson = async <T>(prompt: string, opts: AskOptions = {}): Promise<T | null> => {
  const text = await ask(prompt, opts)
  if (!text) return null
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Last resort: the first balanced object in the response.
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T
      } catch {
        /* fall through */
      }
    }
    console.warn('[model] response was not JSON, degrading')
    return null
  }
}

export const modelAvailable = hasModel

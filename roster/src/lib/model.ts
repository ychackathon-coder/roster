/**
 * The model call for HQ decisions, wrapped.
 *
 * PROVIDER: defaults to the same NVIDIA NIM setup profile.ts already uses, so no
 * teammate has to add a key that isn't already in .env.local. Person D noted HQ
 * is free to use any model; override with HQ_API_KEY / HQ_BASE_URL / HQ_MODEL to
 * point at anything OpenAI-compatible without touching this file.
 *
 * DEGRADATION IS THE DESIGN, not a fallback. Every function returns null on any
 * failure — missing key, timeout, rate limit, malformed JSON — and the caller
 * falls back to a deterministic decision. The demo must run with no key at all,
 * which is also what makes it testable offline.
 */
import OpenAI from "openai";

export type ModelConfig = { apiKey: string; baseURL: string; model: string };

export function modelConfig(): ModelConfig | null {
  const apiKey = process.env.HQ_API_KEY || process.env.NVIDIA_API_KEY || "";
  if (!apiKey) return null;
  return {
    apiKey,
    baseURL:
      process.env.HQ_BASE_URL ||
      process.env.NVIDIA_BASE_URL ||
      "https://integrate.api.nvidia.com/v1",
    model:
      process.env.HQ_MODEL ||
      process.env.NVIDIA_MODEL ||
      "meta/llama-3.3-70b-instruct",
  };
}

export function modelAvailable(): boolean {
  return modelConfig() !== null && modelEnabled();
}

/**
 * Per-call timeout. Deliberately short.
 *
 * MEASURED, 2026-07-24: a 2-token completion against NVIDIA NIM from this
 * network took 16s / 45s (timed out) / 16.9s on three consecutive attempts,
 * while NVIDIA's own `e2e_latency_seconds` reported 0.09s. The delay is network
 * path, not inference.
 *
 * So the right behavior is to give up FAST and let the deterministic floor
 * answer: a 20ms response that cites a real commit message beats a 20-second one
 * that says the same thing. Raise HQ_TIMEOUT_MS if the venue network is better.
 */
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.HQ_TIMEOUT_MS ?? "", 10) || 8_000;

/** Set HQ_MODEL_ENABLED=false to skip the model entirely and always use the floor. */
export function modelEnabled(): boolean {
  return !/^(0|false|no)$/i.test(process.env.HQ_MODEL_ENABLED ?? "");
}

let client: OpenAI | null = null;
let clientKey = "";

function getClient(cfg: ModelConfig): OpenAI {
  const key = `${cfg.apiKey}|${cfg.baseURL}`;
  if (!client || clientKey !== key) {
    client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      /**
       * ZERO RETRIES — this is load-bearing.
       *
       * The SDK defaults to maxRetries: 2, so every timeout silently becomes
       * three attempts. With an 8s timeout that is 24s per call, and HQ makes up
       * to two calls: a 48s request behind a 30s route budget. Observed in the
       * wild as "call failed after 37277ms" for a 12s timeout.
       *
       * HQ has its own retry logic that knows WHY a call failed, which is
       * strictly better than blind retries at the transport layer.
       */
      maxRetries: 0,
    });
    clientKey = key;
  }
  return client;
}

export type AskFailure = "no_model" | "timeout" | "transport" | "empty";

/** Why the last ask() returned null. Lets callers skip a pointless retry. */
export let lastFailure: AskFailure | null = null;

export type AskOptions = {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** HQ sits in a user-facing request path, so this is deliberately short. */
  timeoutMs?: number;
};

/** Raw completion text, or null on any failure. Never throws. */
export async function ask(
  prompt: string,
  opts: AskOptions = {},
): Promise<string | null> {
  lastFailure = null;

  const cfg = modelConfig();
  if (!cfg || !modelEnabled()) {
    lastFailure = "no_model";
    return null;
  }

  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  try {
    const completion = await getClient(cfg).chat.completions.create(
      {
        model: cfg.model,
        messages: [
          ...(opts.system
            ? [{ role: "system" as const, content: opts.system }]
            : []),
          { role: "user" as const, content: prompt },
        ],
        // Low temperature: HQ output is quoted on stage and must not wander.
        temperature: opts.temperature ?? 0.2,
        top_p: 0.7,
        max_tokens: opts.maxTokens ?? 700,
        stream: false,
      },
      { timeout },
    );
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      lastFailure = "empty";
      return null;
    }
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const elapsed = Date.now() - started;
    // A timeout means the network is the problem, so retrying will just cost the
    // caller another full timeout. Distinguish it so HQ can skip straight to the
    // deterministic floor.
    lastFailure = /timed out|timeout|aborted|ETIMEDOUT|ECONNRESET/i.test(message)
      ? "timeout"
      : "transport";
    console.warn(
      `[hq/model] ${lastFailure} after ${elapsed}ms (limit ${timeout}ms), degrading: ${message}`,
    );
    return null;
  }
}

/**
 * Ask for JSON and parse it, tolerating fenced blocks and surrounding prose.
 * Returns null rather than throwing so callers can fall back deterministically.
 */
export async function askJson<T>(
  prompt: string,
  opts: AskOptions = {},
): Promise<T | null> {
  const text = await ask(prompt, opts);
  if (!text) return null;

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Models like to wrap JSON in explanation; take the outermost object.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    console.warn("[hq/model] response was not JSON, degrading");
    return null;
  }
}

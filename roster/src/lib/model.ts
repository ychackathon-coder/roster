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
  return modelConfig() !== null;
}

let client: OpenAI | null = null;
let clientKey = "";

function getClient(cfg: ModelConfig): OpenAI {
  const key = `${cfg.apiKey}|${cfg.baseURL}`;
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
    clientKey = key;
  }
  return client;
}

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
  const cfg = modelConfig();
  if (!cfg) return null;

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
      { timeout: opts.timeoutMs ?? 12_000 },
    );
    const text = completion.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[hq/model] call failed after ${Date.now() - started}ms, degrading: ${message}`,
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

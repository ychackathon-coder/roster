import Groq from "groq-sdk";

import { classifyInput } from "@/lib/scan/classifyInput";
import { extractText, toBrief, type ExtractedPage } from "@/lib/scan/extractText";
import { fallbackPayload, titleFromHost } from "@/lib/scan/fallback";
import { normalizeGraph } from "@/lib/scan/normalizeGraph";
import { SYSTEM_PROMPT, REPAIR_PROMPT, buildUserPrompt } from "@/lib/scan/prompt";
import { ScanPayloadSchema, type ScanResult, type ScanSource } from "@/lib/types";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MODEL = "llama-3.3-70b-versatile";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Minimal surface of the Groq client we use, so tests can pass a stub. */
export interface Inferencer {
  complete(messages: { role: "system" | "user"; content: string }[]): Promise<string>;
}

export function groqInferencer(apiKey: string): Inferencer {
  const client = new Groq({ apiKey });
  return {
    async complete(messages) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.4,
        response_format: { type: "json_object" },
        max_tokens: 2048,
      });
      return completion.choices[0]?.message?.content ?? "";
    },
  };
}

export interface RunScanDeps {
  inferencer: Inferencer | null;
  fetchImpl?: typeof fetch;
}

/**
 * Runs the full pipeline and always resolves to a complete ScanResult.
 * Every failure downgrades the `source` rather than throwing, because Act 2's
 * animation has no dead-end state to fall into.
 */
export async function runScan(input: string, deps: RunScanDeps): Promise<ScanResult> {
  const classification = classifyInput(input);
  const host = classification.kind === "url" ? classification.host : null;
  // Whitespace-only input is already rejected at the route and in the client
  // guard, so `empty` here just means "read it as prose".
  const described = classification.kind === "description" ? classification.text : input.trim();
  const notes: string[] = [];

  notes.push(
    host
      ? `target ${host}`
      : `target free-form description, ${input.trim().split(/\s+/).length} words`,
  );
  notes.push(`classified as ${classification.kind === "url" ? "website" : "description"}`);

  let brief: string;
  let page: ExtractedPage | null = null;
  let source: ScanSource = "live";

  if (classification.kind === "url") {
    page = await fetchPage(classification.url, deps.fetchImpl ?? fetch);
    if (page) {
      notes.push(`retrieved ${page.text.length} characters of page copy`);
      brief = toBrief(page, host!);
    } else {
      source = "hostname-only";
      notes.push("site could not be read, inferring from hostname alone");
      brief = `Website: ${host}\nThe page could not be fetched. Infer the business from the domain name "${host}" alone.`;
    }
  } else {
    notes.push("no site to fetch, reading the description directly");
    brief = `The operator describes their company as follows:\n${described}`;
  }

  notes.push("mapping operational surfaces");

  const payload = deps.inferencer ? await infer(deps.inferencer, brief) : null;

  if (!payload) {
    notes.push("model unavailable, showing a sample roster");
    const fb = fallbackPayload({ host, text: host ? null : described });
    return {
      ...fb,
      agents: normalizeGraph(fb.agents),
      source: "fallback",
      notes,
      host,
    };
  }

  notes.push(`roster resolved, ${payload.agents.length} agents assigned`);

  return {
    profile: {
      ...payload.profile,
      // The model likes to invent a name when it could not read the page.
      name: source === "hostname-only" && host ? titleFromHost(host) : payload.profile.name,
    },
    agents: normalizeGraph(payload.agents),
    source,
    notes,
    host,
  };
}

/** Returns null on any fetch problem. The caller downgrades rather than throws. */
async function fetchPage(url: string, fetchImpl: typeof fetch): Promise<ExtractedPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;

    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return null;

    const html = (await response.text()).slice(0, MAX_BODY_BYTES);
    const page = extractText(html);
    return page.text.length > 0 || page.title ? page : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One attempt, then one repair attempt, then give up. */
async function infer(inferencer: Inferencer, brief: string) {
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(brief) },
  ];

  const first = await attempt(inferencer, messages);
  if (first) return first;

  return attempt(inferencer, [...messages, { role: "user", content: REPAIR_PROMPT }]);
}

async function attempt(
  inferencer: Inferencer,
  messages: { role: "system" | "user"; content: string }[],
) {
  try {
    const raw = await inferencer.complete(messages);
    const parsed = ScanPayloadSchema.safeParse(JSON.parse(stripFences(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Some models wrap JSON in a markdown fence despite json_object mode. */
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
}

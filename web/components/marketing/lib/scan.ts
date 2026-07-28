/**
 * The landing's scan logic, merged from orchestra's lib/scan/* and adapted to
 * run entirely on the client: the original /api/scan route (and its groq-sdk
 * pipeline) is gone, so the demo resolves to the sample roster after a short,
 * deliberate pause instead of a network round trip.
 */

import { FALLBACK_ROSTER } from "@/components/marketing/lib/data";
import {
  ScanPayloadSchema,
  type Agent,
  type ScanPayload,
  type ScanResult,
} from "@/components/marketing/lib/types";

// --- classify ------------------------------------------------------------

export type Classification =
  | { kind: "url"; url: string; host: string }
  | { kind: "description"; text: string }
  | { kind: "empty" };

/**
 * A bare domain looks like `label.tld` with an optional path. We deliberately
 * require a known-shaped TLD (2+ letters) so prose containing a period, like
 * "we sell shoes. online.", does not get misread as a domain.
 */
const BARE_DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i;

export function classifyInput(raw: string): Classification {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "empty" };

  // Anything with whitespace is prose, even if it happens to contain a link.
  const hasSpace = /\s/.test(trimmed);

  if (!hasSpace) {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const candidate = /^https?:\/\//i.test(trimmed) ? stripScheme(trimmed) : trimmed;

    if (BARE_DOMAIN.test(candidate)) {
      try {
        const url = new URL(withScheme);
        return { kind: "url", url: url.toString(), host: url.hostname.replace(/^www\./, "") };
      } catch {
        // fall through to description
      }
    }
  }

  return { kind: "description", text: trimmed };
}

function stripScheme(value: string): string {
  return value.replace(/^https?:\/\//i, "");
}

/** Client-side submit guard. Returns an error string, or null when valid. */
export function validateInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "Enter a company site or describe the business.";
  if (trimmed.length < 4) return "That is too short to scan.";
  if (trimmed.length > 600) return "Keep it under 600 characters.";

  const classification = classifyInput(trimmed);
  if (classification.kind === "description") {
    // Junk guard: prose needs at least a couple of real words.
    const words = trimmed.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
    if (words.length < 2) return "Enter a valid URL, or describe the business in a few words.";
  }
  return null;
}

// --- fallback roster -----------------------------------------------------

/**
 * Returns a credible generic org so Act 2 always has something to deal out,
 * personalised with whatever we do know about the input.
 */
export function fallbackPayload(opts: { host: string | null; text: string | null }): ScanPayload {
  const base = ScanPayloadSchema.parse(FALLBACK_ROSTER);
  const name = opts.host ? titleFromHost(opts.host) : nameFromText(opts.text);

  return {
    ...base,
    profile: {
      ...base.profile,
      name: name ?? base.profile.name,
    },
  };
}

/** `acme-tools.co.uk` becomes `Acme Tools`. */
export function titleFromHost(host: string): string {
  const label = host.replace(/^www\./, "").split(".")[0] ?? host;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Falls back to the first few words of a prose description. */
function nameFromText(text: string | null): string | null {
  if (!text) return null;
  const words = text.trim().split(/\s+/).slice(0, 3).join(" ");
  return words.length > 2 ? words.replace(/[.,;:]$/, "") : null;
}

// --- graph repair --------------------------------------------------------

/**
 * Zod proves the shape; it cannot prove the graph is drawable. Two roots, a
 * `reportsTo` naming an agent that is not in the list, or a cycle would make
 * OrgGraph render garbage or loop forever, so the edges are repaired here
 * rather than defended against inside the component.
 */
export function normalizeGraph(agents: Agent[]): Agent[] {
  if (agents.length === 0) return agents;

  const byRole = new Map<string, Agent>();
  // Duplicate roles would make `reportsTo` ambiguous. First one wins.
  const unique = agents.filter((agent) => {
    if (byRole.has(agent.role)) return false;
    byRole.set(agent.role, agent);
    return true;
  });

  // Pick a single root: the first agent that declared itself one, else index 0.
  const root = unique.find((agent) => agent.reportsTo === null) ?? unique[0]!;

  const repaired = unique.map((agent) => {
    if (agent === root) return { ...agent, reportsTo: null };

    const target = agent.reportsTo;
    const valid = target !== null && target !== agent.role && byRole.has(target);
    return { ...agent, reportsTo: valid ? target : root.role };
  });

  return breakCycles(repaired, root.role);
}

/** Re-parents any agent whose chain of managers never reaches the root. */
function breakCycles(agents: Agent[], rootRole: string): Agent[] {
  const parentOf = new Map(agents.map((a) => [a.role, a.reportsTo]));

  return agents.map((agent) => {
    if (agent.reportsTo === null) return agent;

    const seen = new Set<string>([agent.role]);
    let cursor: string | null = agent.reportsTo;

    while (cursor !== null && cursor !== rootRole) {
      if (seen.has(cursor)) return { ...agent, reportsTo: rootRole };
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }

    return cursor === null && agent.reportsTo !== rootRole
      ? { ...agent, reportsTo: rootRole }
      : agent;
  });
}

/** Depth of each agent from the root, used for graph layout. */
export function depthOf(agents: Agent[]): Map<string, number> {
  const parentOf = new Map(agents.map((a) => [a.role, a.reportsTo]));
  const depths = new Map<string, number>();

  for (const agent of agents) {
    let depth = 0;
    let cursor: string | null = agent.reportsTo;
    while (cursor !== null && depth < 8) {
      depth += 1;
      cursor = parentOf.get(cursor) ?? null;
    }
    depths.set(agent.role, depth);
  }

  return depths;
}

// --- the local scan ------------------------------------------------------

/** Long enough for the terminal to type its opening lines before the deal. */
const SCAN_DELAY_MS = 1600;

/**
 * Runs the whole "pipeline" locally and always resolves to a complete
 * ScanResult, because Act 2's animation has no dead-end state to fall into.
 */
export async function runLocalScan(input: string): Promise<ScanResult> {
  const classification = classifyInput(input);
  const host = classification.kind === "url" ? classification.host : null;
  const described = classification.kind === "description" ? classification.text : input.trim();

  const notes: string[] = [
    host
      ? `target ${host}`
      : `target free-form description, ${input.trim().split(/\s+/).length} words`,
    `classified as ${classification.kind === "url" ? "website" : "description"}`,
    host
      ? "static preview, skipping the live fetch"
      : "no site to fetch, reading the description directly",
    "mapping operational surfaces",
    "assembling a sample roster for this preview",
  ];

  await new Promise((resolve) => setTimeout(resolve, SCAN_DELAY_MS));

  const payload = fallbackPayload({ host, text: host ? null : described });
  return {
    ...payload,
    agents: normalizeGraph(payload.agents),
    source: "fallback",
    notes,
    host,
  };
}

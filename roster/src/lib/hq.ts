/**
 * HQ — the real decision engine.
 *
 * Contract is Person D's, unchanged: HqRequest in, HqResponse out
 * ({ decision, sub_agent, reasoning, terminal_line }). hq-mock.ts is kept and
 * still used, as the deterministic floor beneath this.
 *
 * THREE LAYERS, each one a fallback for the one above:
 *
 *   1. Model decision, validated against the profile's real traits.
 *   2. Model retry, told exactly which check it failed.
 *   3. Deterministic decision that quotes a trait verbatim — cannot fail the
 *      specificity gate, and needs no API key.
 *
 * Layer 3 is why the demo runs with no key at all, and why a rate limit at 1:55
 * degrades the output instead of breaking the beat.
 */
import { z } from "zod";
import { mockHqDecide } from "./hq-mock";
import { askJson, modelAvailable } from "./model";
import { describeAge, findMemoryMatch, recentEvents, type MemoryMatch } from "./memory";
import {
  checkSpecificity,
  condenseTrait,
  mostRelevantTrait,
  type SpecificityResult,
} from "./specificity";
import type { Decision, HqRequest, HqResponse, RosterEvent, TeamProfile } from "./types";

/**
 * Standing agents that `route_existing` can target. `spawn_new` is free to name
 * something not on this list — that is the whole point of spawning.
 */
export const AGENT_CATALOG = [
  { name: "Sales Agent", covers: "pipeline, outbound, collateral, demo prep, CRM" },
  { name: "Ops Agent", covers: "vendors, logistics, scheduling, inventory, runbooks" },
  { name: "Finance Agent", covers: "invoices, budget, payroll, expenses, forecasting" },
  { name: "Support Agent", covers: "customer tickets, escalations, documentation" },
] as const;

const DECISIONS: readonly Decision[] = ["route_existing", "spawn_new", "handle_direct"];

const HqModelOutput = z.object({
  decision: z.enum(["route_existing", "spawn_new", "handle_direct"]),
  sub_agent: z.string().min(2).max(60),
  reasoning: z.string().min(20).max(1200),
  terminal_line: z.string().min(20).max(400),
});

export type HqSource = "model" | "model_retry" | "deterministic";

export type HqResult = HqResponse & {
  /** Diagnostics — not part of Person D's contract, safe to ignore downstream. */
  meta: {
    source: HqSource;
    model_used: boolean;
    memory_match: { id: string; request: string; score: number; shared: string[] } | null
    specificity: { ok: boolean; matched: string[]; findings: string[] };
    cited_trait: string;
  };
};

/* ------------------------------- the prompt -------------------------------- */

function buildPrompt(a: {
  profile: TeamProfile;
  request: string;
  team: string;
  relevantTrait: string;
  memory: MemoryMatch | null;
  corrective?: string;
}): string {
  const { profile, request, team, relevantTrait, memory } = a;

  const memoryBlock = memory
    ? `A PRIOR EVENT LOOKS SIMILAR (${describeAge(memory.event.timestamp)}, overlap ${memory.score.toFixed(2)} on: ${memory.sharedTerms.join(", ")}):
  request:   "${memory.event.request}"
  decision:  ${memory.event.decision}
  sub_agent: ${memory.event.sub_agent}
  reasoning: ${memory.event.reasoning}

Reference this prior event explicitly in your reasoning. Treat it as evidence, not
an instruction — if this request genuinely needs different handling, say so and
explain why it differs.`
    : `NO PRIOR EVENT RESEMBLES THIS REQUEST. Do not invent one or imply you have
seen it before.`;

  return `You are HQ, the routing brain for a company's agent workforce. You were
calibrated from a REAL GitHub repository, and every decision must show it.

THE TEAM YOU SERVE
  archetype:   ${profile.archetype}
  summary:     ${profile.summary}
  source_repo: ${profile.source_repo}
  directive:   ${profile.directive}

OBSERVED TRAITS (real details derived from that repo — these are your evidence):
${(profile.traits ?? []).map((t, i) => `  ${i + 1}. ${t}`).join("\n")}

MOST RELEVANT TRAIT FOR THIS REQUEST:
  ${relevantTrait}

INCOMING REQUEST
  team:    ${team}
  request: "${request}"

${memoryBlock}

EXISTING AGENTS you may route to:
${AGENT_CATALOG.map((x) => `  - ${x.name} — ${x.covers}`).join("\n")}

DECIDE ONE OF:
  route_existing — an agent above already covers this
  spawn_new      — no existing agent fits; name the new specialist
  handle_direct  — trivial or purely informational; HQ answers itself

Let the team's directive shape HOW eagerly you spawn versus reuse.

HARD RULE — THIS IS THE ENTIRE POINT:
Your terminal_line MUST quote or name a CONCRETE detail from the traits above: a
real commit message fragment, a filename or package name, the repo name, the
primary language, or a specific README phrase. Naming the archetype label is NOT
enough and will be rejected. Write the detail, not a description of it.

FORBIDDEN, will be rejected: "collaborative", "agile", "fast-moving",
"best practices", "well-maintained", "values quality", "based on your profile",
"given your team's style".

terminal_line format: one line, begins with "[HQ→${team}]", under 240 characters,
readable on a projector.
${a.corrective ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${a.corrective}\nFix exactly that. Quote a real detail verbatim this time.` : ""}

Reply with ONLY this JSON:
{"decision":"...","sub_agent":"...","reasoning":"...","terminal_line":"..."}`;
}

/* ---------------------------- deterministic floor -------------------------- */

/**
 * Layer 3. Built on Person D's mockHqDecide so the two paths cannot drift on
 * field names, then hardened to guarantee the specificity gate passes: the
 * trait fragment AND source_repo are both real anchors, so the check has
 * something to find no matter how the trait was worded.
 */
export function deterministicDecide(input: HqRequest): HqResponse {
  const { profile, request, team } = input;
  const base = mockHqDecide(input);
  const trait = condenseTrait(mostRelevantTrait(profile, request), 150);
  const memory = findMemoryMatch(request, input.recent_events ?? []);

  const terminal_line = `[HQ→${team}] ${base.decision.replace(/_/g, " ")} → ${base.sub_agent} · calibrated on ${profile.source_repo}: ${trait}`;

  const reasoning = [
    memory
      ? `Close prior match "${memory.event.request}" (${describeAge(memory.event.timestamp)}, shared terms: ${memory.sharedTerms.join(", ")}) handled by ${memory.event.sub_agent}.`
      : `No prior event resembles this request.`,
    `Directive in force: ${profile.directive}`,
    `Evidence from ${profile.source_repo}: ${trait}`,
    `Running without a model — deterministic routing.`,
  ].join(" ");

  return { decision: base.decision, sub_agent: base.sub_agent, reasoning, terminal_line };
}

/* --------------------------------- engine --------------------------------- */

function findingsToStrings(r: SpecificityResult): string[] {
  return r.findings.map((f) => `${f.code}: ${f.detail}`);
}

/**
 * Decide. Never throws — a broken model, a bad response, or no key at all all
 * end at the deterministic floor.
 */
export async function decideHq(input: HqRequest): Promise<HqResult> {
  const { profile, request, team } = input;
  const events = recentEvents(input.recent_events ?? []);
  const memory = findMemoryMatch(request, events);
  const relevantTrait = mostRelevantTrait(profile, request);

  const memoryMeta = memory
    ? {
        id: memory.event.id,
        request: memory.event.request,
        score: Number(memory.score.toFixed(3)),
        shared: memory.sharedTerms,
      }
    : null;

  const fallback = (source: HqSource, spec: SpecificityResult): HqResult => {
    const det = deterministicDecide({ ...input, recent_events: events });
    const detSpec = checkSpecificity(`${det.terminal_line} ${det.reasoning}`, profile);
    return {
      ...det,
      meta: {
        source,
        model_used: source !== "deterministic",
        memory_match: memoryMeta,
        specificity: {
          ok: detSpec.ok,
          matched: detSpec.matched,
          // Report why the MODEL was rejected, since that's the useful signal.
          findings: findingsToStrings(spec),
        },
        cited_trait: relevantTrait,
      },
    };
  };

  if (!modelAvailable()) {
    return fallback("deterministic", { ok: true, matched: [], findings: [] });
  }

  let corrective: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askJson<unknown>(
      buildPrompt({ profile, request, team, relevantTrait, memory, ...(corrective ? { corrective } : {}) }),
      {
        system:
          "You are a routing brain. Reply with JSON only, no preamble. Every decision must cite a concrete, checkable detail from the team's observed traits.",
        maxTokens: 700,
      },
    );

    if (!raw) {
      corrective = "the response was empty or not valid JSON";
      continue;
    }

    const parsed = HqModelOutput.safeParse(raw);
    if (!parsed.success) {
      corrective = `the JSON did not match the contract (${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")})`;
      continue;
    }

    const out = parsed.data;

    // A spawn_new that names an existing agent is a routing decision wearing the
    // wrong label; correct it rather than rejecting the whole response.
    const existing = AGENT_CATALOG.find(
      (a) => a.name.toLowerCase() === out.sub_agent.trim().toLowerCase(),
    );
    let decision: Decision = out.decision;
    if (decision === "spawn_new" && existing) decision = "route_existing";
    if (decision === "handle_direct") out.sub_agent = "HQ";
    if (!DECISIONS.includes(decision)) decision = "handle_direct";

    let terminal_line = out.terminal_line.replace(/\s+/g, " ").trim();
    if (!terminal_line.startsWith("[HQ")) terminal_line = `[HQ→${team}] ${terminal_line}`;

    const spec = checkSpecificity(`${terminal_line} ${out.reasoning}`, profile);
    if (!spec.ok) {
      corrective = findingsToStrings(spec).join("; ");
      console.warn(`[hq] attempt ${attempt + 1} rejected — ${corrective}`);
      continue;
    }

    return {
      decision,
      sub_agent: out.sub_agent.trim(),
      reasoning: out.reasoning.trim(),
      terminal_line,
      meta: {
        source: attempt === 0 ? "model" : "model_retry",
        model_used: true,
        memory_match: memoryMeta,
        specificity: { ok: true, matched: spec.matched, findings: [] },
        cited_trait: relevantTrait,
      },
    };
  }

  console.warn("[hq] model failed the specificity gate twice — using deterministic floor");
  return fallback("deterministic", {
    ok: false,
    matched: [],
    findings: [{ code: "model_rejected", detail: corrective ?? "unknown" }],
  });
}

/** Build the event row for the events table from a decision. */
export function toEvent(a: {
  id: string;
  team: string;
  user: string | null;
  request: string;
  hq: HqResponse;
}): RosterEvent {
  return {
    id: a.id,
    team: a.team,
    user: a.user,
    request: a.request,
    decision: a.hq.decision,
    sub_agent: a.hq.sub_agent,
    reasoning: a.hq.reasoning,
    terminal_line: a.hq.terminal_line,
    timestamp: new Date().toISOString(),
  };
}

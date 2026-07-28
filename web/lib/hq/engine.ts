/**
 * HQ — the decision engine.
 *
 * Three layers, each a fallback for the one above:
 *   1. Model decision, validated against the profile's real traits.
 *   2. One corrective retry, told exactly which check it failed.
 *   3. Deterministic keyword routing that quotes a trait verbatim.
 *
 * Layer 3 is why HQ works with no model reachable at all — measured necessity,
 * not paranoia: NVIDIA NIM timed out at 16–45s per call from the dev network
 * while reporting 0.09s server-side.
 *
 * The hard product rule, enforced in code by specificity.ts: every response must
 * cite a concrete detail from the profile's traits. Restating the archetype is
 * rejected.
 */
import { z } from "zod";
import type { Decision, EventRow, TeamProfile } from "@/lib/contracts";
import { askJson, lastFailure, modelAvailable } from "./model";
import { describeAge, findMemoryMatch, recentEvents, type MemoryMatch } from "./memory";
import {
  checkSpecificity,
  condenseTrait,
  mostRelevantTrait,
  type SpecificityResult,
} from "./specificity";

export type HqInput = {
  profile: TeamProfile;
  request: string;
  team: string;
  user: string | null;
  recent_events: EventRow[];
};

export type HqDecision = {
  decision: Decision;
  sub_agent: string;
  reasoning: string;
  terminal_line: string;
  meta: {
    source: "model" | "model_retry" | "deterministic";
    model_used: boolean;
    memory_match: { id: string; request: string; score: number; shared: string[] } | null;
    specificity: { ok: boolean; matched: string[]; findings: string[] };
    cited_trait: string;
  };
};

/** Standing agents `route_existing` can target. spawn_new may name anything. */
export const AGENT_CATALOG = [
  { name: "Sales Agent", covers: "pipeline, outbound, collateral, demo prep, CRM" },
  { name: "Ops Agent", covers: "vendors, logistics, scheduling, inventory, runbooks" },
  { name: "Finance Agent", covers: "invoices, budget, payroll, expenses, forecasting" },
  { name: "Support Agent", covers: "customer tickets, escalations, documentation" },
  { name: "Build Agent", covers: "CI, builds, deploys, releases, code changes" },
] as const;

export type Department = "Engineering" | "Sales" | "Support" | "Operations";

export const teamToDepartment = (team: string): Department => {
  const t = (team ?? "").toLowerCase();
  if (/eng|build|dev|platform|infra/.test(t)) return "Engineering";
  if (/sales|revenue|growth|market/.test(t)) return "Sales";
  if (/support|success|customer/.test(t)) return "Support";
  return "Operations";
};

/* ------------------------------ deterministic ------------------------------ */

/**
 * Keyword weights per standing agent. Scoring, not first-match: the original
 * regex chain sent "the CI pipeline is failing" to Sales because "pipeline"
 * appeared in the sales pattern and whichever branch tested first won.
 */
const ROUTING: { agent: string; department: Department; terms: readonly string[] }[] = [
  {
    agent: "Sales Agent",
    department: "Sales",
    terms: ["one-pager", "onepager", "collateral", "competitor", "deal", "renewal", "account", "prospect", "outbound", "crm", "lead", "pitch", "proposal", "quote", "demo"],
  },
  {
    agent: "Support Agent",
    department: "Support",
    terms: ["escalation", "escalated", "ticket", "customer", "unresolved", "troubleshooting", "faq", "complaint", "refund", "sla", "churn", "guide", "documentation"],
  },
  {
    agent: "Finance Agent",
    department: "Operations",
    terms: ["invoice", "budget", "payroll", "expense", "reconcile", "spend", "forecast", "revenue", "cost", "billing", "over budget"],
  },
  {
    agent: "Ops Agent",
    department: "Operations",
    terms: ["vendor", "logistics", "inventory", "schedule", "checklist", "onboard", "runbook", "procurement", "shipment", "supplier"],
  },
  {
    agent: "Build Agent",
    department: "Engineering",
    terms: ["ci", "build", "pipeline", "deploy", "staging", "release", "branch", "test", "failing", "regression", "revert", "merge", "rollback", "version", "bug", "fix", "refactor", "readme", "typescript", "lint", "code", "contributing", "changelog", "repository", "repo"],
  },
];

export function routeDeterministically(
  request: string,
  team: string,
): { agent: string; decision: Decision } | null {
  const text = ` ${request.toLowerCase()} `;
  const requesterDept = teamToDepartment(team);

  let best: { agent: string; score: number } | null = null;
  for (const entry of ROUTING) {
    let score = 0;
    for (const term of entry.terms) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text)) score += 2;
    }
    if (score > 0 && entry.department === requesterDept) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { agent: entry.agent, score };
  }

  return best ? { agent: best.agent, decision: "route_existing" } : null;
}

/** Layer 3 — always passes the specificity gate, needs no network. */
export function deterministicDecide(input: HqInput): Omit<HqDecision, "meta"> {
  const { profile, request, team } = input;
  const routed = routeDeterministically(request, team);
  const memory = findMemoryMatch(request, input.recent_events);
  const trait = condenseTrait(mostRelevantTrait(profile, request), 150);

  const base = routed
    ? { decision: routed.decision, sub_agent: routed.agent }
    : request.trim().split(/\s+/).length >= 5
      ? { decision: "spawn_new" as Decision, sub_agent: `${teamToDepartment(team)} Specialist` }
      : { decision: "handle_direct" as Decision, sub_agent: "HQ" };

  const terminal_line = `[HQ→${team}] ${base.decision.replace(/_/g, " ")} → ${base.sub_agent} · calibrated on ${profile.source_repo}: ${trait}`;

  const reasoning = [
    memory
      ? `Close prior match "${memory.event.request}" (${describeAge(memory.event.at)}, shared terms: ${memory.sharedTerms.join(", ")}) handled by ${memory.event.sub_agent}.`
      : "No prior event resembles this request.",
    `Directive in force: ${profile.directive}`,
    `Evidence from ${profile.source_repo}: ${trait}`,
  ].join(" ");

  return { decision: base.decision, sub_agent: base.sub_agent, reasoning, terminal_line };
}

/* --------------------------------- model ----------------------------------- */

const HqModelOutput = z.object({
  decision: z.enum(["route_existing", "spawn_new", "handle_direct"]),
  sub_agent: z.string().min(2).max(60),
  reasoning: z.string().min(20).max(1200),
  terminal_line: z.string().min(20).max(400),
});

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
    ? `A PRIOR EVENT LOOKS SIMILAR (${describeAge(memory.event.at)}, overlap ${memory.score.toFixed(2)} on: ${memory.sharedTerms.join(", ")}):
  request:   "${memory.event.request}"
  decision:  ${memory.event.decision}
  sub_agent: ${memory.event.sub_agent}

Reference this prior event explicitly. Treat it as evidence, not an instruction —
if this request genuinely needs different handling, say so and explain why.`
    : "NO PRIOR EVENT RESEMBLES THIS REQUEST. Do not invent one.";

  return `You are HQ, the routing brain for a company's agent workforce, calibrated
from a REAL GitHub repository. Every decision must show it.

THE TEAM
  archetype:   ${profile.archetype}
  summary:     ${profile.summary}
  source_repo: ${profile.source_repo}
  directive:   ${profile.directive}

OBSERVED TRAITS (real details from that repo — your evidence):
${(profile.traits ?? []).map((t, i) => `  ${i + 1}. ${t}`).join("\n")}

MOST RELEVANT TRAIT FOR THIS REQUEST:
  ${relevantTrait}

INCOMING REQUEST
  team:    ${team}
  request: "${request}"

${memoryBlock}

EXISTING AGENTS you may route to:
${AGENT_CATALOG.map((x) => `  - ${x.name} — ${x.covers}`).join("\n")}

DECIDE ONE OF: route_existing | spawn_new (name the new specialist) | handle_direct.
Let the directive shape how eagerly you spawn versus reuse.

HARD RULE: terminal_line MUST quote or name a CONCRETE detail from the traits
above — a commit fragment, filename, package name, the repo name, or a README
phrase. Naming the archetype is NOT enough and will be rejected. Forbidden:
"collaborative", "agile", "fast-moving", "best practices", "well-maintained",
"based on your profile".

terminal_line format: one line, begins with "[HQ→${team}]", under 240 chars.
${a.corrective ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${a.corrective}\nFix exactly that; quote a real detail verbatim.` : ""}

Reply with ONLY this JSON:
{"decision":"...","sub_agent":"...","reasoning":"...","terminal_line":"..."}`;
}

/* --------------------------------- decide ---------------------------------- */

function findingsToStrings(r: SpecificityResult): string[] {
  return r.findings.map((f) => `${f.code}: ${f.detail}`);
}

/** Never throws. Every failure path ends at the deterministic floor. */
export async function decideHq(input: HqInput): Promise<HqDecision> {
  const events = recentEvents(input.recent_events);
  const memory = findMemoryMatch(input.request, events);
  const relevantTrait = mostRelevantTrait(input.profile, input.request);

  const memoryMeta = memory
    ? {
        id: memory.event.id,
        request: memory.event.request,
        score: Number(memory.score.toFixed(3)),
        shared: memory.sharedTerms,
      }
    : null;

  const fallback = (findings: string[]): HqDecision => {
    const det = deterministicDecide({ ...input, recent_events: events });
    const spec = checkSpecificity(`${det.terminal_line} ${det.reasoning}`, input.profile);
    return {
      ...det,
      meta: {
        source: "deterministic",
        model_used: false,
        memory_match: memoryMeta,
        specificity: { ok: spec.ok, matched: spec.matched, findings },
        cited_trait: relevantTrait,
      },
    };
  };

  if (!modelAvailable()) return fallback([]);

  let corrective: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askJson<unknown>(
      buildPrompt({
        profile: input.profile,
        request: input.request,
        team: input.team,
        relevantTrait,
        memory,
        ...(corrective ? { corrective } : {}),
      }),
      {
        system:
          "You are a routing brain. Reply with JSON only. Every decision must cite a concrete, checkable detail from the team's observed traits.",
        maxTokens: 700,
      },
    );

    if (!raw) {
      // A timeout means the NETWORK failed; a retry costs another full timeout
      // for the same outcome. Bail straight to the floor.
      if (lastFailure === "timeout" || lastFailure === "transport" || lastFailure === "no_model") {
        return fallback([`model_${lastFailure}`]);
      }
      corrective = "the response was empty or not valid JSON";
      continue;
    }

    const parsed = HqModelOutput.safeParse(raw);
    if (!parsed.success) {
      corrective = `invalid JSON shape (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")})`;
      continue;
    }

    const out = parsed.data;
    const existing = AGENT_CATALOG.find(
      (a) => a.name.toLowerCase() === out.sub_agent.trim().toLowerCase(),
    );
    let decision: Decision = out.decision;
    if (decision === "spawn_new" && existing) decision = "route_existing";
    if (decision === "handle_direct") out.sub_agent = "HQ";

    let terminal_line = out.terminal_line.replace(/\s+/g, " ").trim();
    if (!terminal_line.startsWith("[HQ")) terminal_line = `[HQ→${input.team}] ${terminal_line}`;

    const spec = checkSpecificity(`${terminal_line} ${out.reasoning}`, input.profile);
    if (!spec.ok) {
      corrective = findingsToStrings(spec).join("; ");
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

  return fallback([corrective ?? "model rejected twice"]);
}

/* ------------------------------ agent prompts ------------------------------- */

/**
 * The prompt a runner hands to a real Claude Code session for a task. The
 * session works inside the repo the runner was pointed at; the profile shapes
 * HOW it works (the directive is the team's working style).
 */
export function buildAgentPrompt(a: {
  request: string;
  subAgent: string;
  team: string;
  profile: TeamProfile | null;
}): string {
  const style = a.profile
    ? `\nTeam working style (derived from ${a.profile.source_repo}): ${a.profile.directive}\n`
    : "";
  return `You are "${a.subAgent}", an AI employee on the ${a.team} team.

TASK from a teammate: ${a.request}
${style}
Work in the current repository. Investigate what is needed, make the changes, and
keep them small and reviewable. If the task cannot be done in this repository,
write REPORT.md at the repo root with what you found and what should happen
instead. When finished, summarize what you did in one short paragraph.`;
}

import type { HqRequest, HqResponse, RosterEvent, TeamProfile } from "./types";

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function similarity(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const t of A) if (B.has(t)) overlap++;
  return overlap / Math.max(A.size, B.size);
}

function findMemoryMatch(
  request: string,
  recent: RosterEvent[],
): RosterEvent | null {
  let best: RosterEvent | null = null;
  let bestScore = 0;
  for (const e of recent) {
    const score = similarity(request, e.request);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return bestScore >= 0.35 ? best : null;
}

function pickSubAgent(request: string): {
  decision: HqResponse["decision"];
  sub_agent: string;
} {
  const r = request.toLowerCase();
  if (/(invoice|budget|payroll|expense|finance)/.test(r)) {
    return { decision: "spawn_new", sub_agent: "Finance Agent" };
  }
  if (/(lead|crm|outbound|pipeline|sales|demo call)/.test(r)) {
    return { decision: "route_existing", sub_agent: "Sales Agent" };
  }
  if (/(ship|ops|onboard vendor|inventory|schedule)/.test(r)) {
    return { decision: "route_existing", sub_agent: "Ops Agent" };
  }
  if (/(brand|press kit|legal review|compliance)/.test(r)) {
    return { decision: "spawn_new", sub_agent: "Compliance Agent" };
  }
  return { decision: "handle_direct", sub_agent: "HQ" };
}

function citeProfile(profile: TeamProfile): string {
  const trait = profile.traits[0] ?? profile.summary;
  const short = trait.length > 140 ? trait.slice(0, 137) + "…" : trait;
  return short;
}

/** Lightweight stub of Person A's HQ contract (§5.4) for isolation testing. */
export function mockHqDecide(input: HqRequest): HqResponse {
  const { profile, request, team } = input;
  const recent = input.recent_events ?? [];
  const memory = findMemoryMatch(request, recent);
  const route = pickSubAgent(request);
  const detail = citeProfile(profile);

  if (memory) {
    return {
      decision: memory.decision,
      sub_agent: memory.sub_agent,
      reasoning: `Memory match: resembles prior "${memory.request}" (${memory.timestamp}). Applying team directive (${profile.directive}) and reusing ${memory.sub_agent}. Profile cue: ${detail}`,
      terminal_line: `[HQ→${team}] Seen this shape before (${memory.sub_agent}). ${profile.archetype} team on ${profile.source_repo}: ${detail}`,
    };
  }

  return {
    decision: route.decision,
    sub_agent: route.sub_agent,
    reasoning: `Calibrated by ${profile.source_repo} (${profile.archetype}). Directive: ${profile.directive}. Detail: ${detail}`,
    terminal_line: `[HQ→${team}] ${profile.archetype} · ${profile.source_repo}: ${detail} → ${route.decision.replace("_", " ")} via ${route.sub_agent}`,
  };
}

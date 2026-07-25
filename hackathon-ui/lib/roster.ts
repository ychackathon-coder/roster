/**
 * Roster API client + mappers.
 *
 * Turns the backend's two contracts into the shapes this dashboard already
 * renders, so wiring live data is a data-source swap rather than a UI rewrite.
 * Nothing here touches presentation — the glass/hierarchy/zoom system in
 * components/dashboard.tsx is untouched by design.
 *
 * EVERY FETCH FALLS BACK TO MOCK DATA. If roster is down, on another port, or
 * mid-restart, the dashboard renders exactly as it does today instead of
 * throwing. A demo where the UI dies because a sibling service blinked is worse
 * than one showing slightly stale numbers.
 *
 * Configure with NEXT_PUBLIC_ROSTER_API_BASE_URL (see .env.example).
 */
import { operations as MOCK_OPERATIONS, type Operation, type OperationStatus } from "./data";

/* --------------------------------- contracts ------------------------------- */

export type TeamProfile = {
  archetype: string;
  summary: string;
  traits: string[];
  directive: string;
  source_repo: string;
};

export type RosterDecision = "route_existing" | "spawn_new" | "handle_direct";

export type RosterEvent = {
  id: string;
  team: string;
  user: string | null;
  request: string;
  decision: RosterDecision;
  sub_agent: string;
  reasoning: string;
  terminal_line: string;
  timestamp: string;
};

/* ---------------------------------- config --------------------------------- */

/**
 * Empty by default — same-origin.
 *
 * next.config.ts proxies /api/* to roster server-side, so the browser only ever
 * talks to the origin it loaded from. That is what makes the dashboard work
 * unchanged from another computer: a teammate opening 192.168.x.x:3001 has their
 * requests forwarded by THIS server, instead of their browser trying to reach a
 * "localhost:3456" that only exists on the host machine.
 *
 * Only set NEXT_PUBLIC_ROSTER_API_BASE_URL if roster is deployed on a genuinely
 * separate domain, in which case CORS becomes your problem again.
 */
export const ROSTER_BASE =
  process.env.NEXT_PUBLIC_ROSTER_API_BASE_URL?.replace(/\/$/, "") ?? "";

const REQUEST_TIMEOUT_MS = 6_000;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${ROSTER_BASE}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[roster] ${path} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    // Expected whenever roster isn't running. Warn, don't throw.
    console.warn(`[roster] ${path} unreachable:`, (err as Error).message);
    return null;
  }
}

/* ---------------------------------- fetches -------------------------------- */

export async function fetchProfile(): Promise<TeamProfile | null> {
  const body = await getJson<{ profile: TeamProfile | null }>("/api/profile");
  return body?.profile ?? null;
}

/**
 * The event stream. Tolerates either a bare array or `{ events: [...] }` so a
 * change in the route's envelope can't blank the dashboard.
 *
 * Returns NULL when roster could not be reached, and [] when it answered with no
 * events. That difference matters: an empty company should render as genuinely
 * empty ("nobody has joined yet"), while an unreachable backend should fall back
 * to sample data rather than claim the company is empty.
 */
export async function fetchEvents(): Promise<RosterEvent[] | null> {
  const body = await getJson<RosterEvent[] | { events?: RosterEvent[] }>("/api/events");
  if (!body) return null;
  const list = Array.isArray(body) ? body : (body.events ?? []);
  return list
    .filter((e): e is RosterEvent => Boolean(e?.id && e?.timestamp))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

/** Ask HQ to route a request. Used by the terminal input. */
export async function sendToHq(a: {
  request: string;
  team?: string;
  user?: string | null;
}): Promise<{ terminal_line: string; event: RosterEvent } | null> {
  try {
    const res = await fetch(`${ROSTER_BASE}/api/hq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team: "Sales", user: null, ...a }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn(`[roster] /api/hq -> ${res.status}`, body.error ?? "");
      return null;
    }
    return (await res.json()) as { terminal_line: string; event: RosterEvent };
  } catch (err) {
    console.warn("[roster] /api/hq unreachable:", (err as Error).message);
    return null;
  }
}

/* ---------------------------------- mappers -------------------------------- */

/** The four departments the hierarchy renders. Anything else lands in Operations. */
export const DEPARTMENTS = ["Engineering", "Sales", "Support", "Operations"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/**
 * Roster teams are free text ("Sales", "Ops", "HQ", "Strategy"); the hierarchy
 * has exactly four branches. Unmapped teams go to Operations rather than
 * vanishing, because a missing node breaks the SVG branch paths.
 */
export function toDepartment(team: string): Department {
  const t = (team ?? "").toLowerCase();
  if (/eng|build|dev|platform|infra/.test(t)) return "Engineering";
  if (/sales|revenue|growth|market/.test(t)) return "Sales";
  if (/support|success|customer/.test(t)) return "Support";
  return "Operations";
}

export function initialsOf(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

const ACCENTS = ["violet", "blue", "amber", "mint", "rose"] as const;

/** Stable accent per agent, so a node doesn't change colour on every poll. */
export function accentFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(hash) % ACCENTS.length]!;
}

/** mm:ss since a timestamp, matching the existing `elapsed` format. */
export function elapsedSince(timestamp: string): string {
  const ms = Math.max(0, Date.now() - Date.parse(timestamp));
  const total = Math.floor(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * HQ's decision maps onto the operation states the UI already renders.
 * `spawn_new` shows as "Waiting for approval" — a brand-new agent is exactly the
 * thing a human should glance at, and it keeps the approvals panel populated.
 */
function statusFor(decision: RosterDecision, index: number): OperationStatus {
  if (decision === "spawn_new") return "Waiting for approval";
  if (decision === "handle_direct") return "Reviewing";
  return index === 0 ? "Running" : "Running";
}

/**
 * Deterministic pseudo-progress from the event id.
 *
 * The backend has no notion of task completion — HQ routes, it does not track
 * execution. Deriving it from the id keeps bars stable across polls instead of
 * jittering, and is honest about being cosmetic. Replace when real task progress
 * exists.
 */
function progressFor(id: string, status: OperationStatus): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) | 0;
  const base = Math.abs(hash) % 45;
  if (status === "Waiting for approval") return 60 + (base % 25);
  if (status === "Reviewing") return 75 + (base % 20);
  return 35 + base;
}

export function eventsToOperations(events: RosterEvent[], limit = 6): Operation[] {
  return events.slice(0, limit).map((e, i) => {
    const status = statusFor(e.decision, i);
    return {
      id: i + 1,
      agent: e.sub_agent || "HQ",
      assignment: e.request,
      team: toDepartment(e.team),
      status,
      progress: progressFor(e.id, status),
      elapsed: elapsedSince(e.timestamp),
      initials: initialsOf(e.sub_agent || "HQ"),
      accent: accentFor(e.sub_agent || "HQ"),
    };
  });
}

export type AgentNode = {
  id: string;
  name: string;
  initials: string;
  team: Department;
  working: boolean;
  task: string;
  progress: number;
  elapsed: string;
};

/**
 * Hierarchy membership, derived from who actually appears in the event stream.
 *
 * "working" means this agent was the most recent event's sub_agent — the green
 * dot then tracks something real rather than a hardcoded flag. Everyone else
 * shows idle/red.
 */
export function eventsToAgents(events: RosterEvent[]): AgentNode[] {
  const byAgent = new Map<string, RosterEvent>();
  for (const e of events) {
    const name = e.sub_agent || "HQ";
    if (!byAgent.has(name)) byAgent.set(name, e); // events are newest-first
  }
  const newestAgent = events[0]?.sub_agent;

  return [...byAgent.entries()].map(([name, e]) => {
    const status = statusFor(e.decision, 0);
    return {
      id: e.id,
      name,
      initials: initialsOf(name),
      team: toDepartment(e.team),
      working: name === newestAgent,
      task: e.request,
      progress: progressFor(e.id, status),
      elapsed: elapsedSince(e.timestamp),
    };
  });
}

/**
 * Overlay live agent state onto the dashboard's standing roster.
 *
 * WHY MERGE INSTEAD OF REPLACE: the hierarchy renders 18 agents across 4
 * departments, and its continuous SVG branch paths are the centrepiece. Live data
 * realistically has 3-5 agents, so replacing the roster outright would collapse
 * the visual into something sparse and broken-looking — and the brief was
 * explicitly to preserve it.
 *
 * So the standing roster stays as company STRUCTURE, and live events light up the
 * nodes they touch:
 *   - a matched agent shows its real task, progress, and elapsed time
 *   - an unmatched agent shows idle, honestly — nothing has been routed to it
 *   - a live agent absent from the roster is APPENDED, so a spawn_new decision
 *     visibly grows the org chart
 */
export function mergeAgents<
  T extends { id: string; name: string; initials: string; team: string; working: boolean; task: string; progress: number; elapsed: string },
>(standing: readonly T[], live: readonly AgentNode[]): T[] {
  const norm = (s: string) => s.toLowerCase().replace(/\s*agent\s*$/i, "").trim();
  const liveByName = new Map(live.map((a) => [norm(a.name), a]));
  const used = new Set<string>();

  const merged = standing.map((agent) => {
    const hit = liveByName.get(norm(agent.name));
    if (!hit) {
      // Idle rather than showing a fabricated task next to real ones.
      return { ...agent, working: false, task: "Waiting for a new assignment", progress: 0, elapsed: "—" };
    }
    used.add(norm(agent.name));
    return {
      ...agent,
      working: hit.working,
      task: hit.task,
      progress: hit.progress,
      elapsed: hit.elapsed,
    };
  });

  // Agents HQ spawned that the static roster never knew about.
  for (const a of live) {
    if (used.has(norm(a.name))) continue;
    merged.push({
      ...(standing[0] as T),
      id: `live-${a.id}`,
      name: a.name,
      initials: a.initials,
      team: a.team,
      working: a.working,
      task: a.task,
      progress: a.progress,
      elapsed: a.elapsed,
    });
  }

  return merged;
}

export type ActivityItem = {
  id: string;
  agent: string;
  text: string;
  detail: string;
  team: Department;
  user: string | null;
  at: string;
  ago: string;
};

export function eventsToActivity(events: RosterEvent[], limit = 8): ActivityItem[] {
  return events.slice(0, limit).map((e) => ({
    id: e.id,
    agent: e.sub_agent || "HQ",
    text: `${e.decision.replace(/_/g, " ")} — ${e.request}`,
    detail: e.reasoning,
    team: toDepartment(e.team),
    user: e.user,
    at: e.timestamp,
    ago: agoLabel(e.timestamp),
  }));
}

export function agoLabel(timestamp: string): string {
  const ms = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ms)) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** terminal_line is authored by HQ for exactly this surface — pass it through. */
export function eventsToTerminal(events: RosterEvent[], limit = 12): string[] {
  return events
    .slice(0, limit)
    .map((e) => e.terminal_line)
    .filter(Boolean)
    .reverse(); // oldest at top, like a real terminal
}

/** Headline metrics. Honest about which are derived and which are still mock. */
export function eventsToMetrics(events: RosterEvent[]) {
  const agents = new Set(events.map((e) => e.sub_agent || "HQ"));
  const spawned = events.filter((e) => e.decision === "spawn_new").length;
  const approvals = events.filter((e) => e.decision === "spawn_new");
  return {
    activeAgents: agents.size,
    tasksCompleted: events.length,
    // Spawning a new agent is the closest real proxy for "a human had to weigh in".
    interventionRate: events.length ? Math.round((spawned / events.length) * 100) : 0,
    pendingApprovals: approvals.length,
  };
}

/* --------------------------------- fallback -------------------------------- */

export type RosterSnapshot = {
  profile: TeamProfile | null;
  events: RosterEvent[];
  operations: Operation[];
  agents: AgentNode[];
  activity: ActivityItem[];
  terminal: string[];
  metrics: ReturnType<typeof eventsToMetrics>;
  /**
   * Roster answered. TRUE even with zero events — an empty company is real data.
   * When this is false the dashboard is showing sample data because the backend
   * could not be reached.
   */
  reachable: boolean;
  /** Roster answered AND has at least one event. */
  live: boolean;
};

const EMPTY_METRICS = { activeAgents: 0, tasksCompleted: 0, interventionRate: 0, pendingApprovals: 0 };

export const MOCK_SNAPSHOT: RosterSnapshot = {
  profile: null,
  events: [],
  operations: MOCK_OPERATIONS,
  agents: [],
  activity: [],
  terminal: [],
  metrics: { activeAgents: 12, tasksCompleted: 1284, interventionRate: 8, pendingApprovals: 3 },
  reachable: false,
  live: false,
};

/** One call for everything the dashboard needs. Never throws. */
export async function fetchSnapshot(): Promise<RosterSnapshot> {
  const [profile, events] = await Promise.all([fetchProfile(), fetchEvents()]);

  // Unreachable — keep the sample data so the dashboard doesn't look broken.
  if (events === null) return { ...MOCK_SNAPSHOT, profile };

  // Reachable but empty: the company genuinely has nobody in it yet. Render that
  // honestly rather than inventing a workforce.
  if (events.length === 0) {
    return {
      profile,
      events: [],
      operations: [],
      agents: [],
      activity: [],
      terminal: [],
      metrics: EMPTY_METRICS,
      reachable: true,
      live: false,
    };
  }

  return {
    profile,
    events,
    operations: eventsToOperations(events),
    agents: eventsToAgents(events),
    activity: eventsToActivity(events),
    terminal: eventsToTerminal(events),
    metrics: eventsToMetrics(events),
    reachable: true,
    live: true,
  };
}
